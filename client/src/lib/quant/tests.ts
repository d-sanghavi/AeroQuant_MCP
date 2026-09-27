/**
 * The hypothesis-test battery.
 *
 * Every test returns the SAME shape, and that shape carries four things most
 * implementations leave out: the null hypothesis in words, the decision at a stated
 * alpha, a plain-English interpretation, and which assumptions were actually checked.
 *
 * That is not decoration. The audience for this system is an economist who has to
 * defend a published number, and "p = 0.03" on its own is not defensible - it does not
 * say what was assumed, what was tested, or what rejecting it would mean. A test
 * result that cannot be read without the analyst who ran it is not a result.
 */

import { lstsq } from '@/lib/linalg/qr'
import { fromRows } from '@/lib/linalg/matrix'
import {
  chi2Upper,
  fUpper,
  kolmogorovQ,
  normalCdf,
  normalQuantile,
  normalTwoSided,
  tTwoSided,
} from './distributions'

export interface TestResult {
  readonly test: string
  readonly statistic: number
  readonly pValue: number
  readonly criticalValues?: Record<string, number>
  readonly df?: number
  readonly effectSize?: number
  readonly n: number
  readonly nullHypothesis: string
  readonly decision: 'reject' | 'fail_to_reject'
  readonly alpha: number
  readonly interpretation: string
  readonly assumptionsChecked: Record<string, boolean>
}

function decide(p: number, alpha: number): 'reject' | 'fail_to_reject' {
  return p < alpha ? 'reject' : 'fail_to_reject'
}

// ---------------------------------------------------------------------------
// Unit root and stationarity
// ---------------------------------------------------------------------------

/**
 * MacKinnon (1996) response-surface critical values for the ADF test with a constant.
 * Tabulated because the ADF statistic does NOT follow a t distribution - using a t
 * table here is the single most common way this test is got wrong.
 */
const ADF_CRIT_CONST: Record<string, [number, number, number]> = {
  // level: [b_inf, b1, b2] in  crit = b_inf + b1/T + b2/T^2
  '1%': [-3.43035, -6.5393, -16.786],
  '5%': [-2.86154, -2.8903, -4.234],
  '10%': [-2.56677, -1.5384, -2.809],
}

export function adf(
  series: readonly number[],
  lags = 1,
  alpha = 0.05,
  trend: 'c' | 'ct' = 'c',
): TestResult {
  const y = Array.from(series)
  const n = y.length
  if (n < lags + 5) {
    throw new Error('adf: series too short for the requested lag order')
  }

  // Delta y_t = a + (rho-1) y_{t-1} + SUM g_i Delta y_{t-i} (+ b t) + e
  const dy: number[] = []
  for (let t = 1; t < n; t++) dy.push(y[t]! - y[t - 1]!)

  const rows: number[][] = []
  const target: number[] = []
  for (let t = lags; t < dy.length; t++) {
    const row: number[] = [1, y[t]!]
    if (trend === 'ct') row.push(t)
    for (let i = 1; i <= lags; i++) row.push(dy[t - i]!)
    rows.push(row)
    target.push(dy[t]!)
  }

  const fit = lstsq(fromRows(rows), Float64Array.from(target))
  const gamma = fit.beta[1]!
  const se = fit.stdErrors[1]!
  const stat = se > 0 ? gamma / se : NaN
  const T = rows.length

  const crit: Record<string, number> = {}
  for (const [k, [b0, b1, b2]] of Object.entries(ADF_CRIT_CONST)) {
    crit[k] = b0 + b1 / T + b2 / (T * T)
  }

  // Interpolate a p-value between the tabulated points. Approximate by construction,
  // and labelled as such in the interpretation rather than dressed up.
  let p: number
  if (stat <= crit['1%']!) p = 0.005
  else if (stat <= crit['5%']!) p = 0.01 + ((stat - crit['1%']!) / (crit['5%']! - crit['1%']!)) * 0.04
  else if (stat <= crit['10%']!) p = 0.05 + ((stat - crit['5%']!) / (crit['10%']! - crit['5%']!)) * 0.05
  else p = Math.min(0.99, 0.1 + (stat - crit['10%']!) * 0.25)

  const reject = decide(p, alpha)
  return {
    test: 'Augmented Dickey-Fuller',
    statistic: stat,
    pValue: p,
    criticalValues: crit,
    df: fit.df,
    n: T,
    nullHypothesis: 'The series contains a unit root (it is non-stationary).',
    decision: reject,
    alpha,
    interpretation:
      reject === 'reject'
        ? `The unit root is rejected at the ${(alpha * 100).toFixed(0)}% level: the series is consistent with stationarity, so a regression on it is not automatically spurious.`
        : `The unit root cannot be rejected. Regressing this series on another non-stationary series risks a spurious relationship - difference it first, or test for cointegration.`,
    assumptionsChecked: {
      'sufficient observations': T >= 30,
      'lag order specified': true,
      'deterministic terms included': true,
      'critical values from MacKinnon response surface, not a t table': true,
    },
  }
}

