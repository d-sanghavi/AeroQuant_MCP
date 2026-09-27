/**
 * Turning the raw panel into the product x period matrix every index method consumes.
 *
 * This is the single point where a filter is applied. Every screen that narrows the
 * data - a date range, a route selection, "disable all scraped sources" - does it by
 * passing a CubeFilter here, which guarantees that all six methods in the Method Lab
 * see exactly the same subset. If filtering happened per-method the comparison would
 * be meaningless, and the failure would be invisible.
 */

import { AIRLINES } from './master/airlines'
import { CALENDAR, PERIODS } from './master/calendar'
import { HORIZONS, ROUTES } from './master/routes'
import { FARE_SOURCES } from './master/sources'
import type { Dataset } from './generate/dgp'
import type { PriceMatrix } from '@/lib/quant/types'

export interface CubeFilter {
  /** Inclusive period index range within PERIODS. */
  readonly periodFrom?: number
  readonly periodTo?: number
  /** Exclude every source flagged isScraped. The compliance demonstration. */
  readonly disableScraped?: boolean
  /** Restrict to these route ids. Undefined means all. */
  readonly routeIds?: readonly string[]
  /** Restrict to these booking horizons in days. */
  readonly horizons?: readonly number[]
  readonly airlineCodes?: readonly string[]
  /** Restrict to a cabin index (0 economy, 1 premium, 2 business). */
  readonly cabins?: readonly number[]
}

export interface PeriodStats {
  readonly period: string
  readonly n: number
  /** Arithmetic mean of fares - the naive comparator. */
  readonly meanFare: number
  readonly medianFare: number
  readonly geomeanFare: number
  readonly p10: number
  readonly p90: number
  readonly shortHorizonShare: number
  readonly fscShare: number
  readonly premiumShare: number
  readonly meanHorizonDays: number
}

export interface CubeResult {
  readonly matrix: PriceMatrix
  /** Route index per product, for clustering and route-level aggregation. */
  readonly productRoute: Int32Array
  readonly periodStats: PeriodStats[]
  /** Observations that passed the filter. */
  readonly nObservations: number
  /** Observations excluded by the filter. */
  readonly nExcluded: number
  readonly filter: CubeFilter
  readonly sourcesUsed: string[]
}

function quantileSorted(xs: Float64Array, q: number): number {
  const n = xs.length
  if (n === 0) return NaN
  if (n === 1) return xs[0]!
  const h = (n - 1) * q
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  return xs[lo]! + (h - lo) * (xs[hi]! - xs[lo]!)
}

