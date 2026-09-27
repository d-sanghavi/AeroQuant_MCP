/**
 * Index diagnostics: the tests that decide whether a series is publishable.
 *
 * A number that has not been through these is a chart, not a statistic.
 */

import { mulberry32 } from '@/lib/rng'
import { bilateralTornqvist } from './multilateral'
import { carli, jevons } from './elementary'
import type { StratumIndex } from './aggregate'
import { aggregateStrata, rebase } from './aggregate'
import type { PriceMatrix } from './types'

export interface ChainDriftResult {
  readonly method: string
  /** Product of period-on-period links, first to last. */
  readonly forward: number
  /** Product of the reverse links, last back to first. */
  readonly reverse: number
  /** forward x reverse. Exactly 1 for a formula satisfying time reversal. */
  readonly roundTrip: number
  /** roundTrip - 1. Non-zero means the formula itself fails time reversal. */
  readonly timeReversalDrift: number
  /** Chained level at the final period. */
  readonly chainedFinal: number
  /** Direct (fixed-base) level at the final period. */
  readonly directFinal: number
  /**
   * chainedFinal / directFinal - 1. This is chain drift proper: the gap opened by
   * the matched sample churning between links. It is the diagnostic that condemns
   * chaining on scanner-type data.
   */
  readonly chainVsDirect: number
  readonly passes: boolean
}

const DRIFT_TOLERANCE = 0.002 // 0.2 index points over the window

/**
 * Run the drift battery for one bilateral formula.
 *
 * Note on interpretation, because this is easy to over-claim: a formula can pass time
 * reversal (Jevons, Tornqvist) and still fail chain-vs-direct, because the two tests
 * catch different faults. Time reversal is a property of the FORMULA; chain drift is a
 * property of the formula applied to a CHANGING SAMPLE. A naive mean of all collected
 * fares passes both and is still wrong, because its failure is composition bias -
 * which no amount of chain-drift testing will reveal. That is why the Method Lab shows
 * the composition series alongside this table rather than instead of it.
 */
export function chainDrift(
  pm: PriceMatrix,
  method: string,
  link: (pm: PriceMatrix, s: number, t: number) => number,
  from = 0,
  to = pm.nPeriods - 1,
): ChainDriftResult {
  let forward = 1
  let reverse = 1
  for (let t = from + 1; t <= to; t++) {
    const f = link(pm, t - 1, t)
    const r = link(pm, t, t - 1)
    if (Number.isFinite(f)) forward *= f
    if (Number.isFinite(r)) reverse *= r
  }
  const directFinal = link(pm, from, to)
  const roundTrip = forward * reverse
  const chainVsDirect = Number.isFinite(directFinal) ? forward / directFinal - 1 : NaN

  return {
    method,
    forward,
    reverse,
    roundTrip,
    timeReversalDrift: roundTrip - 1,
    chainedFinal: forward,
    directFinal,
    chainVsDirect,
    passes:
      Math.abs(roundTrip - 1) < DRIFT_TOLERANCE &&
      (!Number.isFinite(chainVsDirect) || Math.abs(chainVsDirect) < DRIFT_TOLERANCE),
  }
}

/** Matched-sample Jevons between two periods, as a bilateral link. */
export function jevonsLink(pm: PriceMatrix, s: number, t: number): number {
  if (s === t) return 1
  const { nProducts, nPeriods, price, count } = pm
  const a: number[] = []
  const b: number[] = []
  for (let i = 0; i < nProducts; i++) {
    if (count[i * nPeriods + s]! === 0 || count[i * nPeriods + t]! === 0) continue
    a.push(price[i * nPeriods + s]!)
    b.push(price[i * nPeriods + t]!)
  }
  return jevons(a, b)
}

/** Matched-sample Carli between two periods. Included because it fails visibly. */
export function carliLink(pm: PriceMatrix, s: number, t: number): number {
  if (s === t) return 1
  const { nProducts, nPeriods, price, count } = pm
  const a: number[] = []
  const b: number[] = []
  for (let i = 0; i < nProducts; i++) {
    if (count[i * nPeriods + s]! === 0 || count[i * nPeriods + t]! === 0) continue
    a.push(price[i * nPeriods + s]!)
    b.push(price[i * nPeriods + t]!)
  }
  return carli(a, b)
}

export function tornqvistLink(pm: PriceMatrix, s: number, t: number): number {
  return bilateralTornqvist(pm, s, t)
}

// ---------------------------------------------------------------------------

export interface ConfidenceBand {
  readonly lower: number[]
  readonly upper: number[]
  readonly median: number[]
  readonly replicates: number
  readonly level: number
  readonly method: string
  readonly caveat: string
}

/**
 * Block bootstrap clustered on route.
 *
 * Routes are resampled WITH REPLACEMENT and the aggregate is recomputed from the
 * resampled set. Clustering on route is the right choice because observations within
 * a route share a demand shock, a capacity path and a carrier mix - treating 500,000
 * quotes as 500,000 independent draws would produce a confidence interval roughly an
 * order of magnitude too narrow, which is worse than publishing no interval at all.
 *
 * What this interval DOES cover: which routes happened to be in the sample.
 * What it does NOT cover: model choice, or the sampling of quotes within a route.
 * That caveat travels with the result rather than living in a footnote.
 */