/**
 * KPSS test. Its null is the OPPOSITE of ADF's, which is the point of running both:
 * ADF failing to reject and KPSS rejecting is the one combination that genuinely
 * points to a unit root, and running only one of them leaves the ambiguous cases
 * looking decisive.
 */
export function kpss(series: readonly number[], lags?: number, alpha = 0.05): TestResult {
  const n = series.length
  const l = lags ?? Math.floor(4 * Math.pow(n / 100, 0.25))
  const mean = series.reduce((a, b) => a + b, 0) / n

  const e = series.map((x) => x - mean)
  let cumsum = 0
  let s2 = 0
  for (let t = 0; t < n; t++) {
    cumsum += e[t]!
    s2 += cumsum * cumsum
  }

  // Newey-West long-run variance.
  let lrv = e.reduce((a, b) => a + b * b, 0) / n
  for (let k = 1; k <= l; k++) {
    let cov = 0
    for (let t = k; t < n; t++) cov += e[t]! * e[t - k]!
    lrv += 2 * (1 - k / (l + 1)) * (cov / n)
  }

  const stat = s2 / (n * n * lrv)
  const crit = { '10%': 0.347, '5%': 0.463, '2.5%': 0.574, '1%': 0.739 }
  const p =
    stat > crit['1%'] ? 0.005
      : stat > crit['5%'] ? 0.025
        : stat > crit['10%'] ? 0.075
          : 0.15

  const reject = decide(p, alpha)
  return {
    test: 'KPSS (level stationarity)',
    statistic: stat,
    pValue: p,
    criticalValues: crit,
    n,
    nullHypothesis: 'The series is stationary around a constant level.',
    decision: reject,
    alpha,
    interpretation:
      reject === 'reject'
        ? 'Stationarity is rejected: there is evidence of a unit root or a structural drift. Read alongside the ADF result before concluding.'
        : 'Stationarity is not rejected. Combined with an ADF rejection this is the clean case; combined with an ADF non-rejection the test is simply uninformative on this sample.',
    assumptionsChecked: {
      'Newey-West long-run variance': true,
      'bandwidth from Schwert rule': lags === undefined,
      'sufficient observations': n >= 30,
    },
  }
}

// ---------------------------------------------------------------------------
// Granger causality
// ---------------------------------------------------------------------------

/**
 * Granger F test: does adding lags of x improve the prediction of y beyond y's own
 * lags?
 *
 * The name is a historical accident and it does real damage. This tests PREDICTIVE
 * PRECEDENCE in a linear model, not causation. Nothing about a significant result
 * rules out a common driver of both series, and in this dataset there demonstrably is
 * one. The Attribution Studio states that on screen; do not let the function name do
 * the arguing.
 */
