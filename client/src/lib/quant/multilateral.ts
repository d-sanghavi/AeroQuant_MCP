/**
 * Multilateral index methods.
 *
 * A bilateral index compares two periods. Chaining bilateral indices through time is
 * the obvious thing to do and it is wrong for scanner-type data: because the matched
 * set changes at every link, the chain accumulates drift - it can return to a
 * different level than it started from even when every price has returned to its
 * original value. Multilateral methods fix this by using ALL periods in a window
 * simultaneously, which buys transitivity.
 *
 * Implemented here:
 *   - GEKS-Tornqvist: geometric mean of all indirect bilateral comparisons.
 *   - Time Product Dummy: a two-way fixed-effects regression of log price on period
 *     and product; the exponentiated period effects are the index.
 *   - RYGEKS / FEWS: roll the window forward and splice, so the published series is
 *     never revised but also never drifts.
 *
 * The transitivity of GEKS is asserted in the test suite, not assumed here.
 */

import { tornqvist } from './elementary'
import type { PriceMatrix } from './types'

/** Products observed in both periods, with their prices and quantities. */
interface MatchedPair {
  readonly p0: number[]
  readonly p1: number[]
  readonly q0: number[]
  readonly q1: number[]
  readonly n: number
}

function matchPair(pm: PriceMatrix, s: number, t: number): MatchedPair {
  const { nProducts, nPeriods, price, count, quantity } = pm
  const p0: number[] = []
  const p1: number[] = []
  const q0: number[] = []
  const q1: number[] = []
  for (let i = 0; i < nProducts; i++) {
    const cs = count[i * nPeriods + s]!
    const ct = count[i * nPeriods + t]!
    if (cs === 0 || ct === 0) continue
    const a = price[i * nPeriods + s]!
    const b = price[i * nPeriods + t]!
    if (!(a > 0) || !(b > 0)) continue
    p0.push(a)
    p1.push(b)
    q0.push(quantity[i * nPeriods + s]!)
    q1.push(quantity[i * nPeriods + t]!)
  }
  return { p0, p1, q0, q1, n: p0.length }
}

function sharesOf(price: readonly number[], qty: readonly number[]): number[] {
  let total = 0
  const e = new Array<number>(price.length)
  for (let i = 0; i < price.length; i++) {
    e[i] = price[i]! * qty[i]!
    total += e[i]!
  }
  return total > 0 ? e.map((x) => x / total) : e.map(() => 0)
}

/** Bilateral Tornqvist between two periods of a PriceMatrix. */
export function bilateralTornqvist(pm: PriceMatrix, s: number, t: number): number {
  if (s === t) return 1
  const m = matchPair(pm, s, t)
  if (m.n === 0) return NaN
  return tornqvist(m.p0, m.p1, sharesOf(m.p0, m.q0), sharesOf(m.p1, m.q1))
}

/**
 * GEKS-Tornqvist over the periods [from, to].
 *
 * P_GEKS(0,t) = prod over link periods l of [ P(0,l) x P(l,t) ] ^ (1/T)
 *
 * Every period gets a turn as the bridge, and the geometric mean of the resulting
 * indirect comparisons is transitive by construction. Returns levels with
 * values[0] = 1.
 */
export function geksTornqvist(pm: PriceMatrix, from = 0, to = pm.nPeriods - 1): number[] {
  const T = to - from + 1
  if (T <= 0) return []

  // All pairwise bilateral comparisons in the window.
  const P: number[][] = Array.from({ length: T }, () => new Array<number>(T).fill(NaN))
  for (let a = 0; a < T; a++) {
    P[a]![a] = 1
    for (let b = a + 1; b < T; b++) {
      const v = bilateralTornqvist(pm, from + a, from + b)
      P[a]![b] = v
      // Tornqvist satisfies time reversal exactly, so the reciprocal is not an
      // approximation - it is the identity, and using it halves the work.
      P[b]![a] = 1 / v
    }
  }

  const out = new Array<number>(T).fill(NaN)
  for (let t = 0; t < T; t++) {
    let s = 0
    let n = 0
    for (let l = 0; l < T; l++) {
      const a = P[0]![l]!
      const b = P[l]![t]!
      if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) continue
      s += Math.log(a) + Math.log(b)
      n++
    }
    out[t] = n === 0 ? NaN : Math.exp(s / n)
  }
  return out
}

