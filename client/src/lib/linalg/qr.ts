/**
 * Householder QR with column pivoting, and the least-squares solve built on it.
 *
 * Why QR and not the normal equations: the hedonic design matrix is a wall of dummy
 * variables (route, airline, cabin, time) whose condition number is poor and which is
 * exactly rank-deficient if a reference category is not dropped. Forming X'X squares
 * the condition number and turns a merely difficult problem into a wrong answer.
 * Pivoting additionally lets us DETECT the rank deficiency and report it rather than
 * returning confident nonsense, which matters when the coefficients are going to be
 * read as a quality adjustment.
 */

import type { Matrix } from './matrix'

export interface LeastSquaresResult {
  /** Coefficients; entries for detected-collinear columns are exactly 0. */
  readonly beta: Float64Array
  readonly fitted: Float64Array
  readonly residuals: Float64Array
  readonly rank: number
  readonly df: number
  readonly rss: number
  readonly tss: number
  readonly r2: number
  readonly adjR2: number
  readonly sigma: number
  /** Standard errors; NaN for columns dropped as collinear. */
  readonly stdErrors: Float64Array
  /** Columns dropped because they were linearly dependent on earlier ones. */
  readonly droppedColumns: readonly number[]
}

/**
 * Solve min ||Wx(Xb - y)|| for b, with optional observation weights.
 * Weights are applied as sqrt(w) row scaling, which is the standard WLS reduction.
 */