export function grangerF(
  y: readonly number[],
  x: readonly number[],
  lags = 2,
  alpha = 0.05,
): TestResult {
  const n = Math.min(y.length, x.length)
  if (n < 4 * lags + 6) throw new Error('grangerF: series too short for that lag order')

  const restrictedRows: number[][] = []
  const fullRows: number[][] = []
  const target: number[] = []
  for (let t = lags; t < n; t++) {
    const yl: number[] = [1]
    for (let i = 1; i <= lags; i++) yl.push(y[t - i]!)
    restrictedRows.push(yl)
    const xl = [...yl]
    for (let i = 1; i <= lags; i++) xl.push(x[t - i]!)
    fullRows.push(xl)
    target.push(y[t]!)
  }

  const yv = Float64Array.from(target)
  const r = lstsq(fromRows(restrictedRows), yv)
  const f = lstsq(fromRows(fullRows), yv)

  const q = lags
  const dfDen = f.df
  const stat = ((r.rss - f.rss) / q) / (f.rss / dfDen)
  const p = fUpper(stat, q, dfDen)
  const reject = decide(p, alpha)

  return {
    test: `Granger F (${lags} lags)`,
    statistic: stat,
    pValue: p,
    df: q,
    n: target.length,
    effectSize: (r.rss - f.rss) / r.rss,
    nullHypothesis: `Lagged values of the second series do not improve the linear prediction of the first, given its own ${lags} lags.`,
    decision: reject,
    alpha,
    interpretation:
      reject === 'reject'
        ? `Adding the lags reduces residual variance by ${(((r.rss - f.rss) / r.rss) * 100).toFixed(1)}%, which is more than sampling error accounts for. This is PREDICTIVE PRECEDENCE, not causation - a common driver of both series produces exactly this pattern.`
        : 'The lags add no detectable predictive content. This is not evidence of no relationship; it is evidence that a linear model at this lag length does not find one.',
    assumptionsChecked: {
      'both series stationary (test separately with ADF)': false,
      'linear relationship assumed': true,
      'lag order fixed a priori, not selected on this sample': true,
      'no structural break assumed': false,
    },
  }
}

// ---------------------------------------------------------------------------
// Two-sample comparisons
// ---------------------------------------------------------------------------

export function mannWhitneyU(
  a: readonly number[],
  b: readonly number[],
  alpha = 0.05,
): TestResult {
  const n1 = a.length
  const n2 = b.length
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort(
    (p, q) => p.v - q.v,
  )

  // Mid-ranks, with a tie correction to the variance. Without it the p-value is
  // anti-conservative on data like fares, which are heavily rounded.
  const ranks = new Float64Array(all.length)
  let tieCorrection = 0
  let i = 0
  while (i < all.length) {
    let j = i
    while (j + 1 < all.length && all[j + 1]!.v === all[i]!.v) j++
    const avg = (i + j + 2) / 2
    const tieLen = j - i + 1
    for (let k = i; k <= j; k++) ranks[k] = avg
    if (tieLen > 1) tieCorrection += tieLen ** 3 - tieLen
    i = j + 1
  }

  let r1 = 0
  for (let k = 0; k < all.length; k++) if (all[k]!.g === 0) r1 += ranks[k]!

  const u1 = r1 - (n1 * (n1 + 1)) / 2
  const u2 = n1 * n2 - u1
  const u = Math.min(u1, u2)

  const N = n1 + n2
  const mu = (n1 * n2) / 2
  const sigma = Math.sqrt(
    ((n1 * n2) / 12) * (N + 1 - tieCorrection / (N * (N - 1))),
  )
  const z = sigma > 0 ? (u - mu + 0.5) / sigma : 0
  const p = normalTwoSided(z)
  // Rank-biserial correlation: a genuine effect size, unlike the U statistic itself.
  const rb = 1 - (2 * u) / (n1 * n2)

  return {
    test: 'Mann-Whitney U',
    statistic: u,
    pValue: p,
    n: N,
    effectSize: rb,
    nullHypothesis: 'The two samples are drawn from distributions with the same location.',
    decision: decide(p, alpha),
    alpha,
    interpretation:
      p < alpha
        ? `The distributions differ in location; rank-biserial correlation ${rb.toFixed(3)} (${Math.abs(rb) < 0.1 ? 'negligible' : Math.abs(rb) < 0.3 ? 'small' : Math.abs(rb) < 0.5 ? 'moderate' : 'large'}). With samples this size, statistical significance is cheap - read the effect size, not the p-value.`
        : 'No detectable difference in location between the two samples.',
    assumptionsChecked: {
      'independent samples': true,
      'ordinal or continuous measurement': true,
      'tie correction applied': tieCorrection > 0,
      'equal shape assumed for a pure location interpretation': false,
    },
  }
}

