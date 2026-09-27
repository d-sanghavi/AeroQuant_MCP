/**
 * Distribution functions.
 *
 * Written out rather than imported because the prototype ships no stats library, and
 * because a p-value from a hand-waved approximation is worse than no p-value: it looks
 * exactly as authoritative as a correct one. These are the standard continued-fraction
 * and series expansions (Numerical Recipes / Lentz), accurate to ~1e-12 over the
 * ranges that matter here.
 */

const SQRT2 = Math.SQRT2
const LOG_SQRT_2PI = 0.9189385332046727

/** Lanczos approximation to log Gamma. */
export function lgamma(x: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
  }
  const z = x - 1
  let a = 0.99999999999980993
  const t = z + 7.5
  for (let i = 0; i < g.length; i++) a += g[i]! / (z + i + 1)
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Error function, Abramowitz and Stegun 7.1.26 refined by a rational minimax. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const y =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  return sign * (1 - y)
}

export function normalCdf(x: number, mean = 0, sd = 1): number {
  return 0.5 * (1 + erf((x - mean) / (sd * SQRT2)))
}

export function normalPdf(x: number, mean = 0, sd = 1): number {
  const z = (x - mean) / sd
  return Math.exp(-0.5 * z * z - LOG_SQRT_2PI) / sd
}

/** Inverse normal CDF (Acklam's rational approximation, refined by one Halley step). */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416]
  const pLow = 0.02425
  let x: number
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  } else if (p <= 1 - pLow) {
    const q = p - 0.5
    const r = q * q
    x = (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  }
  // One Halley refinement brings it to full double precision.
  const e = normalCdf(x) - p
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2)
  return x - u / (1 + (x * u) / 2)
}

/** Regularised incomplete beta, by the modified Lentz continued fraction. */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b)
  const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x))
  const useComplement = x > (a + 1) / (a + b + 2)
  if (useComplement) return 1 - incompleteBeta(b, a, 1 - x)

  const tiny = 1e-30
  let f = 1
  let c = 1
  let d = 0
  for (let i = 0; i <= 300; i++) {
    const m = Math.floor(i / 2)
    let numerator: number
    if (i === 0) numerator = 1
    else if (i % 2 === 0) numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
    else numerator = -(((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1)))

    d = 1 + numerator * d
    if (Math.abs(d) < tiny) d = tiny
    d = 1 / d
    c = 1 + numerator / c
    if (Math.abs(c) < tiny) c = tiny
    const cd = c * d
    f *= cd
    if (Math.abs(1 - cd) < 1e-14) break
  }
  return (front * (f - 1)) / a
}

/** Regularised lower incomplete gamma P(s, x). */
export function incompleteGamma(s: number, x: number): number {
  if (x <= 0) return 0
  if (x < s + 1) {
    // Series expansion.
    let sum = 1 / s
    let term = sum
    for (let n = 1; n < 500; n++) {
      term *= x / (s + n)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break
    }
    return sum * Math.exp(-x + s * Math.log(x) - lgamma(s))
  }
  // Continued fraction for Q(s,x), then complement.
  const tiny = 1e-30
  let b = x + 1 - s
  let c = 1 / tiny
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - s)
    b += 2
    d = an * d + b
    if (Math.abs(d) < tiny) d = tiny
    c = b + an / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return 1 - Math.exp(-x + s * Math.log(x) - lgamma(s)) * h
}

/** Student-t CDF with df degrees of freedom. */
export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t)
  const p = 0.5 * incompleteBeta(df / 2, 0.5, x)
  return t > 0 ? 1 - p : p
}

/** Two-sided p-value for a t statistic. */
export function tTwoSided(t: number, df: number): number {
  return 2 * (1 - tCdf(Math.abs(t), df))
}

/** F CDF with (d1, d2) degrees of freedom. */
export function fCdf(f: number, d1: number, d2: number): number {
  if (f <= 0) return 0
  return incompleteBeta(d1 / 2, d2 / 2, (d1 * f) / (d1 * f + d2))
}

/** Upper-tail p-value for an F statistic. */
export function fUpper(f: number, d1: number, d2: number): number {
  return 1 - fCdf(f, d1, d2)
}

export function chi2Cdf(x: number, df: number): number {
  return incompleteGamma(df / 2, x / 2)
}

export function chi2Upper(x: number, df: number): number {
  return 1 - chi2Cdf(x, df)
}

/** Two-sided p-value for a standard normal statistic. */
export function normalTwoSided(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)))
}

/** Kolmogorov distribution: P(sup|B| > t), used by the two-sample KS test. */
export function kolmogorovQ(t: number): number {
  if (t <= 0) return 1
  if (t < 1.18) {
    // Small-t series is far better conditioned than the alternating one.
    const y = Math.exp(-1.233700550136169 / (t * t))
    return (
      1 -
      (2.506628274631001 / t) *
        (y + Math.pow(y, 9) + Math.pow(y, 25) + Math.pow(y, 49))
    )
  }
  let sum = 0
  for (let k = 1; k <= 100; k++) {
    const term = 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * t * t)
    sum += term
    if (Math.abs(term) < 1e-15) break
  }
  return Math.max(0, Math.min(1, sum))
}