export function buildCube(ds: Dataset, filter: CubeFilter = {}): CubeResult {
  const nPeriodsAll = PERIODS.length
  const from = Math.max(0, filter.periodFrom ?? 0)
  const to = Math.min(nPeriodsAll - 1, filter.periodTo ?? nPeriodsAll - 1)
  const nPeriods = to - from + 1
  const nProducts = ds.products.length

  // --- resolve the filter into fast index lookups --------------------------
  const routeAllowed = new Uint8Array(ROUTES.length).fill(1)
  if (filter.routeIds && filter.routeIds.length > 0) {
    routeAllowed.fill(0)
    const wanted = new Set(filter.routeIds)
    for (let i = 0; i < ROUTES.length; i++) if (wanted.has(ROUTES[i]!.id)) routeAllowed[i] = 1
  }

  const horizonAllowed = new Uint8Array(HORIZONS.length).fill(1)
  if (filter.horizons && filter.horizons.length > 0) {
    horizonAllowed.fill(0)
    const wanted = new Set(filter.horizons)
    for (let i = 0; i < HORIZONS.length; i++) if (wanted.has(HORIZONS[i]!)) horizonAllowed[i] = 1
  }

  const airlineAllowed = new Uint8Array(AIRLINES.length).fill(1)
  if (filter.airlineCodes && filter.airlineCodes.length > 0) {
    airlineAllowed.fill(0)
    const wanted = new Set(filter.airlineCodes)
    for (let i = 0; i < AIRLINES.length; i++) if (wanted.has(AIRLINES[i]!.code)) airlineAllowed[i] = 1
  }

  const cabinAllowed = new Uint8Array(3).fill(1)
  if (filter.cabins && filter.cabins.length > 0) {
    cabinAllowed.fill(0)
    for (const c of filter.cabins) if (c >= 0 && c < 3) cabinAllowed[c] = 1
  }

  const sourceAllowed = new Uint8Array(FARE_SOURCES.length).fill(1)
  const sourcesUsed: string[] = []
  for (let i = 0; i < FARE_SOURCES.length; i++) {
    const s = FARE_SOURCES[i]!
    const ok = s.enabled && !(filter.disableScraped && s.isScraped)
    sourceAllowed[i] = ok ? 1 : 0
    if (ok) sourcesUsed.push(s.id)
  }

  // --- pass 1: accumulate the cube and the period aggregates ---------------
  const count = new Int32Array(nProducts * nPeriods)
  const sumLog = new Float64Array(nProducts * nPeriods)
  const sumFare = new Float64Array(nProducts * nPeriods)
  const quantity = new Float64Array(nProducts * nPeriods)

  const pN = new Int32Array(nPeriods)
  const pSum = new Float64Array(nPeriods)
  const pSumLog = new Float64Array(nPeriods)
  const pShort = new Int32Array(nPeriods)
  const pFsc = new Int32Array(nPeriods)
  const pPremium = new Int32Array(nPeriods)
  const pHorizonDays = new Float64Array(nPeriods)

  const { panel } = ds
  const n = panel.n
  let kept = 0

  const isFsc = AIRLINES.map((a) => (a.model === 'FSC' ? 1 : 0))
  const routeWeightOf = ROUTES.map((r) => r.paxPerMonth)
  let totalPax = 0
  for (const w of routeWeightOf) totalPax += w

  for (let i = 0; i < n; i++) {
    const t = panel.periodIdx[i]!
    if (t < from || t > to) continue
    const ri = panel.routeIdx[i]!
    if (!routeAllowed[ri]) continue
    const hi = panel.horizonIdx[i]!
    if (!horizonAllowed[hi]) continue
    const ai = panel.airlineIdx[i]!
    if (!airlineAllowed[ai]) continue
    const ci = panel.cabinIdx[i]!
    if (!cabinAllowed[ci]) continue
    if (!sourceAllowed[panel.sourceIdx[i]!]) continue

    const tt = t - from
    const cell = panel.productIdx[i]! * nPeriods + tt
    count[cell]++
    sumLog[cell] += panel.logFare[i]!
    sumFare[cell] += panel.fare[i]!
    quantity[cell] += routeWeightOf[ri]! / totalPax

    pN[tt]++
    pSum[tt] += panel.fare[i]!
    pSumLog[tt] += panel.logFare[i]!
    if (HORIZONS[hi]! <= 7) pShort[tt]++
    if (isFsc[ai]) pFsc[tt]++
    if (ci > 0) pPremium[tt]++
    pHorizonDays[tt] += HORIZONS[hi]!
    kept++
  }

  // --- pass 2: quantiles need the fares themselves -------------------------
  const buckets: Float64Array[] = []
  const fill = new Int32Array(nPeriods)
  for (let t = 0; t < nPeriods; t++) buckets.push(new Float64Array(pN[t]!))

  for (let i = 0; i < n; i++) {
    const t = panel.periodIdx[i]!
    if (t < from || t > to) continue
    const ri = panel.routeIdx[i]!
    if (!routeAllowed[ri]) continue
    const hi = panel.horizonIdx[i]!
    if (!horizonAllowed[hi]) continue
    const ai = panel.airlineIdx[i]!
    if (!airlineAllowed[ai]) continue
    const ci = panel.cabinIdx[i]!
    if (!cabinAllowed[ci]) continue
    if (!sourceAllowed[panel.sourceIdx[i]!]) continue
    const tt = t - from
    buckets[tt]![fill[tt]!] = panel.fare[i]!
    fill[tt] = fill[tt]! + 1
  }

  const periodStats: PeriodStats[] = []
  for (let t = 0; t < nPeriods; t++) {
    const b = buckets[t]!
    b.sort()
    const c = pN[t]! || 1
    periodStats.push({
      period: PERIODS[from + t]!,
      n: pN[t]!,
      meanFare: pSum[t]! / c,
      medianFare: quantileSorted(b, 0.5),
      geomeanFare: Math.exp(pSumLog[t]! / c),
      p10: quantileSorted(b, 0.1),
      p90: quantileSorted(b, 0.9),
      shortHorizonShare: pShort[t]! / c,
      fscShare: pFsc[t]! / c,
      premiumShare: pPremium[t]! / c,
      meanHorizonDays: pHorizonDays[t]! / c,
    })
  }

  // --- finalise the matrix -------------------------------------------------
  const logPrice = new Float64Array(nProducts * nPeriods).fill(NaN)
  const price = new Float64Array(nProducts * nPeriods).fill(NaN)
  for (let i = 0; i < count.length; i++) {
    const c = count[i]!
    if (c === 0) continue
    logPrice[i] = sumLog[i]! / c
    price[i] = sumFare[i]! / c
  }

  const productRoute = new Int32Array(nProducts)
  for (let i = 0; i < nProducts; i++) productRoute[i] = ds.products[i]!.routeIdx

  return {
    matrix: {
      nProducts,
      nPeriods,
      logPrice,
      price,
      count,
      quantity,
      periods: PERIODS.slice(from, to + 1),
    },
    productRoute,
    periodStats,
    nObservations: kept,
    nExcluded: n - kept,
    filter,
    sourcesUsed,
  }
}