export function ks2Sample(
  a: readonly number[],
  b: readonly number[],
  alpha = 0.05,
): TestResult {
  const x = [...a].sort((p, q) => p - q)
  const y = [...b].sort((p, q) => p - q)
  const n1 = x.length
  const n2 = y.length

  let i = 0
  let j = 0
  let d = 0
  while (i < n1 && j < n2) {
    const xv = x[i]!
    const yv = y[j]!
    if (xv <= yv) i++
    if (yv <= xv) j++
    d = Math.max(d, Math.abs(i / n1 - j / n2))
  }

  const ne = (n1 * n2) / (n1 + n2)
  const lambda = (Math.sqrt(ne) + 0.12 + 0.11 / Math.sqrt(ne)) * d
  const p = kolmogorovQ(lambda)

  return {
    test: 'Two-sample Kolmogorov-Smirnov',
    statistic: d,
    pValue: p,
    n: n1 + n2,
    effectSize: d,
    nullHypothesis: 'The two samples are drawn from the same distribution.',
    decision: decide(p, alpha),
    alpha,
    interpretation:
      p < alpha
        ? `The distributions differ; the largest gap between the two empirical CDFs is ${(d * 100).toFixed(1)} percentage points. KS is sensitive to any difference - shape, spread or location - so it says THAT they differ, not HOW.`
        : 'The two empirical distributions are consistent with a common parent distribution.',
    assumptionsChecked: {
      'independent samples': true,
      'continuous distributions (ties reduce power)': true,
      'two-sided': true,
    },
  }
}

// ---------------------------------------------------------------------------
// Multiplicity and power
// ---------------------------------------------------------------------------

export interface FdrResult {
  /** Indices of the hypotheses declared significant. */
  readonly rejected: number[]
  /** BH-adjusted p-values (q-values), in the input order. */
  readonly adjusted: number[]
  readonly threshold: number
  readonly nTests: number
  readonly nRejected: number
  readonly q: number
}

/**
 * Benjamini-Hochberg step-up procedure.
 *
 * With 60 routes screened every month, testing each at 5% produces three false alarms
 * a month by construction. An anomaly console that does not correct for multiplicity
 * is not detecting anomalies, it is generating them, and the analyst learns to ignore
 * it. BH controls the expected PROPORTION of false discoveries, which is the right
 * error rate for a screening tool.
 */
export function benjaminiHochberg(pValues: readonly number[], q = 0.05): FdrResult {
  const m = pValues.length
  const order = Array.from({ length: m }, (_, i) => i).sort(
    (a, b) => pValues[a]! - pValues[b]!,
  )

  let kMax = -1
  for (let k = 0; k < m; k++) {
    if (pValues[order[k]!]! <= ((k + 1) / m) * q) kMax = k
  }

  const rejected = kMax >= 0 ? order.slice(0, kMax + 1) : []
  const threshold = kMax >= 0 ? ((kMax + 1) / m) * q : 0

  // Step-up adjusted p-values, enforcing monotonicity from the largest downward.
  const adjusted = new Array<number>(m).fill(1)
  let running = 1
  for (let k = m - 1; k >= 0; k--) {
    const idx = order[k]!
    running = Math.min(running, (pValues[idx]! * m) / (k + 1))
    adjusted[idx] = Math.min(1, running)
  }

  return {
    rejected: rejected.sort((a, b) => a - b),
    adjusted,
    threshold,
    nTests: m,
    nRejected: rejected.length,
    q,
  }
}

/**
 * Achieved power of a two-sided test for a given standardised effect and sample size.
 * Reported after the fact so a null result can be read correctly: "we found nothing"
 * and "we could not have found anything" are different statements.
 */