export interface TpdResult {
  /** Index levels within the window, first period = 1. */
  readonly values: number[]
  /** Product (quality) effects, indexed by product. NaN where not in the window. */
  readonly productEffects: Float64Array
  readonly iterations: number
  readonly converged: boolean
  readonly nObservedCells: number
}

/**
 * Time Product Dummy.
 *
 * The model is  ln p_it = delta_t + gamma_i + e_it , weighted by expenditure share,
 * with delta_0 normalised to zero. The index is exp(delta_t).
 *
 * Solved by alternating projections rather than by forming the design matrix. With a
 * few thousand products over a 13-month window the explicit dummy matrix would have
 * tens of millions of entries and a QR of it would be absurd; the two-way
 * fixed-effects normal equations separate, and Gauss-Seidel on them converges in a
 * handful of sweeps. This is the same estimate, not an approximation of it.
 */
export function timeProductDummy(
  pm: PriceMatrix,
  from = 0,
  to = pm.nPeriods - 1,
  maxIter = 200,
  tol = 1e-12,
): TpdResult {
  const { nProducts, nPeriods, logPrice, count, price, quantity } = pm
  const T = to - from + 1
  if (T <= 0) return { values: [], productEffects: new Float64Array(0), iterations: 0, converged: true, nObservedCells: 0 }

  // Expenditure-share weights, normalised within each period so no period dominates.
  const w = new Float64Array(nProducts * T)
  let observed = 0
  for (let t = 0; t < T; t++) {
    let total = 0
    for (let i = 0; i < nProducts; i++) {
      const c = count[i * nPeriods + from + t]!
      if (c === 0) continue
      const e = price[i * nPeriods + from + t]! * quantity[i * nPeriods + from + t]!
      w[i * T + t] = e > 0 ? e : 0
      total += w[i * T + t]!
      observed++
    }
    if (total > 0) {
      for (let i = 0; i < nProducts; i++) w[i * T + t] = w[i * T + t]! / total
    }
  }

  const delta = new Float64Array(T)
  const gamma = new Float64Array(nProducts)
  const inWindow = new Uint8Array(nProducts)
  for (let i = 0; i < nProducts; i++) {
    for (let t = 0; t < T; t++) {
      if (count[i * nPeriods + from + t]! > 0) {
        inWindow[i] = 1
        break
      }
    }
  }

  let iter = 0
  let converged = false
  for (; iter < maxIter; iter++) {
    let maxDelta = 0

    // gamma_i = weighted mean over t of (y_it - delta_t)
    for (let i = 0; i < nProducts; i++) {
      if (!inWindow[i]) continue
      let num = 0
      let den = 0
      for (let t = 0; t < T; t++) {
        const wi = w[i * T + t]!
        if (wi === 0) continue
        num += wi * (logPrice[i * nPeriods + from + t]! - delta[t]!)
        den += wi
      }
      if (den > 0) gamma[i] = num / den
    }

    // delta_t = weighted mean over i of (y_it - gamma_i), then re-normalise.
    for (let t = 0; t < T; t++) {
      let num = 0
      let den = 0
      for (let i = 0; i < nProducts; i++) {
        const wi = w[i * T + t]!
        if (wi === 0) continue
        num += wi * (logPrice[i * nPeriods + from + t]! - gamma[i]!)
        den += wi
      }
      const next = den > 0 ? num / den : delta[t]!
      maxDelta = Math.max(maxDelta, Math.abs(next - delta[t]!))
      delta[t] = next
    }

    // Normalisation: delta_0 = 0. The level is not identified without it.
    const d0 = delta[0]!
    for (let t = 0; t < T; t++) delta[t] = delta[t]! - d0

    if (maxDelta < tol) {
      converged = true
      iter++
      break
    }
  }

  const values = Array.from(delta, (d) => Math.exp(d))
  const productEffects = new Float64Array(nProducts).fill(NaN)
  for (let i = 0; i < nProducts; i++) if (inWindow[i]) productEffects[i] = gamma[i]!

  return { values, productEffects, iterations: iter, converged, nObservedCells: observed }
}

export type SpliceMethod = 'movement' | 'window' | 'half' | 'mean'

