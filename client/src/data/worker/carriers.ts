/**
 * Carrier breakdown.
 *
 * The Indian domestic market is six airlines, and SIH26056 asks for the compilation to
 * be traceable back to them. That makes the carrier cut more than a filter: a shift in
 * which airline is being quoted moves an unadjusted average with no fare having
 * changed, exactly as a shift in booking horizon does. So this module produces, per
 * carrier, both the constant-quality index and the naive geometric mean - and the gap
 * between them is the point.
 *
 * Everything here runs off the SAME cube the national index runs off. A product key
 * already encodes its airline, so each carrier's products are a disjoint subset of the
 * shared matrix; no second cube is built, and the carrier series therefore cannot
 * disagree with the national series about what the underlying data said.
 */

import { AIRLINES } from '../master/airlines'
import { CABINS, type Dataset } from '../generate/dgp'
import { HORIZONS, ROUTES } from '../master/routes'
import { FARE_SOURCES } from '../master/sources'
import { buildCube, subMatrix, type CubeFilter } from '../cube'
import { rygeksFews } from '@/lib/quant/multilateral'
import { rebase } from '@/lib/quant/aggregate'
import { meanYoyPct } from '@/lib/quant/pipeline'
import { quantile } from '@/lib/quant/elementary'
import { tTwoSided } from '@/lib/quant/distributions'
import type { CarrierDto, CarrierResultDto } from './protocol'
import type { TestResult } from '@/lib/quant/tests'

/**
 * A matched-pairs test of one carrier's fares against the rest of the market.
 *
 * The pairing is the whole point. Comparing IndiGo's mean fare with Air India's mean
 * fare compares two different route networks flown at two different booking-horizon
 * mixes, and the answer is mostly network, not pricing. Here the comparison is made
 * only inside cells - one (route, horizon, cabin, fare family, month) at a time - where
 * both the carrier and at least one competitor were quoted, so the network, the
 * horizon and the product are held fixed by construction.
 *
 * The statistic is a one-sample t on the within-cell log differences. Differences from
 * the same route are not independent, so the standard error is optimistic; the
 * interpretation says so rather than the code pretending otherwise.
 */
function matchedPairsTest(diffs: readonly number[], name: string, alpha = 0.05): TestResult | null {
  const n = diffs.length
  if (n < 8) return null
  let sum = 0
  for (const d of diffs) sum += d
  const mean = sum / n
  let ss = 0
  for (const d of diffs) ss += (d - mean) ** 2
  const sd = Math.sqrt(ss / (n - 1))
  const se = sd / Math.sqrt(n)
  const t = se > 0 ? mean / se : 0
  const df = n - 1
  const p = tTwoSided(t, df)
  const pct = (Math.exp(mean) - 1) * 100
  const direction = pct >= 0 ? 'above' : 'below'

  return {
    test: `Matched-pairs t: ${name} vs other carriers in the same cell`,
    statistic: t,
    pValue: p,
    df,
    // Cohen's d for a paired design is the mean difference over its own SD.
    effectSize: sd > 0 ? mean / sd : 0,
    n,
    nullHypothesis: `${name} prices the same product at the same fare as its competitors`,
    decision: p < alpha ? 'reject' : 'fail_to_reject',
    alpha,
    interpretation:
      p < alpha
        ? `${name} quotes ${Math.abs(pct).toFixed(1)}% ${direction} the other carriers ` +
          `selling the same route, cabin, fare family and booking horizon in the same month. ` +
          `Cells from one route are correlated, so the interval around this is wider than ${n} ` +
          `independent draws would give.`
        : `No detectable difference between ${name} and its competitors once the route, ` +
          `cabin, fare family and booking horizon are held fixed.`,
    assumptionsChecked: {
      'paired within cell': true,
      'cells independent': false,
      'differences approximately symmetric': Math.abs(mean) < 3 * sd,
    },
  }
}

