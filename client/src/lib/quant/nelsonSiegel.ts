/**
 * Nelson-Siegel fit of the fare term structure.
 *
 * Borrowed from yield-curve modelling, and the analogy is exact enough to be useful:
 * the shape of fare against days-to-departure has a long-run level, a short-end
 * premium that decays, and a hump in the middle, which is precisely what the three
 * Nelson-Siegel factors describe.
 *
 *   f(h) = b0 + b1 * ((1 - e^-x) / x) + b2 * ((1 - e^-x) / x - e^-x),   x = h / tau
 *
 *   b0   long-horizon level - what a fare costs when booked far ahead
 *   b1   short-end premium  - the last-minute loading (NEGATIVE of the usual yield
 *        sign convention, because fares RISE toward departure while yields fall)
 *   b2   curvature          - the mid-horizon hump
 *   tau  where the hump sits, in days
 *
 * Fitting strategy: tau enters non-linearly, the three betas do not. So tau is
 * PROFILED over a grid - for each candidate tau the betas have a closed-form
 * least-squares solution - and the grid minimum is then refined by golden section.
 * This is exact where a general-purpose simplex search would only be approximate, and
 * it cannot land in a local minimum, which Nelder-Mead on this surface genuinely can.
 */

import { lstsq } from '@/lib/linalg/qr'
import { fromRows } from '@/lib/linalg/matrix'

export interface NelsonSiegelFit {
  readonly beta0: number
  readonly beta1: number
  readonly beta2: number
  readonly tau: number
  readonly rss: number
  readonly r2: number
  readonly n: number
  /** Fitted value at each input horizon. */
  readonly fitted: number[]
  /** A dense curve for plotting, 1..90 days. */
  readonly curve: { horizon: number; value: number }[]
  readonly interpretation: {
    readonly level: string
    readonly slope: string
    readonly curvature: string
    readonly tau: string
  }
}

function basis(h: number, tau: number): [number, number, number] {
  const x = Math.max(1e-9, h / tau)
  const e = Math.exp(-x)
  const b1 = (1 - e) / x
  const b2 = b1 - e
  return [1, b1, b2]
}

function fitAtTau(
  horizons: readonly number[],
  values: readonly number[],
  tau: number,
): { beta: [number, number, number]; rss: number } {
  const rows = horizons.map((h) => basis(h, tau) as unknown as number[])
  const X = fromRows(rows)
  const fit = lstsq(X, Float64Array.from(values))
  return {
    beta: [fit.beta[0]!, fit.beta[1]!, fit.beta[2]!],
    rss: fit.rss,
  }
}

export function fitNelsonSiegel(
  horizons: readonly number[],
  values: readonly number[],
  tauMin = 2,
  tauMax = 60,
  gridSteps = 120,
): NelsonSiegelFit {
  if (horizons.length !== values.length) throw new Error('fitNelsonSiegel: length mismatch')
  if (horizons.length < 4) throw new Error('fitNelsonSiegel: need at least 4 points')

  // Coarse grid over tau, on a log scale because the objective is far more sensitive
  // at small tau (where the short-end decay lives) than at large.
  let bestTau = tauMin
  let bestRss = Infinity
  for (let i = 0; i <= gridSteps; i++) {
    const tau = tauMin * Math.pow(tauMax / tauMin, i / gridSteps)
    const { rss } = fitAtTau(horizons, values, tau)
    if (rss < bestRss) {
      bestRss = rss
      bestTau = tau
    }
  }

  // Golden-section refinement inside the bracketing grid cell.
  const step = Math.pow(tauMax / tauMin, 1 / gridSteps)
  let lo = bestTau / step
  let hi = bestTau * step
  const phi = (Math.sqrt(5) - 1) / 2
  let c = hi - phi * (hi - lo)
  let d = lo + phi * (hi - lo)
  let fc = fitAtTau(horizons, values, c).rss
  let fd = fitAtTau(horizons, values, d).rss
  for (let i = 0; i < 60 && hi - lo > 1e-6; i++) {
    if (fc < fd) {
      hi = d
      d = c
      fd = fc
      c = hi - phi * (hi - lo)
      fc = fitAtTau(horizons, values, c).rss
    } else {
      lo = c
      c = d
      fc = fd
      d = lo + phi * (hi - lo)
      fd = fitAtTau(horizons, values, d).rss
    }
  }
  const tau = (lo + hi) / 2
  const { beta, rss } = fitAtTau(horizons, values, tau)

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const tss = values.reduce((a, b) => a + (b - mean) ** 2, 0)
  const r2 = tss > 0 ? 1 - rss / tss : NaN

  const evaluate = (h: number): number => {
    const [a, b1, b2] = basis(h, tau)
    return beta[0]! * a + beta[1]! * b1 + beta[2]! * b2
  }

  const curve: { horizon: number; value: number }[] = []
  for (let h = 1; h <= 90; h++) curve.push({ horizon: h, value: evaluate(h) })

  return {
    beta0: beta[0]!,
    beta1: beta[1]!,
    beta2: beta[2]!,
    tau,
    rss,
    r2,
    n: horizons.length,
    fitted: horizons.map(evaluate),
    curve,
    interpretation: {
      level: `Long-horizon level: a fare booked well ahead sits at ${beta[0]!.toFixed(3)} in logs.`,
      slope:
        beta[1]! > 0
          ? `Short-end premium of ${(beta[1]! * 100).toFixed(1)} log points - fares load toward departure.`
          : `Short-end DISCOUNT of ${(Math.abs(beta[1]!) * 100).toFixed(1)} log points - unusual; distressed inventory near departure.`,
      curvature:
        Math.abs(beta[2]!) < 0.02
          ? 'Essentially no mid-horizon hump: the curve runs straight from the far end into the spike.'
          : beta[2]! > 0
            ? `Mid-horizon hump of ${(beta[2]! * 100).toFixed(1)} log points around T-${Math.round(tau)}.`
            : `Mid-horizon dip of ${(Math.abs(beta[2]!) * 100).toFixed(1)} log points around T-${Math.round(tau)} - the cheapest window.`,
      tau: `Decay parameter tau = ${tau.toFixed(1)} days: the short-end effect has largely died away by about T-${Math.round(tau * 3)}.`,
    },
  }
}