/**
 * A sub-matrix restricted to a set of products, sharing nothing with the parent.
 * Used for per-route indices, where each route's products form their own panel.
 */
export function subMatrix(pm: PriceMatrix, productIds: readonly number[]): PriceMatrix {
  const k = productIds.length
  const T = pm.nPeriods
  const logPrice = new Float64Array(k * T)
  const price = new Float64Array(k * T)
  const count = new Int32Array(k * T)
  const quantity = new Float64Array(k * T)
  for (let a = 0; a < k; a++) {
    const src = productIds[a]! * T
    const dst = a * T
    for (let t = 0; t < T; t++) {
      logPrice[dst + t] = pm.logPrice[src + t]!
      price[dst + t] = pm.price[src + t]!
      count[dst + t] = pm.count[src + t]!
      quantity[dst + t] = pm.quantity[src + t]!
    }
  }
  return { nProducts: k, nPeriods: T, logPrice, price, count, quantity, periods: pm.periods }
}

// ---------------------------------------------------------------------------

export interface CurveMatrixResult {
  /** Rows = departure dates with a complete curve; cols = the nine horizons. */
  readonly rows: number[][]
  readonly departDays: number[]
  readonly horizons: readonly number[]
  /** Buckets dropped because at least one horizon was too thinly observed. */
  readonly incompleteDates: number
  readonly bucketDays: number
}

/**
 * The fare TERM STRUCTURE: for each departure date, mean log fare at each booking
 * horizon.
 *
 * Two details make this a usable input to PCA rather than a noisy mess:
 *
 *  - Rows are DEPARTURE dates, not collection periods. A term structure is by
 *    definition the price of the same departure quoted at different lead times; built
 *    on collection dates instead it would mix nine different flights.
 *
 *  - Each observation is demeaned by its ROUTE before averaging. Without this, a date
 *    whose T-90 quotes happen to come from long trunk routes and whose T-1 quotes come
 *    from thin short ones produces a curve shape that is pure composition. The route
 *    mean is a constant across horizons, so removing it changes the curve's level and
 *    not its shape - which is exactly the intent.
 */
