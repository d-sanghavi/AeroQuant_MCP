/**
 * Portfolio risk, applied to routes as assets.
 *
 * The framing is a technique, not a claim that airfares are securities: a corporate
 * travel budget IS a portfolio of exposures to correlated price series, and the same
 * mathematics that allocates capital across assets allocates a travel budget across
 * routes. Two of the choices here are load-bearing and both are called out in the UI:
 *
 *  - VaR uses Cornish-Fisher, not a normal quantile. Fare changes are right-skewed
 *    and fat-tailed; a Gaussian VaR on this data understates the 99% loss by a wide
 *    margin, and understating tail risk is the specific failure mode that makes risk
 *    numbers worse than useless.
 *
 *  - The covariance matrix is Ledoit-Wolf shrunk, not the sample estimate. With 60
 *    routes and 24 monthly observations the sample covariance is SINGULAR - there are
 *    more assets than periods - and any optimiser handed it will produce enormous
 *    offsetting positions that are pure estimation noise.
 */

import { identity, scale, trace, zeros, type Matrix } from '@/lib/linalg/matrix'
import { normalQuantile } from './distributions'
import { quantile } from './elementary'

export interface Moments {
  readonly mean: number
  readonly sd: number
  readonly skewness: number
  readonly excessKurtosis: number
  readonly n: number
}

export function moments(xs: readonly number[]): Moments {
  const n = xs.length
  if (n < 2) return { mean: NaN, sd: NaN, skewness: NaN, excessKurtosis: NaN, n }
  let mean = 0
  for (const x of xs) mean += x
  mean /= n
  let m2 = 0
  let m3 = 0
  let m4 = 0
  for (const x of xs) {
    const d = x - mean
    const d2 = d * d
    m2 += d2
    m3 += d2 * d
    m4 += d2 * d2
  }
  m2 /= n
  m3 /= n
  m4 /= n
  const sd = Math.sqrt(m2)
  return {
    mean,
    sd,
    skewness: m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0,
    excessKurtosis: m2 > 0 ? m4 / (m2 * m2) - 3 : 0,
    n,
  }
}

export interface VarResult {
  readonly alpha: number
  /** Cornish-Fisher VaR, in the units of the input series. */
  readonly var: number
  /** Gaussian VaR, reported alongside so the difference is visible. */
  readonly gaussianVar: number
  /** Historical (empirical quantile) VaR. */
  readonly historicalVar: number
  /** Expected shortfall beyond the Cornish-Fisher VaR. */
  readonly cvar: number
  readonly moments: Moments
  readonly note: string
}

/**
 * Cornish-Fisher expansion of the normal quantile, corrected for skewness and excess
 * kurtosis. The expansion is only monotone within a range of (skew, kurtosis); outside
 * it the quantile function folds back on itself and the answer is nonsense, so that
 * condition is checked and reported rather than silently ignored.
 */
export function cornishFisherQuantile(
  p: number,
  skew: number,
  excessKurtosis: number,
): number {
  const z = normalQuantile(p)
  const z2 = z * z
  return (
    z +
    ((z2 - 1) * skew) / 6 +
    ((z2 * z - 3 * z) * excessKurtosis) / 24 -
    ((2 * z2 * z - 5 * z) * skew * skew) / 36
  )
}

export function cornishFisherVaR(returns: readonly number[], alpha = 0.05): VarResult {
  const m = moments(returns)
  const zcf = cornishFisherQuantile(alpha, m.skewness, m.excessKurtosis)
  const zg = normalQuantile(alpha)
  const cf = m.mean + zcf * m.sd
  const gaussian = m.mean + zg * m.sd

  const sorted = Float64Array.from(returns).sort()
  const historical = quantile(sorted, alpha)

  // Expected shortfall from the empirical tail - the closed-form CF expected shortfall
  // is available but inherits the expansion's monotonicity problem, and the empirical
  // tail is what an analyst will check it against anyway.
  let tailSum = 0
  let tailN = 0
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]! <= cf) {
      tailSum += sorted[i]!
      tailN++
    }
  }
  const es = tailN > 0 ? tailSum / tailN : cf

  // Monotonicity domain of the CF expansion (Maillard 2012).
  const s = m.skewness
  const k = m.excessKurtosis
  const valid = k >= s * s - 2 && k <= 6 * Math.abs(s) + 2

  return {
    alpha,
    var: cf,
    gaussianVar: gaussian,
    historicalVar: historical,
    cvar: es,
    moments: m,
    note: valid
      ? `Skewness ${s.toFixed(2)}, excess kurtosis ${k.toFixed(2)}. The Cornish-Fisher quantile sits ${(((cf - gaussian) / Math.abs(gaussian)) * 100).toFixed(1)}% from the Gaussian one - that gap is the cost of assuming normality.`
      : `Skewness ${s.toFixed(2)} and excess kurtosis ${k.toFixed(2)} fall outside the range where the Cornish-Fisher expansion is monotone. Treat this VaR as indicative and prefer the historical quantile.`,
  }
}

