/**
 * Time-series utilities: decomposition, autocorrelation, volatility.
 *
 * The seasonal decomposition here is a genuine STL (Cleveland et al. 1990) rather than
 * a classical moving-average split. It matters for this data: airfare seasonality is
 * not constant year to year - the festival calendar moves - and a classical
 * decomposition, which forces one fixed seasonal profile, would push that movement
 * into the trend and produce a trend that appears to jump every Diwali.
 */

import { normalTwoSided } from './distributions'

// ---------------------------------------------------------------------------
// LOESS
// ---------------------------------------------------------------------------

/**
 * Local linear regression with tricube weights.
 * `span` is the fraction of points in each local neighbourhood.
 */
export function loess(
  y: readonly number[],
  span = 0.5,
  robustnessWeights?: readonly number[],
): number[] {
  const n = y.length
  const q = Math.max(2, Math.min(n, Math.round(span * n)))
  const out = new Array<number>(n)

  for (let i = 0; i < n; i++) {
    // Nearest q points by index distance (the design is evenly spaced time).
    let lo = Math.max(0, i - Math.floor(q / 2))
    const hi = Math.min(n - 1, lo + q - 1)
    lo = Math.max(0, hi - q + 1)
    const maxDist = Math.max(i - lo, hi - i) || 1

    let sw = 0
    let sx = 0
    let sy = 0
    let sxx = 0
    let sxy = 0
    for (let j = lo; j <= hi; j++) {
      const u = Math.abs(j - i) / maxDist
      let w = u >= 1 ? 0 : Math.pow(1 - u * u * u, 3)
      if (robustnessWeights) w *= robustnessWeights[j]!
      if (w <= 0) continue
      const x = j
      sw += w
      sx += w * x
      sy += w * y[j]!
      sxx += w * x * x
      sxy += w * x * y[j]!
    }
    if (sw === 0) {
      out[i] = y[i]!
      continue
    }
    const denom = sw * sxx - sx * sx
    if (Math.abs(denom) < 1e-12) {
      out[i] = sy / sw
    } else {
      const b = (sw * sxy - sx * sy) / denom
      const a = (sy - b * sx) / sw
      out[i] = a + b * i
    }
  }
  return out
}

export interface StlResult {
  readonly trend: number[]
  readonly seasonal: number[]
  readonly remainder: number[]
  readonly period: number
  readonly iterations: number
  /** Share of variance explained by the seasonal component. */
  readonly seasonalStrength: number
  readonly trendStrength: number
}

/**
 * Seasonal-trend decomposition by LOESS, additive.
 *
 * Inner loop: detrend, smooth each cycle-subseries, low-pass filter the result,
 * deseasonalise, re-smooth the trend. Two outer robustness iterations, which is enough
 * for 24 monthly points - more would be fitting the noise.
 */
export function stl(
  series: readonly number[],
  period = 12,
  opts: { seasonalSpan?: number; trendSpan?: number; inner?: number } = {},
): StlResult {
  const n = series.length
  if (n < 2 * period) {
    // Not enough data for a seasonal fit. Say so by returning a zero seasonal rather
    // than inventing one from a single cycle.
    const trend = loess(series, opts.trendSpan ?? 0.6)
    return {
      trend,
      seasonal: new Array(n).fill(0),
      remainder: series.map((v, i) => v - trend[i]!),
      period,
      iterations: 0,
      seasonalStrength: 0,
      trendStrength: NaN,
    }
  }

  const inner = opts.inner ?? 2
  const seasonalSpan = opts.seasonalSpan ?? 0.75
  const trendSpan = opts.trendSpan ?? 0.35

  let trend = new Array<number>(n).fill(0)
  let seasonal = new Array<number>(n).fill(0)

  for (let it = 0; it < inner; it++) {
    // 1. Detrend.
    const detrended = series.map((v, i) => v - trend[i]!)

    // 2. Smooth each cycle-subseries (all Januaries, all Februaries, ...).
    const smoothed = new Array<number>(n).fill(0)
    for (let phase = 0; phase < period; phase++) {
      const idx: number[] = []
      const sub: number[] = []
      for (let i = phase; i < n; i += period) {
        idx.push(i)
        sub.push(detrended[i]!)
      }
      const s = loess(sub, seasonalSpan)
      for (let k = 0; k < idx.length; k++) smoothed[idx[k]!] = s[k]!
    }

    // 3. Low-pass the seasonal and subtract, so no trend leaks into it.
    const lowPass = loess(smoothed, Math.min(0.9, (2 * period) / n))
    seasonal = smoothed.map((v, i) => v - lowPass[i]!)

    // 4. Deseasonalise and re-smooth the trend.
    const deseasonalised = series.map((v, i) => v - seasonal[i]!)
    trend = loess(deseasonalised, trendSpan)
  }

  const remainder = series.map((v, i) => v - trend[i]! - seasonal[i]!)

  const varOf = (xs: readonly number[]): number => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length
    return xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)
  }
  const vr = varOf(remainder)
  const seasonalStrength = Math.max(
    0,
    1 - vr / Math.max(1e-300, varOf(seasonal.map((s, i) => s + remainder[i]!))),
  )
  const trendStrength = Math.max(
    0,
    1 - vr / Math.max(1e-300, varOf(trend.map((t, i) => t + remainder[i]!))),
  )

  return { trend, seasonal, remainder, period, iterations: inner, seasonalStrength, trendStrength }
}