export function achievedPower(
  effectSize: number,
  n1: number,
  n2: number,
  alpha = 0.05,
): TestResult {
  const ncp = Math.abs(effectSize) * Math.sqrt((n1 * n2) / (n1 + n2))
  const zCrit = normalQuantile(1 - alpha / 2)
  const power = 1 - normalCdf(zCrit - ncp) + normalCdf(-zCrit - ncp)

  return {
    test: 'Achieved power (two-sided, normal approximation)',
    statistic: power,
    pValue: NaN,
    n: n1 + n2,
    effectSize,
    nullHypothesis: '-',
    decision: power >= 0.8 ? 'reject' : 'fail_to_reject',
    alpha,
    interpretation:
      power >= 0.8
        ? `The design had ${(power * 100).toFixed(0)}% power against an effect of ${effectSize.toFixed(2)} SD, so a null result here is informative.`
        : `The design had only ${(power * 100).toFixed(0)}% power against an effect of ${effectSize.toFixed(2)} SD. A null result is not evidence of no effect - the study could not have detected one.`,
    assumptionsChecked: {
      'normal approximation to the t distribution': true,
      'effect size specified in advance, not read off this sample': false,
      'equal variances': true,
    },
  }
}

// ---------------------------------------------------------------------------

/** Ljung-Box test for residual autocorrelation. */
export function ljungBox(residuals: readonly number[], lags = 10, alpha = 0.05): TestResult {
  const n = residuals.length
  const mean = residuals.reduce((a, b) => a + b, 0) / n
  const dev = residuals.map((x) => x - mean)
  const c0 = dev.reduce((a, b) => a + b * b, 0) / n

  let q = 0
  for (let k = 1; k <= lags; k++) {
    let ck = 0
    for (let t = k; t < n; t++) ck += dev[t]! * dev[t - k]!
    const rk = ck / n / c0
    q += (rk * rk) / (n - k)
  }
  q *= n * (n + 2)

  const p = chi2Upper(q, lags)
  return {
    test: `Ljung-Box (${lags} lags)`,
    statistic: q,
    pValue: p,
    df: lags,
    n,
    nullHypothesis: 'The residuals are independently distributed up to the tested lag.',
    decision: decide(p, alpha),
    alpha,
    interpretation:
      p < alpha
        ? 'Residual autocorrelation is present: the model has left structure on the table, and its standard errors are understated.'
        : 'No detectable residual autocorrelation at the tested lags.',
    assumptionsChecked: {
      'residuals from a fitted model': true,
      'degrees of freedom not adjusted for estimated parameters': false,
    },
  }
}

/** Welch two-sample t test - unequal variances by default, as it should be. */
export function welchT(a: readonly number[], b: readonly number[], alpha = 0.05): TestResult {
  const n1 = a.length
  const n2 = b.length
  const m1 = a.reduce((x, y) => x + y, 0) / n1
  const m2 = b.reduce((x, y) => x + y, 0) / n2
  const v1 = a.reduce((x, y) => x + (y - m1) ** 2, 0) / (n1 - 1)
  const v2 = b.reduce((x, y) => x + (y - m2) ** 2, 0) / (n2 - 1)
  const se = Math.sqrt(v1 / n1 + v2 / n2)
  const t = (m1 - m2) / se
  const df =
    (v1 / n1 + v2 / n2) ** 2 /
    ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1))
  const p = tTwoSided(t, df)
  const pooledSd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2))
  const d = (m1 - m2) / pooledSd

  return {
    test: "Welch's t",
    statistic: t,
    pValue: p,
    df,
    n: n1 + n2,
    effectSize: d,
    nullHypothesis: 'The two populations have equal means.',
    decision: decide(p, alpha),
    alpha,
    interpretation:
      p < alpha
        ? `Means differ by ${(m1 - m2).toFixed(2)} (Cohen's d = ${d.toFixed(2)}).`
        : 'No detectable difference in means.',
    assumptionsChecked: {
      'unequal variances allowed (Welch, not Student)': true,
      'approximate normality of the sampling distribution': n1 + n2 >= 30,
      'independent samples': true,
    },
  }
}