export function lstsq(
  X: Matrix,
  y: Float64Array | readonly number[],
  weights?: Float64Array | readonly number[],
  tol = 1e-9,
): LeastSquaresResult {
  const n = X.rows
  const p = X.cols
  if (n < p) throw new Error(`lstsq: underdetermined (${n} rows, ${p} columns)`)

  // Working copy, row-scaled by sqrt(weight).
  const A = new Float64Array(n * p)
  const b = new Float64Array(n)
  const sw = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const w = weights ? (weights as Float64Array)[i]! : 1
    if (w < 0) throw new Error('lstsq: negative weight')
    const s = Math.sqrt(w)
    sw[i] = s
    b[i] = s * (y as Float64Array)[i]!
    for (let j = 0; j < p; j++) A[i * p + j] = s * X.data[i * p + j]!
  }

  // Column norms drive the pivot choice.
  const perm = new Int32Array(p)
  for (let j = 0; j < p; j++) perm[j] = j
  const colNorm = new Float64Array(p)
  for (let j = 0; j < p; j++) {
    let s = 0
    for (let i = 0; i < n; i++) s += A[i * p + j]! ** 2
    colNorm[j] = s
  }

  let maxNorm = 0
  for (let j = 0; j < p; j++) maxNorm = Math.max(maxNorm, colNorm[j]!)
  const absTol = tol * Math.max(1, maxNorm)

  const R = new Float64Array(p * p)
  const qtb = b
  let rank = 0
  const dropped: number[] = []

  for (let k = 0; k < p; k++) {
    // Pivot: bring the largest remaining column norm to position k.
    let best = k
    for (let j = k + 1; j < p; j++) if (colNorm[j]! > colNorm[best]!) best = j
    if (colNorm[best]! <= absTol) {
      for (let j = k; j < p; j++) dropped.push(perm[j]!)
      break
    }
    if (best !== k) {
      for (let i = 0; i < n; i++) {
        const t = A[i * p + k]!
        A[i * p + k] = A[i * p + best]!
        A[i * p + best] = t
      }
      for (let i = 0; i < k; i++) {
        const t = R[i * p + k]!
        R[i * p + k] = R[i * p + best]!
        R[i * p + best] = t
      }
      const tp = perm[k]!; perm[k] = perm[best]!; perm[best] = tp
      const tn = colNorm[k]!; colNorm[k] = colNorm[best]!; colNorm[best] = tn
    }

    // Householder reflector for column k over rows k..n-1.
    let normx = 0
    for (let i = k; i < n; i++) normx += A[i * p + k]! ** 2
    normx = Math.sqrt(normx)
    if (normx <= absTol) {
      for (let j = k; j < p; j++) dropped.push(perm[j]!)
      break
    }
    const alpha = A[k * p + k]! > 0 ? -normx : normx
    const v = new Float64Array(n - k)
    for (let i = k; i < n; i++) v[i - k] = A[i * p + k]!
    v[0] -= alpha
    let vnorm = 0
    for (let i = 0; i < v.length; i++) vnorm += v[i]! ** 2
    if (vnorm > 0) {
      // Apply I - 2vv'/v'v to the remaining columns and to b.
      for (let j = k; j < p; j++) {
        let dot = 0
        for (let i = k; i < n; i++) dot += v[i - k]! * A[i * p + j]!
        const f = (2 * dot) / vnorm
        for (let i = k; i < n; i++) A[i * p + j] -= f * v[i - k]!
      }
      let dotb = 0
      for (let i = k; i < n; i++) dotb += v[i - k]! * qtb[i]!
      const fb = (2 * dotb) / vnorm
      for (let i = k; i < n; i++) qtb[i] -= fb * v[i - k]!
    }

    for (let j = k; j < p; j++) R[k * p + j] = A[k * p + j]!
    rank++

    // Downdate the remaining column norms.
    for (let j = k + 1; j < p; j++) {
      colNorm[j] = Math.max(0, colNorm[j]! - A[k * p + j]! ** 2)
    }
  }

  // Back-substitute R[0..rank) beta_perm = Qtb[0..rank)
  const betaPerm = new Float64Array(p)
  for (let i = rank - 1; i >= 0; i--) {
    let s = qtb[i]!
    for (let j = i + 1; j < rank; j++) s -= R[i * p + j]! * betaPerm[j]!
    betaPerm[i] = s / R[i * p + i]!
  }

  const beta = new Float64Array(p)
  for (let j = 0; j < rank; j++) beta[perm[j]!] = betaPerm[j]!

  // Fitted values and residuals in the ORIGINAL (unweighted) scale.
  const fitted = new Float64Array(n)
  const residuals = new Float64Array(n)
  let rss = 0
  let wsum = 0
  let wy = 0
  for (let i = 0; i < n; i++) {
    let f = 0
    const off = i * p
    for (let j = 0; j < p; j++) f += X.data[off + j]! * beta[j]!
    fitted[i] = f
    const e = (y as Float64Array)[i]! - f
    residuals[i] = e
    const w = weights ? (weights as Float64Array)[i]! : 1
    rss += w * e * e
    wsum += w
    wy += w * (y as Float64Array)[i]!
  }
  const ybar = wy / wsum
  let tss = 0
  for (let i = 0; i < n; i++) {
    const w = weights ? (weights as Float64Array)[i]! : 1
    tss += w * ((y as Float64Array)[i]! - ybar) ** 2
  }

  const df = n - rank
  const sigma2 = df > 0 ? rss / df : NaN
  const r2 = tss > 0 ? 1 - rss / tss : NaN
  const adjR2 = df > 0 && tss > 0 ? 1 - (1 - r2) * ((n - 1) / df) : NaN

  // Standard errors need (R'R)^-1 on the retained columns.
  const stdErrors = new Float64Array(p).fill(NaN)
  if (df > 0 && rank > 0) {
    // Invert the upper-triangular R (rank x rank) by back-substitution, then
    // diag((R'R)^-1) = row sums of squares of R^-1.
    const Rinv = new Float64Array(rank * rank)
    for (let i = rank - 1; i >= 0; i--) {
      Rinv[i * rank + i] = 1 / R[i * p + i]!
      for (let j = i + 1; j < rank; j++) {
        let s = 0
        for (let k = i + 1; k <= j; k++) s += R[i * p + k]! * Rinv[k * rank + j]!
        Rinv[i * rank + j] = -s / R[i * p + i]!
      }
    }
    for (let i = 0; i < rank; i++) {
      let s = 0
      for (let j = i; j < rank; j++) s += Rinv[i * rank + j]! ** 2
      stdErrors[perm[i]!] = Math.sqrt(sigma2 * s)
    }
  }

  return {
    beta,
    fitted,
    residuals,
    rank,
    df,
    rss,
    tss,
    r2,
    adjR2,
    sigma: Math.sqrt(sigma2),
    stdErrors,
    droppedColumns: dropped,
  }
}