// ---------------------------------------------------------------------------

export interface ShrinkageResult {
  readonly cov: Matrix
  readonly sample: Matrix
  /** Shrinkage intensity in [0,1]. 1 means "the sample estimate told us nothing". */
  readonly intensity: number
  readonly target: 'scaled identity'
  readonly note: string
}

/**
 * Ledoit-Wolf shrinkage toward a scaled identity.
 *
 * Sigma_hat = (1 - d) * S + d * mu * I,  with d chosen to minimise expected
 * squared error. The estimator for d is the standard one from Ledoit and Wolf (2004).
 */
export function ledoitWolf(returns: Matrix): ShrinkageResult {
  const n = returns.rows
  const p = returns.cols

  // Centre.
  const means = new Float64Array(p)
  for (let i = 0; i < n; i++) for (let j = 0; j < p; j++) means[j] += returns.data[i * p + j]!
  for (let j = 0; j < p; j++) means[j] = means[j]! / n

  const X = zeros(n, p)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) X.data[i * p + j] = returns.data[i * p + j]! - means[j]!
  }

  // Sample covariance (MLE, divisor n - the Ledoit-Wolf formulae assume it).
  const S = zeros(p, p)
  for (let i = 0; i < n; i++) {
    const off = i * p
    for (let a = 0; a < p; a++) {
      const xa = X.data[off + a]!
      if (xa === 0) continue
      for (let b = a; b < p; b++) S.data[a * p + b] += (xa * X.data[off + b]!) / n
    }
  }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) S.data[a * p + b] = S.data[b * p + a]!

  const mu = trace(S) / p

  // ||S - mu I||^2_F
  let d2 = 0
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < p; b++) {
      const v = S.data[a * p + b]! - (a === b ? mu : 0)
      d2 += v * v
    }
  }
  d2 /= p

  // Average squared deviation of the per-observation covariances from S.
  let b2 = 0
  for (let i = 0; i < n; i++) {
    const off = i * p
    let acc = 0
    for (let a = 0; a < p; a++) {
      const xa = X.data[off + a]!
      for (let b = 0; b < p; b++) {
        const v = xa * X.data[off + b]! - S.data[a * p + b]!
        acc += v * v
      }
    }
    b2 += acc / p
  }
  b2 = b2 / (n * n)
  b2 = Math.min(b2, d2)

  const intensity = d2 > 0 ? b2 / d2 : 1
  const shrunk = scale(S, 1 - intensity)
  const targetM = scale(identity(p), intensity * mu)
  for (let i = 0; i < shrunk.data.length; i++) shrunk.data[i] += targetM.data[i]!

  return {
    cov: shrunk,
    sample: S,
    intensity,
    target: 'scaled identity',
    note:
      n <= p
        ? `With ${n} periods and ${p} routes the sample covariance is singular by construction. Shrinkage intensity ${(intensity * 100).toFixed(0)}% is what makes the optimisation well-posed at all.`
        : `Shrinkage intensity ${(intensity * 100).toFixed(0)}%: that share of the estimate comes from the structured target rather than the sample.`,
  }
}

// ---------------------------------------------------------------------------

export interface FrontierPoint {
  readonly riskAversion: number
  readonly expectedReturn: number
  readonly volatility: number
  readonly weights: number[]
  readonly effectiveN: number
}

