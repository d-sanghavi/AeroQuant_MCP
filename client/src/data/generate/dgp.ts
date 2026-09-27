/**
 * The fare data-generating process.
 *
 * This file is the foundation of the whole prototype, and the one place where a
 * shortcut would be fatal. Two properties have to hold, and both are asserted by the
 * diagnostics this module returns:
 *
 *  1. Log fare is built ADDITIVELY from named components, so attribution has a ground
 *     truth to recover and the hedonic model has real characteristics to price.
 *
 *  2. The COMPOSITION of the sample drifts over the window - the collector gradually
 *     over-samples short booking horizons, full-service carriers and premium cabins,
 *     exactly as opportunistic collection would. This is not decoration. It is the
 *     entire reason the Method Lab has something to show: the naive mean of scraped
 *     fares rises faster than the constant-quality index, because the basket changed,
 *     not because the prices did.
 *
 * If the Method Lab ever shows the two lines on top of each other, the bug is here -
 * in COMPOSITION_DRIFT below - and not in the chart.
 */

import { hash32, makeNormal, makeStudentT, streamFor, weightedIndex, type Rng } from '@/lib/rng'
import { AIRLINES, CABIN_EFFECT, FARE_FAMILY, type Cabin, type FareFamily } from '../master/airlines'
import {
  COLLECTION_DAYS,
  DOW_EFFECT,
  CALENDAR,
  PERIODS,
  PERIOD_INDEX,
  type CalendarDay,
} from '../master/calendar'
import { HORIZONS, ROUTES, ROUTE_WEIGHTS } from '../master/routes'
import { FARE_SOURCES } from '../master/sources'
import { ATF_NATIONAL, ATF_REFERENCE, EXT_INDEX } from './economics'
import { eventEffectAt } from './events'

// ---------------------------------------------------------------------------
// Model constants. Every one of these is a modelling decision, so it is named,
// commented and exported rather than buried as a literal in the loop below.
// ---------------------------------------------------------------------------

/** ln(fare) intercept, calibrated so DEL-BOM economy saver at T-30 lands near Rs 5,500. */
export const BASE_LOG_INTERCEPT = 3.546
/** Distance elasticity. Below 1 because fixed costs per departure dominate short sectors. */
export const DISTANCE_ELASTICITY = 0.72
/** Underlying real price trend, per month, in logs. ~+0.5%/month, ~6.2% a year. */
export const TREND_PER_MONTH = 0.005
/** Fuel pass-through, asymmetric: cost increases reach fares faster than decreases. */
export const FUEL_BETA_UP = 0.3
export const FUEL_BETA_DOWN = 0.19
/** Capacity elasticity of fare. More seats, lower fare. */
export const CAPACITY_ELASTICITY = -0.6
/** AR(1) persistence of the route demand shock. */
export const DEMAND_PHI = 0.82
export const DEMAND_SIGMA = 0.035

/**
 * Strength of the collection-composition drift. See the file header.
 * `horizon` tilts sampling toward short booking horizons over the window;
 * `fsc` tilts it toward full-service carriers; `premium` toward premium cabins.
 * Raising these widens the naive-vs-constant-quality gap in the Method Lab.
 */
export const COMPOSITION_DRIFT = {
  horizon: 1.05,
  fsc: 0.75,
  premium: 0.7,
} as const

/** Monthly seasonal effect on log fare, centred to mean zero. */
const SEASONAL_RAW = [
  0.045, -0.03, -0.02, 0.03, 0.075, 0.06, -0.045, -0.055, -0.06, 0.04, 0.055, 0.07,
]
const SEASONAL_MEAN = SEASONAL_RAW.reduce((a, b) => a + b, 0) / 12
export const SEASONAL_EFFECT = SEASONAL_RAW.map((x) => x - SEASONAL_MEAN)

/**
 * Booking-horizon effect on log fare, centred at T-30.
 *
 * Shape: essentially flat beyond 30 days, convex and steep inside 15 - the classic
 * revenue-management fence structure. This is also the curve the Term Structure Lab
 * fits Nelson-Siegel to, so it needs a genuine level / slope / curvature structure
 * rather than a monotone ramp.
 */
function horizonRaw(h: number): number {
  return 0.95 * Math.exp(-h / 8.5) + 0.055 * Math.pow(h / 90, 1.5)
}
const HORIZON_CENTRE = horizonRaw(30)
export function horizonEffect(h: number): number {
  return horizonRaw(h) - HORIZON_CENTRE
}

