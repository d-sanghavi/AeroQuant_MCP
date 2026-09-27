/**
 * Symmetric eigendecomposition by the cyclic Jacobi method.
 *
 * Jacobi rather than a Householder-tridiagonal-plus-QL pipeline because the matrices
 * here are small (9x9 for the fare-curve PCA, 60x60 for the route covariance), Jacobi
 * is unconditionally stable on symmetric input, and it delivers eigenvectors to full
 * accuracy without a separate inverse-iteration step. For a 9x9 it converges in a few
 * sweeps and the whole thing is microseconds.
 */

import { zeros, type Matrix } from './matrix'

export interface Eigen {
  /** Eigenvalues, descending. */
  readonly values: Float64Array
  /** Eigenvectors as COLUMNS, ordered to match `values`. */
  readonly vectors: Matrix
  readonly sweeps: number
  readonly converged: boolean
}

export function jacobiEigen(input: Matrix, maxSweeps = 100, tol = 1e-12): Eigen {
  const n = input.rows
  if (input.cols !== n) throw new Error('jacobiEigen: matrix must be square')

  const a = new Float64Array(input.data)
  const v = zeros(n, n)
  for (let i = 0; i < n; i++) v.data[i * n + i] = 1

  let sweeps = 0
  let converged = false

  for (; sweeps < maxSweeps; sweeps++) {
    // Off-diagonal Frobenius norm; the quantity Jacobi provably drives to zero.
    let off = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) off += a[i * n + j]! ** 2
    }
    if (Math.sqrt(2 * off) < tol) {
      converged = true
      break
    }

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q]!
        if (Math.abs(apq) < 1e-300) continue
        const app = a[p * n + p]!
        const aqq = a[q * n + q]!
        const theta = (aqq - app) / (2 * apq)
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c

        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p]!
          const akq = a[k * n + q]!
          a[k * n + p] = c * akp - s * akq
          a[k * n + q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k]!
          const aqk = a[q * n + k]!
          a[p * n + k] = c * apk - s * aqk
          a[q * n + k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v.data[k * n + p]!
          const vkq = v.data[k * n + q]!
          v.data[k * n + p] = c * vkp - s * vkq
          v.data[k * n + q] = s * vkp + c * vkq
        }
      }
    }
  }

  const values = new Float64Array(n)
  for (let i = 0; i < n; i++) values[i] = a[i * n + i]!

  // Sort descending, permuting the eigenvector columns with them.
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (x, y) => values[y]! - values[x]!,
  )
  const sortedValues = new Float64Array(n)
  const sortedVectors = zeros(n, n)
  for (let newCol = 0; newCol < n; newCol++) {
    const oldCol = order[newCol]!
    sortedValues[newCol] = values[oldCol]!
    // Sign convention: make the largest-magnitude loading positive, so PC1 of a set
    // of fare curves reads as "level up" rather than arbitrarily inverted.
    let maxAbs = 0
    let sign = 1
    for (let r = 0; r < n; r++) {
      const val = v.data[r * n + oldCol]!
      if (Math.abs(val) > maxAbs) {
        maxAbs = Math.abs(val)
        sign = val >= 0 ? 1 : -1
      }
    }
    for (let r = 0; r < n; r++) {
      sortedVectors.data[r * n + newCol] = sign * v.data[r * n + oldCol]!
    }
  }

  return { values: sortedValues, vectors: sortedVectors, sweeps, converged }
}

/** Sample covariance of a data matrix whose ROWS are observations. */
export function covariance(X: Matrix, ddof = 1): { cov: Matrix; means: Float64Array } {
  const n = X.rows
  const p = X.cols
  const means = new Float64Array(p)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) means[j] += X.data[i * p + j]!
  }
  for (let j = 0; j < p; j++) means[j] = means[j]! / n

  const cov = zeros(p, p)
  const denom = Math.max(1, n - ddof)
  for (let i = 0; i < n; i++) {
    const off = i * p
    for (let a = 0; a < p; a++) {
      const da = X.data[off + a]! - means[a]!
      if (da === 0) continue
      for (let b = a; b < p; b++) {
        cov.data[a * p + b] += (da * (X.data[off + b]! - means[b]!)) / denom
      }
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < a; b++) cov.data[a * p + b] = cov.data[b * p + a]!
  }
  return { cov, means }
}

/** Correlation matrix from a covariance matrix. */
export function corrFromCov(cov: Matrix): Matrix {
  const p = cov.rows
  const out = zeros(p, p)
  const sd = new Float64Array(p)
  for (let i = 0; i < p; i++) sd[i] = Math.sqrt(Math.max(0, cov.data[i * p + i]!))
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      const d = sd[i]! * sd[j]!
      out.data[i * p + j] = d > 0 ? cov.data[i * p + j]! / d : i === j ? 1 : 0
    }
  }
  return out
}