// ---------------------------------------------------------------------------

export interface AcfResult {
  readonly lags: number[]
  readonly values: number[]
  /** +/- this is the approximate 95% band under a white-noise null. */
  readonly confidenceBand: number
  readonly n: number
}

export function acf(series: readonly number[], maxLag = 24): AcfResult {
  const n = series.length
  const mean = series.reduce((a, b) => a + b, 0) / n
  const dev = series.map((x) => x - mean)
  const c0 = dev.reduce((a, b) => a + b * b, 0)

  const lags: number[] = []
  const values: number[] = []
  const L = Math.min(maxLag, n - 2)
  for (let k = 0; k <= L; k++) {
    let ck = 0
    for (let t = k; t < n; t++) ck += dev[t]! * dev[t - k]!
    lags.push(k)
    values.push(c0 > 0 ? ck / c0 : NaN)
  }
  return { lags, values, confidenceBand: 1.96 / Math.sqrt(n), n }
}

/** Partial autocorrelation by the Durbin-Levinson recursion. */
export function pacf(series: readonly number[], maxLag = 12): AcfResult {
  const r = acf(series, maxLag).values
  const L = Math.min(maxLag, r.length - 1)
  const phi: number[][] = Array.from({ length: L + 1 }, () => new Array<number>(L + 1).fill(0))
  const values: number[] = [1]
  const lags: number[] = [0]

  for (let k = 1; k <= L; k++) {
    let num = r[k]!
    for (let j = 1; j < k; j++) num -= phi[k - 1]![j]! * r[k - j]!
    let den = 1
    for (let j = 1; j < k; j++) den -= phi[k - 1]![j]! * r[j]!
    const pk = den !== 0 ? num / den : 0
    phi[k]![k] = pk
    for (let j = 1; j < k; j++) {
      phi[k]![j] = phi[k - 1]![j]! - pk * phi[k - 1]![k - j]!
    }
    values.push(pk)
    lags.push(k)
  }
  return { lags, values, confidenceBand: 1.96 / Math.sqrt(series.length), n: series.length }
}

export function rollingVol(series: readonly number[], window = 6, annualise = 12): number[] {
  const out = new Array<number>(series.length).fill(NaN)
  for (let t = window - 1; t < series.length; t++) {
    let s = 0
    for (let k = 0; k < window; k++) s += series[t - k]!
    const m = s / window
    let v = 0
    for (let k = 0; k < window; k++) v += (series[t - k]! - m) ** 2
    out[t] = Math.sqrt((v / (window - 1)) * annualise)
  }
  return out
}

/** Log differences. The natural scale for price series. */
export function logReturns(levels: readonly number[]): number[] {
  const out: number[] = []
  for (let t = 1; t < levels.length; t++) {
    const a = levels[t - 1]!
    const b = levels[t]!
    out.push(a > 0 && b > 0 ? Math.log(b / a) : NaN)
  }
  return out
}

// ---------------------------------------------------------------------------

export interface Garch11Result {
  readonly omega: number
  readonly alpha: number
  readonly beta: number
  readonly persistence: number
  readonly logLikelihood: number
  readonly conditionalVol: number[]
  readonly longRunVol: number
  readonly converged: boolean
  readonly note: string
}

/**
 * GARCH(1,1) by quasi-maximum likelihood.
 *
 * sigma2_t = omega + alpha * e2_{t-1} + beta * sigma2_{t-1}
 *
 * Optimised by Nelder-Mead over an unconstrained reparameterisation (log for omega,
 * logistic for alpha and beta with alpha + beta < 1 enforced by construction). The
 * constraint is not optional: alpha + beta >= 1 is an integrated process with no
 * finite long-run variance, and an optimiser left free will happily wander there on
 * short samples and report a "long-run volatility" that does not exist.
 */