export function computeCarriers(ds: Dataset, filter: CubeFilter): CarrierResultDto {
  const started = performance.now()
  const cube = buildCube(ds, filter)
  const pm = cube.matrix
  const nPeriods = pm.nPeriods
  const from = filter.periodFrom ?? 0
  const to = from + nPeriods - 1

  // --- pass over the panel for the descriptive cuts ------------------------
  const nA = AIRLINES.length
  const counts = new Int32Array(nA)
  const sumFare = new Float64Array(nA)
  const sumLog = new Float64Array(nA)
  const sumHorizon = new Float64Array(nA)
  const sumSeats = new Float64Array(nA)
  const perPeriod = new Int32Array(nA * nPeriods)
  const periodTotals = new Int32Array(nPeriods)
  const cabinCounts = new Int32Array(nA * CABINS.length)
  const routesSeen: Set<number>[] = Array.from({ length: nA }, () => new Set<number>())
  // Fares are kept per carrier only to take quantiles; the panel is large, so these
  // are plain arrays filled once rather than sorted copies of the whole panel.
  const fares: number[][] = Array.from({ length: nA }, () => [])

  const { panel } = ds
  const routeAllowed = resolveRoutes(filter)
  const sourceAllowed = resolveSources(cube.sourcesUsed)

  for (let i = 0; i < panel.n; i++) {
    const t = panel.periodIdx[i]!
    if (t < from || t > to) continue
    const ri = panel.routeIdx[i]!
    if (!routeAllowed[ri]) continue
    if (!sourceAllowed[panel.sourceIdx[i]!]) continue

    const ai = panel.airlineIdx[i]!
    const rel = t - from
    const fare = panel.fare[i]!
    counts[ai]!++
    sumFare[ai] += fare
    sumLog[ai] += panel.logFare[i]!
    sumHorizon[ai] += HORIZONS[panel.horizonIdx[i]!]!
    sumSeats[ai] += panel.seats[i]!
    perPeriod[ai * nPeriods + rel]!++
    periodTotals[rel]!++
    cabinCounts[ai * CABINS.length + panel.cabinIdx[i]!]!++
    routesSeen[ai]!.add(ri)
    fares[ai]!.push(fare)
  }

  // --- matched cells -------------------------------------------------------
  // Group the cube's cells by everything except the airline. Within a group, each
  // carrier is compared against the mean of the others.
  const diffs: number[][] = Array.from({ length: nA }, () => [])
  const groups = new Map<string, { ai: number; logP: number }[]>()
  for (let p = 0; p < pm.nProducts; p++) {
    const prod = ds.products[p]!
    for (let t = 0; t < nPeriods; t++) {
      const idx = p * nPeriods + t
      if (pm.count[idx]! === 0) continue
      const key = `${prod.routeIdx}|${prod.horizonIdx}|${prod.cabinIdx}|${prod.familyIdx}|${t}`
      const bucket = groups.get(key)
      const entry = { ai: prod.airlineIdx, logP: pm.logPrice[idx]! }
      if (bucket) bucket.push(entry)
      else groups.set(key, [entry])
    }
  }
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue
    let total = 0
    for (const e of bucket) total += e.logP
    for (const e of bucket) {
      // Mean of the OTHERS, not of the whole cell - otherwise each carrier is being
      // compared partly against itself and every difference is shrunk toward zero.
      const others = (total - e.logP) / (bucket.length - 1)
      diffs[e.ai]!.push(e.logP - others)
    }
  }

  // --- per-carrier index series -------------------------------------------
  const productsOf: number[][] = Array.from({ length: nA }, () => [])
  for (let p = 0; p < pm.nProducts; p++) productsOf[ds.products[p]!.airlineIdx]!.push(p)

  let grandTotal = 0
  for (const c of counts) grandTotal += c
  let grandSeats = 0
  for (const s of sumSeats) grandSeats += s

  const marketGeomean: number[] = cube.periodStats.map((s) => s.geomeanFare)

  const carriers: CarrierDto[] = AIRLINES.map((a, ai) => {
    const n = counts[ai]!
    const sorted = fares[ai]!.slice().sort((x, y) => x - y)

    // Constant-quality: the national estimator, restricted to this carrier's products.
    let index: number[] = new Array(nPeriods).fill(NaN)
    if (n > 0 && productsOf[ai]!.length > 0) {
      const sub = subMatrix(pm, productsOf[ai]!)
      try {
        index = rebase(rygeksFews(sub).values)
      } catch {
        // A carrier with too thin a panel in a short window cannot support the
        // estimator. Showing nothing is correct; showing a fallback is not.
        index = new Array(nPeriods).fill(NaN)
      }
    }

    // Naive: geometric mean of this carrier's observed fares, period by period.
    const naiveLevels: number[] = []
    for (let t = 0; t < nPeriods; t++) {
      let s = 0
      let c = 0
      for (const p of productsOf[ai]!) {
        const idx = p * nPeriods + t
        const cc = pm.count[idx]!
        if (cc === 0) continue
        s += pm.logPrice[idx]! * cc
        c += cc
      }
      naiveLevels.push(c > 0 ? Math.exp(s / c) : NaN)
    }
    const naiveIndex = rebase(naiveLevels)

    const cabinMix = CABINS.map((cabin, ci) => ({
      cabin,
      share: n > 0 ? cabinCounts[ai * CABINS.length + ci]! / n : 0,
    }))

    const d = diffs[ai]!
    let meanDiff = 0
    for (const x of d) meanDiff += x
    meanDiff = d.length > 0 ? meanDiff / d.length : NaN

    return {
      code: a.code,
      name: a.name,
      model: a.model,
      colour: a.colour,
      nObservations: n,
      observationShare: grandTotal > 0 ? n / grandTotal : 0,
      seatShare: grandSeats > 0 ? sumSeats[ai]! / grandSeats : 0,
      routesServed: routesSeen[ai]!.size,
      meanFare: n > 0 ? sumFare[ai]! / n : NaN,
      medianFare: quantile(sorted, 0.5),
      geomeanFare: n > 0 ? Math.exp(sumLog[ai]! / n) : NaN,
      p10: quantile(sorted, 0.1),
      p90: quantile(sorted, 0.9),
      meanHorizonDays: n > 0 ? sumHorizon[ai]! / n : NaN,
      index,
      naiveIndex,
      avgYoy: meanYoyPct(index),
      naiveAvgYoy: meanYoyPct(naiveIndex),
      shareByPeriod: Array.from({ length: nPeriods }, (_, t) =>
        periodTotals[t]! > 0 ? perPeriod[ai * nPeriods + t]! / periodTotals[t]! : NaN,
      ),
      cabinMix,
      matchedPremiumPct: Number.isFinite(meanDiff) ? (Math.exp(meanDiff) - 1) * 100 : NaN,
      matchedCells: d.length,
      matchedTest: matchedPairsTest(d, a.name),
    }
  })

  return {
    periods: [...pm.periods],
    carriers,
    marketGeomean,
    totalObservations: grandTotal,
    computeMs: performance.now() - started,
  }
}

// --- filter resolution, mirroring buildCube so the two cuts agree ----------

function resolveRoutes(filter: CubeFilter): Uint8Array {
  const allowed = new Uint8Array(ROUTES.length).fill(1)
  if (filter.routeIds && filter.routeIds.length > 0) {
    allowed.fill(0)
    const wanted = new Set(filter.routeIds)
    for (let i = 0; i < ROUTES.length; i++) if (wanted.has(ROUTES[i]!.id)) allowed[i] = 1
  }
  return allowed
}

function resolveSources(used: readonly string[]): Uint8Array {
  // buildCube has already decided which sources survive the filter; reuse its verdict
  // rather than re-deriving it, so a future change to that rule cannot fork the two.
  const allowed = new Uint8Array(FARE_SOURCES.length)
  const usedSet = new Set(used)
  for (let i = 0; i < FARE_SOURCES.length; i++) {
    allowed[i] = usedSet.has(FARE_SOURCES[i]!.id) ? 1 : 0
  }
  return allowed
}