/**
 * Time variation in the SHAPE of the horizon curve.
 *
 * Without this the term structure is a fixed curve that only moves up and down, and a
 * PCA of it recovers exactly one factor - level - with everything else being sampling
 * noise. That would be a dishonest Term Structure Lab: it would display slope and
 * curvature factors that the data does not contain.
 *
 * Revenue management genuinely does vary over the year. The last-minute premium is
 * steeper when the aircraft is already full, so the short-end factor loads with
 * seasonal demand; and the mid-horizon fence (the 20-40 day window where advance
 * purchase rules bite) moves independently of it. Those are the slope and curvature
 * factors, and they are generated as mean-zero series so the AVERAGE curve is still
 * the one `horizonEffect` describes.
 */
export const SLOPE_FACTOR_SD = 0.16
export const CURVATURE_FACTOR_SD = 0.1

/** Loading of the slope factor on a horizon: concentrated at the short end. */
function slopeLoading(h: number): number {
  return Math.exp(-h / 8.5)
}
/** Loading of the curvature factor: positive in the middle, negative at both ends. */
function curvatureLoading(h: number): number {
  return Math.exp(-h / 28) - Math.exp(-h / 7)
}
const SLOPE_CENTRE = slopeLoading(30)
const CURVATURE_CENTRE = curvatureLoading(30)

export const CABINS: readonly Cabin[] = ['economy', 'premium', 'business']
export const FAMILIES: readonly FareFamily[] = ['saver', 'flexi', 'corporate']

// ---------------------------------------------------------------------------
// Output shapes. Columnar (structure-of-arrays) because half a million rows of
// JavaScript objects would cost ~200MB and make every pass over the panel a
// pointer chase. Typed arrays also transfer out of the worker for free.
// ---------------------------------------------------------------------------

export interface Panel {
  readonly n: number
  readonly routeIdx: Uint8Array
  readonly airlineIdx: Uint8Array
  readonly horizonIdx: Uint8Array
  readonly cabinIdx: Uint8Array
  readonly familyIdx: Uint8Array
  readonly stops: Uint8Array
  readonly sourceIdx: Uint8Array
  /** Index into COLLECTION_DAYS - when the price was observed. Assigns the period. */
  readonly collectDay: Uint16Array
  /** Index into CALENDAR - when the flight departs. */
  readonly departDay: Uint16Array
  readonly periodIdx: Uint8Array
  readonly productIdx: Int32Array
  readonly fare: Float32Array
  readonly logFare: Float32Array
  readonly seats: Uint16Array
}

export interface ProductDef {
  readonly id: string
  readonly routeIdx: number
  readonly airlineIdx: number
  readonly horizonIdx: number
  readonly cabinIdx: number
  readonly familyIdx: number
  readonly stops: number
}

/**
 * The product x period cube. Every index method in lib/quant consumes this and
 * nothing else, which is what guarantees that the Method Lab really is comparing
 * methods on identical data rather than comparing different filters.
 */
export interface Cube {
  readonly nProducts: number
  readonly nPeriods: number
  readonly count: Int32Array
  readonly sumLog: Float64Array
  readonly sumFare: Float64Array
  /** Quantity proxy = route passenger weight x observation count. */
  readonly quantity: Float64Array
}

export interface CompositionStat {
  readonly period: string
  readonly obsCount: number
  readonly shortHorizonShare: number
  readonly fscShare: number
  readonly premiumShare: number
  readonly meanHorizonDays: number
  readonly meanLogFare: number
}

export interface ComponentStat {
  readonly period: string
  readonly fuel: number
  readonly capacity: number
  readonly demand: number
  readonly seasonal: number
  readonly event: number
  readonly trend: number
  /** Booking-horizon effect, including its time-varying slope and curvature. */
  readonly termStructure: number
  readonly residual: number
}

export interface Dataset {
  readonly seed: number
  readonly generatedAtMs: number
  readonly panel: Panel
  readonly products: readonly ProductDef[]
  readonly cube: Cube
  readonly periods: readonly string[]
  readonly composition: readonly CompositionStat[]
  readonly components: readonly ComponentStat[]
  /** Share of (product, period) cells with no observation at all. */
  readonly cellMissingRate: number
  /** Share of attempted (route, day, horizon) collections that returned nothing. */
  readonly collectionMissRate: number
  readonly routeDemand: Float32Array
  readonly routeSeats: Uint16Array
}