export function blockBootstrapCI(
  strata: readonly StratumIndex[],
  nPeriods: number,
  opts: { replicates?: number; level?: number; seed?: number } = {},
): ConfidenceBand {
  const replicates = opts.replicates ?? 200
  const level = opts.level ?? 0.95
  const rng = mulberry32(opts.seed ?? 26056)
  const n = strata.length

  const draws: number[][] = Array.from({ length: nPeriods }, () => [])

  for (let b = 0; b < replicates; b++) {
    const sample: StratumIndex[] = new Array(n)
    for (let i = 0; i < n; i++) sample[i] = strata[Math.floor(rng() * n)]!
    const { values } = aggregateStrata(sample, nPeriods)
    const rebased = rebase(values)
    for (let t = 0; t < nPeriods; t++) {
      const v = rebased[t]!
      if (Number.isFinite(v)) draws[t]!.push(v)
    }
  }

  const alpha = (1 - level) / 2
  const lower: number[] = []
  const upper: number[] = []
  const med: number[] = []
  for (let t = 0; t < nPeriods; t++) {
    const xs = draws[t]!.sort((a, b) => a - b)
    if (xs.length === 0) {
      lower.push(NaN)
      upper.push(NaN)
      med.push(NaN)
      continue
    }
    const at = (q: number): number => {
      const h = (xs.length - 1) * q
      const lo = Math.floor(h)
      const hi = Math.ceil(h)
      return xs[lo]! + (h - lo) * (xs[hi]! - xs[lo]!)
    }
    lower.push(at(alpha))
    upper.push(at(1 - alpha))
    med.push(at(0.5))
  }

  return {
    lower,
    upper,
    median: med,
    replicates,
    level,
    method: 'Block bootstrap, clustered on route',
    caveat:
      'Covers sampling variability across routes only. It does not include model ' +
      'uncertainty or within-route quote sampling, so it is a lower bound on total ' +
      'uncertainty.',
  }
}

// ---------------------------------------------------------------------------

export interface ImputationStats {
  /** Share of (product, period) cells with no observation. */
  readonly cellMissingRate: number
  /** Share of cells that had to be imputed to keep the matched panel alive. */
  readonly imputedRate: number
  /** Products present in every period - the fixed matched panel. */
  readonly fullPanelProducts: number
  readonly totalProducts: number
  /** Per-period count of products with at least one observation. */
  readonly observedByPeriod: number[]
  /** Per-period count of observations. */
  readonly obsByPeriod: number[]
}

export function imputationStats(pm: PriceMatrix): ImputationStats {
  const { nProducts, nPeriods, count } = pm
  let empty = 0
  let full = 0
  const observedByPeriod = new Array<number>(nPeriods).fill(0)
  const obsByPeriod = new Array<number>(nPeriods).fill(0)

  for (let i = 0; i < nProducts; i++) {
    let all = true
    let any = false
    for (let t = 0; t < nPeriods; t++) {
      const c = count[i * nPeriods + t]!
      if (c === 0) {
        empty++
        all = false
      } else {
        any = true
        observedByPeriod[t] = observedByPeriod[t]! + 1
        obsByPeriod[t] = obsByPeriod[t]! + c
      }
    }
    if (all && any) full++
  }

  const totalCells = nProducts * nPeriods
  // A cell is imputed when it is missing but the product is alive on both sides of the
  // gap - those are the ones a matched-model index has to fill rather than drop.
  let imputable = 0
  for (let i = 0; i < nProducts; i++) {
    let firstSeen = -1
    let lastSeen = -1
    for (let t = 0; t < nPeriods; t++) {
      if (count[i * nPeriods + t]! > 0) {
        if (firstSeen < 0) firstSeen = t
        lastSeen = t
      }
    }
    if (firstSeen < 0) continue
    for (let t = firstSeen; t <= lastSeen; t++) {
      if (count[i * nPeriods + t]! === 0) imputable++
    }
  }

  return {
    cellMissingRate: empty / totalCells,
    imputedRate: imputable / totalCells,
    fullPanelProducts: full,
    totalProducts: nProducts,
    observedByPeriod,
    obsByPeriod,
  }
}

/**
 * Fill interior gaps in a product's price path by log-linear interpolation, and mark
 * which cells were filled. Nothing is extrapolated beyond a product's observed life -
 * inventing a price for a product that did not exist yet is not imputation, it is
 * fabrication.
 */
export function imputeInterior(pm: PriceMatrix): {
  logPrice: Float64Array
  price: Float64Array
  imputed: Uint8Array
  filled: number
} {
  const { nProducts, nPeriods, count } = pm
  const logPrice = new Float64Array(pm.logPrice)
  const price = new Float64Array(pm.price)
  const imputed = new Uint8Array(nProducts * nPeriods)
  let filled = 0

  for (let i = 0; i < nProducts; i++) {
    const base = i * nPeriods
    let prev = -1
    for (let t = 0; t < nPeriods; t++) {
      if (count[base + t]! === 0) continue
      if (prev >= 0 && t - prev > 1) {
        const a = logPrice[base + prev]!
        const b = logPrice[base + t]!
        for (let k = prev + 1; k < t; k++) {
          const w = (k - prev) / (t - prev)
          const lp = a + w * (b - a)
          logPrice[base + k] = lp
          price[base + k] = Math.exp(lp)
          imputed[base + k] = 1
          filled++
        }
      }
      prev = t
    }
  }

  return { logPrice, price, imputed, filled }
}