/**
 * Long-only mean-variance frontier by projected gradient ascent on the simplex.
 *
 * Long-only because you cannot hold a negative quantity of flights between two cities.
 * That constraint is not a simplification - it is the actual problem, and it is also
 * what keeps the solution stable when the covariance is poorly conditioned.
 *
 * The projection onto the simplex is the exact Euclidean projection (Duchi et al.),
 * not a normalise-and-clip, which would not be a projection and would not converge.
 */
export function projectToSimplex(v: readonly number[]): number[] {
  const n = v.length
  const u = [...v].sort((a, b) => b - a)
  let cssv = 0
  let rho = -1
  let theta = 0
  for (let i = 0; i < n; i++) {
    cssv += u[i]!
    const t = (cssv - 1) / (i + 1)
    if (u[i]! - t > 0) {
      rho = i
      theta = t
    }
  }
  if (rho < 0) return new Array(n).fill(1 / n)
  return v.map((x) => Math.max(0, x - theta))
}

export function efficientFrontier(
  mu: readonly number[],
  cov: Matrix,
  nPoints = 20,
  maxWeight = 1,
  iterations = 600,
): FrontierPoint[] {
  const p = mu.length
  const out: FrontierPoint[] = []

  // Step size from the largest eigenvalue proxy (row-sum bound) keeps the ascent
  // stable without computing a spectrum on every frontier point.
  let lmax = 0
  for (let i = 0; i < p; i++) {
    let s = 0
    for (let j = 0; j < p; j++) s += Math.abs(cov.data[i * p + j]!)
    lmax = Math.max(lmax, s)
  }

  for (let k = 0; k < nPoints; k++) {
    // Risk aversion swept on a log scale: the interesting structure is all at the
    // low-lambda end, and a linear sweep wastes most of its points on cash-like
    // corner solutions.
    const lambda = 0.05 * Math.pow(400, k / Math.max(1, nPoints - 1))
    let w = new Array<number>(p).fill(1 / p)
    const step = 1 / (2 * lambda * lmax + 1)

    for (let it = 0; it < iterations; it++) {
      const grad = new Array<number>(p)
      for (let i = 0; i < p; i++) {
        let cw = 0
        for (let j = 0; j < p; j++) cw += cov.data[i * p + j]! * w[j]!
        // Maximise  mu'w - lambda w'Sigma w
        grad[i] = mu[i]! - 2 * lambda * cw
      }
      const next = projectToSimplex(w.map((x, i) => x + step * grad[i]!))
      if (maxWeight < 1) {
        for (let i = 0; i < p; i++) next[i] = Math.min(next[i]!, maxWeight)
        const total = next.reduce((a, b) => a + b, 0)
        for (let i = 0; i < p; i++) next[i] = next[i]! / total
      }
      let delta = 0
      for (let i = 0; i < p; i++) delta = Math.max(delta, Math.abs(next[i]! - w[i]!))
      w = next
      if (delta < 1e-10) break
    }

    let er = 0
    for (let i = 0; i < p; i++) er += mu[i]! * w[i]!
    let variance = 0
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) variance += w[i]! * cov.data[i * p + j]! * w[j]!
    }
    const hhi = w.reduce((a, b) => a + b * b, 0)

    out.push({
      riskAversion: lambda,
      expectedReturn: er,
      volatility: Math.sqrt(Math.max(0, variance)),
      weights: w,
      // Inverse Herfindahl: how many routes the allocation is really spread across.
      effectiveN: hhi > 0 ? 1 / hhi : 0,
    })
  }

  return out.sort((a, b) => a.volatility - b.volatility)
}

// ---------------------------------------------------------------------------

export interface MonteCarloResult {
  readonly draws: Float64Array
  readonly mean: number
  readonly p50: number
  readonly p80: number
  readonly p95: number
  readonly var95: number
  readonly cvar95: number
  readonly histogram: { x: number; count: number }[]
}