export interface GenerateOptions {
  readonly seed?: number
  readonly onProgress?: (fraction: number, label: string) => void
}

// ---------------------------------------------------------------------------

/** Cabins a carrier can sell. Keeps the product space honest. */
function cabinsFor(airlineIdx: number): number[] {
  const a = AIRLINES[airlineIdx]!
  return a.cabins.map((c) => CABINS.indexOf(c))
}

/** Stops are a property of the route/carrier pair, not a per-quote coin flip. */
function stopsFor(routeIdx: number, airlineIdx: number): number {
  const r = ROUTES[routeIdx]!
  const a = AIRLINES[airlineIdx]!
  if (a.model === 'Regional' && r.distanceKm > 900) return 1
  if (r.distanceKm > 1800 && a.model === 'LCC' && hash32(`${r.id}${a.code}`) % 3 === 0) return 1
  return 0
}

/**
 * Product key packed into a single integer. The generator resolves a product several
 * hundred thousand times; building a template-literal key each time was measurably the
 * second-largest cost in the loop, so the key is arithmetic and the table is flat.
 */
const K_AIRLINE = AIRLINES.length
const K_HORIZON = HORIZONS.length
const K_CABIN = 3
const K_FAMILY = 3
const PRODUCT_KEY_SPACE =
  ROUTES.length * K_AIRLINE * K_HORIZON * K_CABIN * K_FAMILY

export function productKey(
  ri: number, ai: number, hi: number, ci: number, fi: number,
): number {
  return ((((ri * K_AIRLINE + ai) * K_HORIZON + hi) * K_CABIN + ci) * K_FAMILY) + fi
}

function buildProducts(): { products: ProductDef[]; lookup: Int32Array } {
  const products: ProductDef[] = []
  const lookup = new Int32Array(PRODUCT_KEY_SPACE).fill(-1)
  for (let ri = 0; ri < ROUTES.length; ri++) {
    const r = ROUTES[ri]!
    for (const code of r.servingAirlines) {
      const ai = AIRLINES.findIndex((a) => a.code === code)
      if (ai < 0) continue
      const stops = stopsFor(ri, ai)
      for (let hi = 0; hi < HORIZONS.length; hi++) {
        for (const ci of cabinsFor(ai)) {
          for (let fi = 0; fi < FAMILIES.length; fi++) {
            const id = `${r.id}|${code}|${HORIZONS[hi]}|${CABINS[ci]}|${FAMILIES[fi]}`
            lookup[productKey(ri, ai, hi, ci, fi)] = products.length
            products.push({
              id,
              routeIdx: ri,
              airlineIdx: ai,
              horizonIdx: hi,
              cabinIdx: ci,
              familyIdx: fi,
              stops,
            })
          }
        }
      }
    }
  }
  return { products, lookup }
}

/** Shortness in [0,1]: 1 at T-1, 0 at T-90. Drives the composition drift. */
const SHORTNESS = HORIZONS.map((h) => (90 - h) / 89)