export function buildCurveMatrix(
  ds: Dataset,
  filter: CubeFilter = {},
  opts: { bucketDays?: number; minPerCell?: number } = {},
): CurveMatrixResult {
  // Departure dates are bucketed (weekly by default) before the curve is formed.
  //
  // This is a signal-to-noise decision, not a smoothing convenience. A single
  // departure date has only a few dozen quotes at each horizon, so each cell carries
  // sampling noise that is INDEPENDENT across horizons - which means it spreads
  // itself evenly over all nine principal components and buries the third and fourth
  // real factors under measurement error. Averaging a week of departures cuts that
  // noise by roughly sqrt(7) while leaving the term structure, which moves on a much
  // slower timescale, untouched.
  const bucketDays = Math.max(1, opts.bucketDays ?? 7)
  const minPerCell = opts.minPerCell ?? 8
  const { panel } = ds
  const nH = HORIZONS.length

  const sourceAllowed = new Uint8Array(FARE_SOURCES.length).fill(1)
  for (let i = 0; i < FARE_SOURCES.length; i++) {
    const s = FARE_SOURCES[i]!
    sourceAllowed[i] = s.enabled && !(filter.disableScraped && s.isScraped) ? 1 : 0
  }

  const routeAllowed = new Uint8Array(ROUTES.length).fill(1)
  if (filter.routeIds && filter.routeIds.length > 0) {
    routeAllowed.fill(0)
    const wanted = new Set(filter.routeIds)
    for (let i = 0; i < ROUTES.length; i++) if (wanted.has(ROUTES[i]!.id)) routeAllowed[i] = 1
  }

  // Route mean log fare, so each observation can be expressed relative to its route.
  const routeSum = new Float64Array(ROUTES.length)
  const routeN = new Int32Array(ROUTES.length)
  for (let i = 0; i < panel.n; i++) {
    if (!sourceAllowed[panel.sourceIdx[i]!]) continue
    const ri = panel.routeIdx[i]!
    routeSum[ri] += panel.logFare[i]!
    routeN[ri]++
  }
  const routeMean = new Float64Array(ROUTES.length)
  for (let r = 0; r < ROUTES.length; r++) {
    routeMean[r] = routeN[r]! > 0 ? routeSum[r]! / routeN[r]! : 0
  }

  // Accumulate by departure day x horizon.
  // Spreading a 500k typed array into Math.max overflows the call stack, and the
  // calendar already knows how many days there are.
  const nDays = CALENDAR.length
  const nBuckets = Math.ceil(nDays / bucketDays)
  const sums = new Float64Array(nBuckets * nH)
  const counts = new Int32Array(nBuckets * nH)
  for (let i = 0; i < panel.n; i++) {
    if (!sourceAllowed[panel.sourceIdx[i]!]) continue
    const ri = panel.routeIdx[i]!
    if (!routeAllowed[ri]) continue
    const b = Math.floor(panel.departDay[i]! / bucketDays)
    const h = panel.horizonIdx[i]!
    sums[b * nH + h] += panel.logFare[i]! - routeMean[ri]!
    counts[b * nH + h]++
  }

  const rows: number[][] = []
  const departDays: number[] = []
  let incomplete = 0
  for (let b = 0; b < nBuckets; b++) {
    let complete = true
    for (let h = 0; h < nH; h++) {
      if (counts[b * nH + h]! < minPerCell) {
        complete = false
        break
      }
    }
    if (!complete) {
      incomplete++
      continue
    }
    const row: number[] = []
    for (let h = 0; h < nH; h++) row.push(sums[b * nH + h]! / counts[b * nH + h]!)
    rows.push(row)
    departDays.push(b * bucketDays)
  }

  return { rows, departDays, horizons: HORIZONS, incompleteDates: incomplete, bucketDays }
}