/**
 * Monte Carlo for the budget simulator.
 *
 * One draw is one simulated YEAR, not one month, and three things about how it is
 * drawn decide whether the answer is worth anything:
 *
 *  1. **Rows, not cells.** Each simulated month resamples a single historical month
 *     and applies THAT month's return to every route at once. Drawing each route
 *     independently would destroy the cross-sectional correlation - fuel, season and
 *     capacity move Indian trunk routes together - and the shocks would cancel across
 *     legs instead of compounding. The tail would come out far too thin, and it would
 *     be too thin precisely in the years the provision was needed.
 *
 *  2. **Blocks, not single months.** Months are drawn in contiguous blocks, so a run
 *     of expensive months can occur in a simulated year at roughly the rate it occurs
 *     in the data. Independent monthly draws would average away the persistence that
 *     makes a bad year bad.
 *
 *  3. **A path, not a level.** Returns compound along the year and trips are spread
 *     across it, so a leg flown in month eleven is priced off eleven months of
 *     accumulated drift. Applying one return to every trip would model a parallel
 *     shift, which is not how a year of fares behaves.
 *
 * Returns are resampled from the empirical distribution rather than from a fitted
 * normal, because the whole point of the exercise is the tail and a normal has no tail
 * worth budgeting for.
 */
export function monteCarloBudget(
  legs: readonly { routeIdx: number; basePrice: number; count: number }[],
  routeReturns: readonly (readonly number[])[],
  draws: number,
  rng: () => number,
  bins = 40,
  months = 12,
  blockLength = 3,
): MonteCarloResult {
  // The history every leg is resampled from, aligned so that one index means the same
  // month for all of them. Legs whose route has no history are held at base price.
  const legRets = legs.map((l) => routeReturns[l.routeIdx] ?? [])
  const T = legRets.reduce((m, r) => Math.max(m, r.length), 0)

  // Trips spread across the year as evenly as they divide, remainder at the front.
  const tripsPerMonth = legs.map((l) => {
    const base = Math.floor(l.count / months)
    const extra = l.count - base * months
    return Array.from({ length: months }, (_, m) => base + (m < extra ? 1 : 0))
  })

  const totals = new Float64Array(draws)
  const cum = new Float64Array(legs.length)

  for (let d = 0; d < draws; d++) {
    cum.fill(0)
    let total = 0
    let m = 0
    while (m < months) {
      // One block start, shared by every leg - this is what keeps them correlated.
      const start = T > 0 ? Math.floor(rng() * T) : 0
      const len = Math.min(blockLength, months - m)
      for (let k = 0; k < len; k++) {
        const t = T > 0 ? (start + k) % T : 0
        for (let li = 0; li < legs.length; li++) {
          const rets = legRets[li]!
          if (rets.length > 0) cum[li] += rets[t % rets.length]!
        }
        for (let li = 0; li < legs.length; li++) {
          const n = tripsPerMonth[li]![m + k]!
          if (n > 0) total += n * legs[li]!.basePrice * Math.exp(cum[li]!)
        }
      }
      m += len
    }
    totals[d] = total
  }

  const sorted = Float64Array.from(totals).sort()
  const at = (q: number): number => quantile(sorted, q)
  const p50 = at(0.5)
  const p95 = at(0.95)
  let tail = 0
  let tailN = 0
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]! >= p95) {
      tail += sorted[i]!
      tailN++
    }
  }

  const lo = sorted[0]!
  const hi = sorted[sorted.length - 1]!
  const width = (hi - lo) / bins || 1
  const histogram: { x: number; count: number }[] = Array.from({ length: bins }, (_, i) => ({
    x: lo + (i + 0.5) * width,
    count: 0,
  }))
  for (let i = 0; i < sorted.length; i++) {
    const b = Math.min(bins - 1, Math.floor((sorted[i]! - lo) / width))
    histogram[b]!.count++
  }

  let mean = 0
  for (let i = 0; i < totals.length; i++) mean += totals[i]!
  mean /= totals.length

  return {
    draws: totals,
    mean,
    p50,
    p80: at(0.8),
    p95,
    // Both risk figures are OVERRUNS against the median outturn, not cost levels. A
    // "value at risk" quoted as a level is just the p95 under another name, and a
    // reader who budgets the median needs to know the gap, not the total again.
    var95: p95 - p50,
    cvar95: (tailN > 0 ? tail / tailN : p95) - p50,
    histogram,
  }
}