export function generateDataset(opts: GenerateOptions = {}): Dataset {
  const seed = opts.seed ?? 26056
  const progress = opts.onProgress ?? (() => {})
  const startedAt = Date.now()

  const { products, lookup: productLookup } = buildProducts()
  const nProducts = products.length
  const nPeriods = PERIODS.length
  const nDays = COLLECTION_DAYS.length

  progress(0.02, `Building ${nProducts.toLocaleString('en-IN')} elementary products`)

  // --- exogenous per-route state -------------------------------------------
  // AR(1) demand shock indexed by CALENDAR day (departure date), one path per route.
  const routeDemand = new Float32Array(ROUTES.length * CALENDAR.length)
  for (let ri = 0; ri < ROUTES.length; ri++) {
    const rng = streamFor(seed, `demand-${ROUTES[ri]!.id}`)
    const normal = makeNormal(rng)
    let x = 0
    for (let d = 0; d < CALENDAR.length; d++) {
      x = DEMAND_PHI * x + DEMAND_SIGMA * normal()
      routeDemand[ri * CALENDAR.length + d] = x
    }
  }

  progress(0.08, 'Simulating route demand shocks')

  // Event effect per route-day, computed ONCE. eventEffect parses ISO dates, and the
  // main loop would otherwise call it ~400k times; precomputing 60 x 823 cells turns
  // the hot path into two array reads.
  const nCal = CALENDAR.length
  const eventLog = new Float32Array(ROUTES.length * nCal)
  const eventCapLoss = new Float32Array(ROUTES.length * nCal)
  for (let ri = 0; ri < ROUTES.length; ri++) {
    const r = ROUTES[ri]!
    for (let d = 0; d < nCal; d++) {
      const ev = eventEffectAt(r.origin, r.destination, d)
      eventLog[ri * nCal + d] = ev.logEffect
      eventCapLoss[ri * nCal + d] = ev.capacityLoss
    }
    if (ri % 10 === 0) progress(0.08 + 0.06 * (ri / ROUTES.length), 'Resolving disruption events')
  }

  // Seats offered per route-day, after seasonal capacity and event withdrawal.
  const routeSeats = new Uint16Array(ROUTES.length * nCal)
  for (let ri = 0; ri < ROUTES.length; ri++) {
    const r = ROUTES[ri]!
    const rng = streamFor(seed, `seats-${r.id}`)
    const normal = makeNormal(rng)
    for (let d = 0; d < nCal; d++) {
      const cal = CALENDAR[d]!
      const seasonalCap = 1 + 0.06 * SEASONAL_EFFECT[cal.month - 1]! * 8
      const s =
        r.baseSeatsPerDay *
        seasonalCap *
        (1 - eventCapLoss[ri * nCal + d]!) *
        (1 + 0.04 * normal())
      routeSeats[ri * nCal + d] = Math.max(60, Math.round(s))
    }
    if (ri % 12 === 0) progress(0.14 + 0.06 * (ri / ROUTES.length), 'Modelling capacity')
  }
  progress(0.2, 'Capacity and disruption effects applied')

  // Term-structure shape factors, one value per CALENDAR day. Seasonal component plus
  // a persistent idiosyncratic part, both centred so the mean curve is unchanged.
  const slopeRng = streamFor(seed, 'ts-slope')
  const curveRng = streamFor(seed, 'ts-curve')
  const slopeNormal = makeNormal(slopeRng)
  const curveNormal = makeNormal(curveRng)
  const slopeFactor = new Float64Array(nCal)
  const curvatureFactor = new Float64Array(nCal)
  {
    let s = 0
    let k = 0
    for (let d = 0; d < nCal; d++) {
      const cal = CALENDAR[d]!
      // Fast-reverting idiosyncratic part (half-life ~4 days). It has to average out
      // within a month: a persistent common shape factor would survive into the
      // year-on-year rate and swamp the trend, and no amount of index methodology
      // can recover a signal the generator has buried.
      s = 0.85 * s + 0.5 * slopeNormal()
      k = 0.85 * k + 0.5 * curveNormal()
      // The dominant part is seasonal, and therefore cancels in a year-on-year
      // comparison - which is exactly how revenue-management intensity behaves.
      // Only the MONTHLY seasonal, deliberately. Festival pressure is not added here:
      // Indian festivals move by weeks between years, so a festival-driven shape
      // factor would not cancel in a year-on-year comparison, and it would do so in a
      // way that is indistinguishable from a price change. The festival effect stays
      // where it belongs - on the fare level, not on the shape of the horizon curve.
      const seasonalSlope = SEASONAL_EFFECT[cal.month - 1]! * 3
      // Curvature runs at a different phase: the mid-horizon advance-purchase fence
      // tightens ahead of the peak rather than during it.
      const seasonalCurve = Math.sin((2 * Math.PI * (cal.month - 1)) / 12) * 0.85
      slopeFactor[d] = SLOPE_FACTOR_SD * (0.3 * s + seasonalSlope)
      curvatureFactor[d] = CURVATURE_FACTOR_SD * (0.35 * k + seasonalCurve)
    }
    // Centre both so the average term structure is exactly horizonEffect().
    let ms = 0
    let mk = 0
    for (let d = 0; d < nCal; d++) { ms += slopeFactor[d]!; mk += curvatureFactor[d]! }
    ms /= nCal; mk /= nCal
    for (let d = 0; d < nCal; d++) { slopeFactor[d] -= ms; curvatureFactor[d] -= mk }
  }

  // Precompute the full horizon effect per (day, horizon): 823 x 9 doubles.
  const horizonByDay = new Float64Array(nCal * HORIZONS.length)
  for (let d = 0; d < nCal; d++) {
    for (let hi = 0; hi < HORIZONS.length; hi++) {
      const h = HORIZONS[hi]!
      horizonByDay[d * HORIZONS.length + hi] =
        horizonEffect(h) +
        slopeFactor[d]! * (slopeLoading(h) - SLOPE_CENTRE) +
        curvatureFactor[d]! * (curvatureLoading(h) - CURVATURE_CENTRE)
    }
  }

  // Cabin options and stops are properties of the (route, carrier) pair, not of a
  // quote. Resolve them once rather than allocating inside the quote loop.
  const pairCabins: number[][] = []
  const pairStops = new Uint8Array(ROUTES.length * AIRLINES.length)
  for (let ri = 0; ri < ROUTES.length; ri++) {
    for (let ai = 0; ai < AIRLINES.length; ai++) {
      pairCabins[ri * AIRLINES.length + ai] = cabinsFor(ai)
      pairStops[ri * AIRLINES.length + ai] = stopsFor(ri, ai)
    }
  }

  // Fuel pass-through per collection period (cost at the time of pricing).
  const fuelTerm = new Float64Array(nPeriods)
  for (let t = 0; t < nPeriods; t++) {
    const period = PERIODS[t]!
    const ei = EXT_INDEX.get(period)!
    // Weighted 1- and 2-month lag; airlines re-price with a delay.
    const lagged =
      0.6 * ATF_NATIONAL.values[ei - 1]! + 0.4 * ATF_NATIONAL.values[ei - 2]!
    const rel = Math.log(lagged / ATF_REFERENCE)
    fuelTerm[t] = (rel >= 0 ? FUEL_BETA_UP : FUEL_BETA_DOWN) * rel
  }

  // --- sizing pass ----------------------------------------------------------
  // Upper bound on observations so the typed arrays are allocated once.
  const capacity = Math.ceil(ROUTES.length * nDays * HORIZONS.length * 1.45)

  const routeIdx = new Uint8Array(capacity)
  const airlineIdx = new Uint8Array(capacity)
  const horizonIdx = new Uint8Array(capacity)
  const cabinIdx = new Uint8Array(capacity)
  const familyIdx = new Uint8Array(capacity)
  const stopsArr = new Uint8Array(capacity)
  const sourceIdx = new Uint8Array(capacity)
  const collectDay = new Uint16Array(capacity)
  const departDay = new Uint16Array(capacity)
  const periodIdxArr = new Uint8Array(capacity)
  const productIdxArr = new Int32Array(capacity)
  const fareArr = new Float32Array(capacity)
  const logFareArr = new Float32Array(capacity)
  const seatsArr = new Uint16Array(capacity)

  const count = new Int32Array(nProducts * nPeriods)
  const sumLog = new Float64Array(nProducts * nPeriods)
  const sumFare = new Float64Array(nProducts * nPeriods)
  const quantity = new Float64Array(nProducts * nPeriods)

  // Composition accumulators.
  const cObs = new Float64Array(nPeriods)
  const cShort = new Float64Array(nPeriods)
  const cFsc = new Float64Array(nPeriods)
  const cPremium = new Float64Array(nPeriods)
  const cHorizonDays = new Float64Array(nPeriods)
  const cLogFare = new Float64Array(nPeriods)

  // Component accumulators (mean log contribution per period).
  const kFuel = new Float64Array(nPeriods)
  const kCap = new Float64Array(nPeriods)
  const kDem = new Float64Array(nPeriods)
  const kSea = new Float64Array(nPeriods)
  const kEvt = new Float64Array(nPeriods)
  const kTrend = new Float64Array(nPeriods)
  const kShape = new Float64Array(nPeriods)
  const kResid = new Float64Array(nPeriods)

  const sourceWeightsRaw = FARE_SOURCES.map((s) => s.observationShare)

  const rng: Rng = streamFor(seed, 'panel')
  const tdist = makeStudentT(rng, 6)

  // Precompute per-route base log fare, and a CALENDAR index by date.
  const calIndexByDate = new Map<string, number>()
  for (let i = 0; i < CALENDAR.length; i++) calIndexByDate.set(CALENDAR[i]!.date, i)

  const routeBaseLog = ROUTES.map(
    (r) => BASE_LOG_INTERCEPT + DISTANCE_ELASTICITY * Math.log(r.distanceKm),
  )
  const routeWeightArr = ROUTES.map((r) => ROUTE_WEIGHTS.get(r.id)!)

  let n = 0
  let attempted = 0
  let missed = 0

  const tDenom = Math.max(1, nDays - 1)

  for (let d = 0; d < nDays; d++) {
    const cday = COLLECTION_DAYS[d]!
    const t = PERIOD_INDEX.get(cday.period)!
    const tbar = d / tDenom
    const monthsElapsed = t

    // Drift multipliers for this point in the window.
    const horizonTilt = COMPOSITION_DRIFT.horizon * tbar
    const fscTilt = Math.exp(COMPOSITION_DRIFT.fsc * tbar)
    const premiumTilt = Math.exp(COMPOSITION_DRIFT.premium * tbar)

    for (let ri = 0; ri < ROUTES.length; ri++) {
      const r = ROUTES[ri]!
      const paxK = r.paxPerMonth / 1000
      // Bigger routes are quoted more often; thin routes are genuinely sparse.
      const lambdaBase = paxK >= 150 ? 1.5 : paxK >= 70 ? 1.25 : paxK >= 40 ? 1.05 : 0.82

      // Airline sampling weights for this collection day, tilted toward FSC over time.
      const serving = r.servingAirlines
      const airlineWeights: number[] = []
      const airlineIdxs: number[] = []
      for (const code of serving) {
        const ai = AIRLINES.findIndex((a) => a.code === code)
        if (ai < 0) continue
        const a = AIRLINES[ai]!
        airlineIdxs.push(ai)
        airlineWeights.push(a.share * (a.model === 'FSC' ? fscTilt : 1))
      }
      if (airlineIdxs.length === 0) continue

      for (let hi = 0; hi < HORIZONS.length; hi++) {
        const h = HORIZONS[hi]!
        const departIdx = d + h
        if (departIdx >= CALENDAR.length) continue
        const dep = CALENDAR[departIdx]!

        attempted++

        // Non-random missingness: thin routes and long horizons fail more, and long
        // horizons fail increasingly often as collection drifts toward the near term.
        const missProb =
          0.018 +
          (paxK < 45 ? 0.055 : paxK < 90 ? 0.022 : 0.006) +
          (h >= 60 ? 0.02 : 0) +
          0.035 * tbar * (1 - SHORTNESS[hi]!)
        if (rng() < missProb) {
          missed++
          continue
        }

        // Expected quotes for this cell, tilted toward short horizons over the window.
        const lambda = lambdaBase * Math.exp(horizonTilt * (SHORTNESS[hi]! - 0.5))
        let nQuotes = Math.floor(lambda)
        if (rng() < lambda - nQuotes) nQuotes++
        if (nQuotes === 0) continue

        const seats = routeSeats[ri * nCal + departIdx]!
        const demand = routeDemand[ri * nCal + departIdx]!
        const evLog = eventLog[ri * nCal + departIdx]!

        const capTerm =
          CAPACITY_ELASTICITY * Math.log(seats / r.baseSeatsPerDay)
        const seaTerm = SEASONAL_EFFECT[dep.month - 1]! + dep.festivalPressure
        const dowTerm = DOW_EFFECT[dep.dow]!
        const trendTerm = TREND_PER_MONTH * monthsElapsed
        const fuel = fuelTerm[t]!

        for (let q = 0; q < nQuotes; q++) {
          const heTotal = horizonByDay[departIdx * HORIZONS.length + hi]!
          const ai = airlineIdxs[weightedIndex(rng, airlineWeights)]!
          const a = AIRLINES[ai]!

          // Cabin: premium share rises over the window (composition drift).
          const cabinOptions = pairCabins[ri * AIRLINES.length + ai]!
          let ci = cabinOptions[0]!
          if (cabinOptions.length > 1) {
            const w = cabinOptions.map((c) =>
              c === 0 ? 1 : c === 1 ? 0.13 * premiumTilt : 0.05 * premiumTilt,
            )
            ci = cabinOptions[weightedIndex(rng, w)]!
          }

          // Fare family: saver dominates, flexi and corporate are thinner.
          const fi = weightedIndex(rng, [1, 0.24, 0.1])
          const fam = FAMILIES[fi]!
          const stops = pairStops[ri * AIRLINES.length + ai]!

          const resid = (0.06 + 0.1 * Math.exp(-h / 12)) * tdist()

          const logFare =
            routeBaseLog[ri]! +
            heTotal +
            a.logFareEffect +
            CABIN_EFFECT[CABINS[ci]!]! +
            FARE_FAMILY[fam].logFareEffect +
            (stops === 1 ? -0.065 : 0) +
            dowTerm +
            seaTerm +
            trendTerm +
            fuel +
            capTerm +
            demand +
            evLog +
            resid

          const fare = Math.exp(logFare)
          const pi = productLookup[productKey(ri, ai, hi, ci, fi)]!
          if (pi < 0) continue

          const si = weightedIndex(rng, sourceWeightsRaw)

          routeIdx[n] = ri
          airlineIdx[n] = ai
          horizonIdx[n] = hi
          cabinIdx[n] = ci
          familyIdx[n] = fi
          stopsArr[n] = stops
          sourceIdx[n] = si
          collectDay[n] = d
          departDay[n] = departIdx
          periodIdxArr[n] = t
          productIdxArr[n] = pi
          fareArr[n] = fare
          logFareArr[n] = logFare
          seatsArr[n] = seats
          n++

          const cell = pi * nPeriods + t
          count[cell]++
          sumLog[cell] += logFare
          sumFare[cell] += fare
          quantity[cell] += routeWeightArr[ri]!

          cObs[t]++
          if (h <= 7) cShort[t]++
          if (a.model === 'FSC') cFsc[t]++
          if (ci > 0) cPremium[t]++
          cHorizonDays[t] += h
          cLogFare[t] += logFare

          kFuel[t] += fuel
          kCap[t] += capTerm
          kDem[t] += demand
          kSea[t] += seaTerm + dowTerm
          kEvt[t] += evLog
          kTrend[t] += trendTerm
          kShape[t] += heTotal
          kResid[t] += resid

          if (n >= capacity) break
        }
        if (n >= capacity) break
      }
      if (n >= capacity) break
    }

    if (d % 24 === 0) {
      progress(0.2 + 0.68 * (d / nDays), `Generating quotes - ${cday.period}`)
    }
    if (n >= capacity) break
  }

  progress(0.92, 'Aggregating the product cube')

  const composition: CompositionStat[] = PERIODS.map((period, t) => {
    const obs = cObs[t]! || 1
    return {
      period,
      obsCount: cObs[t]!,
      shortHorizonShare: cShort[t]! / obs,
      fscShare: cFsc[t]! / obs,
      premiumShare: cPremium[t]! / obs,
      meanHorizonDays: cHorizonDays[t]! / obs,
      meanLogFare: cLogFare[t]! / obs,
    }
  })

  const components: ComponentStat[] = PERIODS.map((period, t) => {
    const obs = cObs[t]! || 1
    return {
      period,
      fuel: kFuel[t]! / obs,
      capacity: kCap[t]! / obs,
      demand: kDem[t]! / obs,
      seasonal: kSea[t]! / obs,
      event: kEvt[t]! / obs,
      trend: kTrend[t]! / obs,
      termStructure: kShape[t]! / obs,
      residual: kResid[t]! / obs,
    }
  })

  let emptyCells = 0
  for (let i = 0; i < count.length; i++) if (count[i] === 0) emptyCells++

  progress(1, 'Dataset ready')

  return {
    seed,
    generatedAtMs: Date.now() - startedAt,
    panel: {
      n,
      routeIdx: routeIdx.subarray(0, n),
      airlineIdx: airlineIdx.subarray(0, n),
      horizonIdx: horizonIdx.subarray(0, n),
      cabinIdx: cabinIdx.subarray(0, n),
      familyIdx: familyIdx.subarray(0, n),
      stops: stopsArr.subarray(0, n),
      sourceIdx: sourceIdx.subarray(0, n),
      collectDay: collectDay.subarray(0, n),
      departDay: departDay.subarray(0, n),
      periodIdx: periodIdxArr.subarray(0, n),
      productIdx: productIdxArr.subarray(0, n),
      fare: fareArr.subarray(0, n),
      logFare: logFareArr.subarray(0, n),
      seats: seatsArr.subarray(0, n),
    },
    products,
    cube: { nProducts, nPeriods, count, sumLog, sumFare, quantity },
    periods: PERIODS,
    composition,
    components,
    cellMissingRate: emptyCells / count.length,
    collectionMissRate: attempted === 0 ? 0 : missed / attempted,
    routeDemand,
    routeSeats,
  }
}

export const SOURCE_IDS = FARE_SOURCES.map((s) => s.id)

/** Helper for screens that need a CalendarDay from a panel column value. */
export function calendarDay(i: number): CalendarDay {
  return CALENDAR[i]!
}
