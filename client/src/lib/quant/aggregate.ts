/**
 * Aggregation: route -> state -> region -> national.
 *
 * Two decisions worth stating, because both are places where implementations quietly
 * differ and then disagree with each other:
 *
 *  1. Aggregation across strata uses a WEIGHTED ARITHMETIC mean of the sub-indices
 *     with DGCA passenger weights. This is the Laspeyres-type aggregation that CPI
 *     practice uses above the elementary level. (Within an elementary aggregate we
 *     use Jevons, which is geometric. Mixing the two at different levels is not an
 *     inconsistency - it is the standard structure, and the ILO manual is explicit
 *     about it.)
 *
 *  2. Weights are normalised over the strata that actually have an index in that
 *     period. If a route drops out, its weight is redistributed proportionally rather
 *     than treated as zero change, because treating a missing stratum as "no change"
 *     silently pulls the aggregate toward zero.
 */

import { ROUTES, ROUTE_WEIGHTS, type RouteDef } from '@/data/master/routes'
import type { PriceMatrix } from './types'

export interface StratumIndex {
  readonly key: string
  readonly label: string
  readonly weight: number
  /** Index levels, base 100 at the first period. NaN where the stratum has no data. */
  readonly values: number[]
  readonly matched: number[]
}

export interface AggregationResult {
  /** The national index, base 100. */
  readonly national: number[]
  readonly strata: readonly StratumIndex[]
  /** Share of weight actually represented in each period. */
  readonly coverage: number[]
}

/**
 * Weighted arithmetic aggregation of sub-indices.
 * Weights are re-normalised per period over the strata with a finite value.
 */
export function aggregateStrata(
  strata: readonly StratumIndex[],
  nPeriods: number,
): { values: number[]; coverage: number[] } {
  const values = new Array<number>(nPeriods).fill(NaN)
  const coverage = new Array<number>(nPeriods).fill(0)
  const totalWeight = strata.reduce((s, x) => s + x.weight, 0) || 1

  for (let t = 0; t < nPeriods; t++) {
    let num = 0
    let den = 0
    for (const s of strata) {
      const v = s.values[t]
      if (v === undefined || !Number.isFinite(v)) continue
      num += s.weight * v
      den += s.weight
    }
    values[t] = den > 0 ? num / den : NaN
    coverage[t] = den / totalWeight
  }
  return { values, coverage }
}

/** Rebase a series so that `baseIdx` equals 100. */
export function rebase(values: readonly number[], baseIdx = 0, base = 100): number[] {
  const b = values[baseIdx]
  if (b === undefined || !Number.isFinite(b) || b === 0) return values.map(() => NaN)
  return values.map((v) => (Number.isFinite(v) ? (v / b) * base : NaN))
}

/**
 * Split a PriceMatrix into per-route sub-matrices.
 * Returned lazily as index ranges so no data is copied.
 */
export function productsByRoute(
  productRoute: Int32Array,
  nRoutes: number,
): number[][] {
  const out: number[][] = Array.from({ length: nRoutes }, () => [])
  for (let i = 0; i < productRoute.length; i++) {
    const r = productRoute[i]!
    if (r >= 0 && r < nRoutes) out[r]!.push(i)
  }
  return out
}

/**
 * Run an index estimator separately on each route's products.
 * `estimate` receives the product ids belonging to one route.
 */
export function routeIndices(
  pm: PriceMatrix,
  productRoute: Int32Array,
  estimate: (productIds: readonly number[]) => number[],
): StratumIndex[] {
  const groups = productsByRoute(productRoute, ROUTES.length)
  return ROUTES.map((r, ri) => {
    const ids = groups[ri]!
    const values = ids.length > 0 ? estimate(ids) : new Array(pm.nPeriods).fill(NaN)
    const matched = new Array<number>(pm.nPeriods).fill(0)
    for (let t = 0; t < pm.nPeriods; t++) {
      let m = 0
      for (const id of ids) if (pm.count[id * pm.nPeriods + t]! > 0) m++
      matched[t] = m
    }
    return {
      key: r.id,
      label: `${r.origin}-${r.destination}`,
      weight: ROUTE_WEIGHTS.get(r.id)!,
      values: rebase(values),
      matched,
    }
  })
}

export interface GeoRollup {
  readonly key: string
  readonly label: string
  readonly weight: number
  readonly values: number[]
  readonly routeKeys: readonly string[]
}

function rollup(
  strata: readonly StratumIndex[],
  nPeriods: number,
  keyOf: (r: RouteDef) => string,
  labelOf: (key: string) => string,
): GeoRollup[] {
  const byKey = new Map<string, StratumIndex[]>()
  const routesByKey = new Map<string, string[]>()
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i]!
    const s = strata[i]
    if (!s) continue
    const k = keyOf(r)
    const list = byKey.get(k)
    if (list) list.push(s)
    else byKey.set(k, [s])
    const rl = routesByKey.get(k)
    if (rl) rl.push(r.id)
    else routesByKey.set(k, [r.id])
  }

  return [...byKey.entries()]
    .map(([key, group]) => {
      const { values } = aggregateStrata(group, nPeriods)
      return {
        key,
        label: labelOf(key),
        weight: group.reduce((s, x) => s + x.weight, 0),
        values: rebase(values),
        routeKeys: routesByKey.get(key) ?? [],
      }
    })
    .sort((a, b) => b.weight - a.weight)
}

/** State-level rollup, attributing a route to its ORIGIN state. */
export function byOriginState(strata: readonly StratumIndex[], nPeriods: number): GeoRollup[] {
  return rollup(strata, nPeriods, (r) => r.originAirport.state, (k) => k)
}

export function byOriginRegion(strata: readonly StratumIndex[], nPeriods: number): GeoRollup[] {
  return rollup(strata, nPeriods, (r) => r.originRegion, (k) => `${k} India`)
}

export function byTrunkStatus(strata: readonly StratumIndex[], nPeriods: number): GeoRollup[] {
  return rollup(
    strata,
    nPeriods,
    (r) => (r.isTrunk ? 'trunk' : 'non-trunk'),
    (k) => (k === 'trunk' ? 'Trunk routes (metro-metro)' : 'Non-trunk routes'),
  )
}

/**
 * Assert the weights are a probability distribution.
 * Called at build time rather than trusted, because a weight vector that silently
 * fails to sum to one produces an index that is wrong by a constant factor - the
 * hardest kind of error to notice.
 */
export function assertWeightsSumToOne(weights: Iterable<number>, tol = 1e-9): number {
  let total = 0
  for (const w of weights) total += w
  if (Math.abs(total - 1) > tol) {
    throw new Error(`Aggregation weights must sum to 1, got ${total}`)
  }
  return total
}
