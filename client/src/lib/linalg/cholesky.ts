/**
 * Cholesky factorisation and the symmetric solve built on it.
 *
 * Used for the hedonic regression, where forming the design matrix explicitly is not
 * an option: ~110,000 rows by ~95 columns of Float64 is 83MB, and the QR needs a
 * working copy of it. On a phone that is a crash, and the prototype has to run on a
 * phone. So the hedonic fit streams its rows into X'X (95x95, 72KB) and solves the
 * normal equations here instead.
 *
 * The cost of that choice is honest and worth stating: forming X'X squares the
 * condition number, so this path is less accurate than the QR in qr.ts. It is used
 * ONLY where the design is well-scaled and reference categories have already been
 * dropped, and the ridge below is a numerical floor, not a shrinkage estimator - it is
 * set far too small to move a coefficient anyone will read.
 */

import { zeros, type Matrix } from './matrix'

export interface CholeskyResult {
  /** Lower-triangular factor L with A = L L'. */
  readonly L: Float64Array
  readonly n: number
  readonly ok: boolean
  /** Ridge actually added to the diagonal for numerical stability. */
  readonly ridge: number
}

export function cholesky(A: Matrix, relRidge = 1e-10): CholeskyResult {
  const n = A.rows
  if (A.cols !== n) throw new Error('cholesky: matrix must be square')

  let diagMean = 0
  for (let i = 0; i < n; i++) diagMean += A.data[i * n + i]!
  diagMean /= Math.max(1, n)
  const ridge = relRidge * Math.max(1e-300, diagMean)

  const L = new Float64Array(n * n)
  let ok = true

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A.data[i * n + j]!
      if (i === j) s += ridge
      for (let k = 0; k < j; k++) s -= L[i * n + k]! * L[j * n + k]!
      if (i === j) {
        if (s <= 0) {
          ok = false
          // Keep going with a floor rather than throwing: a rank-deficient block
          // should surface as a huge standard error, not as a blank screen.
          L[i * n + j] = Math.sqrt(Math.max(s + 1e-12 * diagMean, 1e-300))
        } else {
          L[i * n + j] = Math.sqrt(s)
        }
      } else {
        L[i * n + j] = s / L[j * n + j]!
      }
    }
  }

  return { L, n, ok, ridge }
}

/** Solve A x = b given the Cholesky factor of A. */
export function cholSolve(chol: CholeskyResult, b: Float64Array | readonly number[]): Float64Array {
  const { L, n } = chol
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = (b as Float64Array)[i]!
    for (let k = 0; k < i; k++) s -= L[i * n + k]! * y[k]!
    y[i] = s / L[i * n + i]!
  }
  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!
    for (let k = i + 1; k < n; k++) s -= L[k * n + i]! * x[k]!
    x[i] = s / L[i * n + i]!
  }
  return x
}

/**
 * Diagonal of A^-1 from the Cholesky factor.
 * Enough for standard errors; the full inverse is never needed here and would be
 * 95x95 of avoidable work on every refit.
 */
export function cholInverseDiagonal(chol: CholeskyResult): Float64Array {
  const { L, n } = chol
  // Invert L (lower triangular) by forward substitution, column by column.
  const Linv = new Float64Array(n * n)
  for (let j = 0; j < n; j++) {
    Linv[j * n + j] = 1 / L[j * n + j]!
    for (let i = j + 1; i < n; i++) {
      let s = 0
      for (let k = j; k < i; k++) s -= L[i * n + k]! * Linv[k * n + j]!
      Linv[i * n + j] = s / L[i * n + i]!
    }
  }
  // (L L')^-1 = L'^-1 L^-1, so diag = column sums of squares of L^-1.
  const out = new Float64Array(n)
  for (let j = 0; j < n; j++) {
    let s = 0
    for (let i = j; i < n; i++) s += Linv[i * n + j]! ** 2
    out[j] = s
  }
  return out
}

/**
 * Accumulator for X'X and X'y over sparse rows.
 *
 * A hedonic row is a handful of dummy indicators plus three spline terms - about
 * twelve non-zeros out of ninety-five columns. Feeding only those pairs in turns an
 * O(n p^2) build into O(n k^2) and lets the design matrix never exist.
 */
export class NormalEquations {
  readonly p: number
  readonly XtX: Float64Array
  readonly Xty: Float64Array
  yty = 0
  wsum = 0
  wy = 0
  n = 0

  constructor(p: number) {
    this.p = p
    this.XtX = new Float64Array(p * p)
    this.Xty = new Float64Array(p)
  }

  /** `idx`/`val` are the non-zero columns of one row; `w` is the observation weight. */
  push(idx: Int32Array | number[], val: Float64Array | number[], k: number, y: number, w: number): void {
    const { XtX, Xty, p } = this
    for (let a = 0; a < k; a++) {
      const ia = idx[a]!
      const wva = w * val[a]!
      Xty[ia] += wva * y
      for (let b = a; b < k; b++) {
        XtX[ia * p + idx[b]!] += wva * val[b]!
      }
    }
    this.yty += w * y * y
    this.wy += w * y
    this.wsum += w
    this.n++
  }

  /** Mirror the accumulated upper triangle into a full symmetric Matrix. */
  toMatrix(): Matrix {
    const { p, XtX } = this
    const m = zeros(p, p)
    for (let a = 0; a < p; a++) {
      for (let b = a; b < p; b++) {
        const v = XtX[a * p + b]!
        m.data[a * p + b] = v
        m.data[b * p + a] = v
      }
    }
    return m
  }
}