/**
 * Splice a new window's index onto an existing series.
 *
 * `prev` is the published series so far; `win` is the new window's internal index
 * (first element = 1) covering periods [winStart .. winStart + win.length - 1], which
 * overlaps `prev` everywhere except the final period.
 *
 * The splice link is the ratio by which the window says the last period moved
 * relative to some earlier overlapping period. Which earlier period you pick is the
 * whole debate: `movement` uses the immediately preceding one (most responsive, most
 * drift-prone), `window` uses the first period of the window (most stable), and
 * `mean` takes the geometric mean of every available choice - which is what Diewert
 * and Fox recommend and what this implementation defaults to.
 */
export function meanSplice(
  prev: readonly number[],
  win: readonly number[],
  winStart: number,
  method: SpliceMethod = 'mean',
): number {
  const L = win.length
  const last = win[L - 1]!
  const links: number[] = []

  const candidates =
    method === 'movement'
      ? [L - 2]
      : method === 'window'
        ? [0]
        : method === 'half'
          ? [Math.floor((L - 1) / 2)]
          : Array.from({ length: L - 1 }, (_, k) => k)

  for (const k of candidates) {
    const prevIdx = winStart + k
    if (k < 0 || prevIdx < 0 || prevIdx >= prev.length) continue
    const base = win[k]!
    const anchor = prev[prevIdx]!
    if (!(base > 0) || !(anchor > 0)) continue
    links.push(anchor * (last / base))
  }

  if (links.length === 0) return NaN
  let s = 0
  for (const l of links) s += Math.log(l)
  return Math.exp(s / links.length)
}

export interface RygeksResult {
  readonly values: number[]
  readonly windowLength: number
  readonly splice: SpliceMethod
  /** Periods that were produced by splicing rather than by the initial window. */
  readonly splicedFrom: number
}

/**
 * Rolling-Year GEKS with a Fixed Effects Window Splice.
 *
 * The published series must never be revised - an official statistic that changes
 * after publication is a different kind of problem from an inaccurate one. So the
 * window rolls forward and each new period is attached by a splice, leaving every
 * previously published value untouched.
 *
 * The within-window estimator is the Time Product Dummy (the "fixed effects" in
 * FEWS); GEKS-Tornqvist is available as an alternative for comparison.
 */
export function rygeksFews(
  pm: PriceMatrix,
  windowLength = 13,
  splice: SpliceMethod = 'mean',
  estimator: 'tpd' | 'geks' = 'tpd',
  from = 0,
  to = pm.nPeriods - 1,
): RygeksResult {
  const T = to - from + 1
  const W = Math.min(windowLength, T)
  const run = (a: number, b: number): number[] =>
    estimator === 'tpd' ? timeProductDummy(pm, a, b).values : geksTornqvist(pm, a, b)

  // First window establishes the base.
  const values = run(from, from + W - 1)
  if (T <= W) return { values, windowLength: W, splice, splicedFrom: T }

  for (let end = from + W; end <= to; end++) {
    const start = end - W + 1
    const win = run(start, end)
    const winStart = start - from
    values.push(meanSplice(values, win, winStart, splice))
  }

  return { values, windowLength: W, splice, splicedFrom: W }
}

/**
 * Chained index: multiply period-on-period bilateral links.
 * Kept because it is the natural thing to do and it is what drifts.
 */
export function chained(
  pm: PriceMatrix,
  link: (pm: PriceMatrix, s: number, t: number) => number,
  from = 0,
  to = pm.nPeriods - 1,
): number[] {
  const out: number[] = [1]
  for (let t = from + 1; t <= to; t++) {
    const l = link(pm, t - 1, t)
    out.push(out[out.length - 1]! * (Number.isFinite(l) ? l : 1))
  }
  return out
}

/** Direct (fixed-base) index: every period compared straight back to the base. */
export function direct(
  pm: PriceMatrix,
  link: (pm: PriceMatrix, s: number, t: number) => number,
  from = 0,
  to = pm.nPeriods - 1,
): number[] {
  const out: number[] = []
  for (let t = from; t <= to; t++) {
    const l = link(pm, from, t)
    out.push(Number.isFinite(l) ? l : NaN)
  }
  return out
}