export function garch11(returns: readonly number[]): Garch11Result {
  const r = returns.filter((x) => Number.isFinite(x))
  const n = r.length
  if (n < 20) {
    return {
      omega: NaN, alpha: NaN, beta: NaN, persistence: NaN, logLikelihood: NaN,
      conditionalVol: [], longRunVol: NaN, converged: false,
      note: `Only ${n} usable observations - too few to identify a GARCH(1,1).`,
    }
  }

  const mean = r.reduce((a, b) => a + b, 0) / n
  const e = r.map((x) => x - mean)
  const uncondVar = e.reduce((a, b) => a + b * b, 0) / n

  const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x))

  // theta -> (omega, alpha, beta) with alpha + beta < 1 by construction.
  const unpack = (theta: readonly number[]): [number, number, number] => {
    const omega = Math.exp(theta[0]!)
    const persistence = 0.999 * sigmoid(theta[1]!)
    const alphaShare = sigmoid(theta[2]!)
    return [omega, persistence * alphaShare, persistence * (1 - alphaShare)]
  }

  const negLogLik = (theta: readonly number[]): number => {
    const [omega, alpha, beta] = unpack(theta)
    let s2 = uncondVar
    let ll = 0
    for (let t = 0; t < n; t++) {
      if (t > 0) s2 = omega + alpha * e[t - 1]! ** 2 + beta * s2
      if (!(s2 > 0) || !Number.isFinite(s2)) return 1e12
      ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(s2) + (e[t]! ** 2) / s2)
    }
    return Number.isFinite(ll) ? -ll : 1e12
  }

  const start = [Math.log(uncondVar * 0.1), 2.2, -1.4] // ~ (0.1 var, persistence .9, alpha .2)
  const { x, converged } = nelderMead(negLogLik, start, 800)
  const [omega, alpha, beta] = unpack(x)
  const persistence = alpha + beta

  const conditionalVol: number[] = []
  let s2 = uncondVar
  for (let t = 0; t < n; t++) {
    if (t > 0) s2 = omega + alpha * e[t - 1]! ** 2 + beta * s2
    conditionalVol.push(Math.sqrt(s2))
  }

  const longRun = persistence < 1 ? Math.sqrt(omega / (1 - persistence)) : NaN

  return {
    omega,
    alpha,
    beta,
    persistence,
    logLikelihood: -negLogLik(x),
    conditionalVol,
    longRunVol: longRun,
    converged,
    note:
      persistence > 0.98
        ? `Persistence ${persistence.toFixed(3)} is close to one: volatility shocks decay very slowly and the long-run variance is barely identified on ${n} observations.`
        : `Persistence ${persistence.toFixed(3)} - a volatility shock has half-decayed after about ${Math.round(Math.log(0.5) / Math.log(persistence))} periods.`,
  }
}

/**
 * Nelder-Mead simplex. Small, dependency-free, and adequate for the 3-parameter
 * problems it is used on here. It is NOT used for the Nelson-Siegel fit - see the
 * comment in nelsonSiegel.ts for why profiling beats a simplex search there.
 */
export function nelderMead(
  f: (x: readonly number[]) => number,
  start: readonly number[],
  maxIter = 500,
  tol = 1e-10,
): { x: number[]; fx: number; iterations: number; converged: boolean } {
  const n = start.length
  const alpha = 1
  const gamma = 2
  const rho = 0.5
  const sigma = 0.5

  let simplex: { x: number[]; fx: number }[] = [{ x: [...start], fx: f(start) }]
  for (let i = 0; i < n; i++) {
    const p = [...start]
    p[i] = p[i]! !== 0 ? p[i]! * 1.05 : 0.00025
    simplex.push({ x: p, fx: f(p) })
  }

  let it = 0
  for (; it < maxIter; it++) {
    simplex.sort((a, b) => a.fx - b.fx)
    if (Math.abs(simplex[n]!.fx - simplex[0]!.fx) < tol) break

    const centroid = new Array<number>(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i]!.x[j]! / n
    }

    const worst = simplex[n]!
    const reflected = centroid.map((c, j) => c + alpha * (c - worst.x[j]!))
    const fr = f(reflected)

    if (fr < simplex[0]!.fx) {
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j]! - c))
      const fe = f(expanded)
      simplex[n] = fe < fr ? { x: expanded, fx: fe } : { x: reflected, fx: fr }
    } else if (fr < simplex[n - 1]!.fx) {
      simplex[n] = { x: reflected, fx: fr }
    } else {
      const contracted = centroid.map((c, j) => c + rho * (worst.x[j]! - c))
      const fc = f(contracted)
      if (fc < worst.fx) {
        simplex[n] = { x: contracted, fx: fc }
      } else {
        const best = simplex[0]!
        simplex = simplex.map((s) => {
          const p = s.x.map((v, j) => best.x[j]! + sigma * (v - best.x[j]!))
          return { x: p, fx: f(p) }
        })
      }
    }
  }

  simplex.sort((a, b) => a.fx - b.fx)
  return { x: simplex[0]!.x, fx: simplex[0]!.fx, iterations: it, converged: it < maxIter }
}

/** Z test that an autocorrelation at a given lag differs from zero. */
export function acfSignificance(rho: number, n: number): { z: number; p: number } {
  const z = rho * Math.sqrt(n)
  return { z, p: normalTwoSided(z) }
}
