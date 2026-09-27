/**
 * Dense row-major matrices on Float64Array.
 *
 * Everything the quant layer needs is here; there is no matrix library dependency by
 * design (PROTOTYPE_SPEC section 1 - "the math is the deliverable"). Row-major because
 * every hot loop in this codebase walks observations, and observations are rows.
 */

export interface Matrix {
  readonly rows: number
  readonly cols: number
  readonly data: Float64Array
}

export function zeros(rows: number, cols: number): Matrix {
  return { rows, cols, data: new Float64Array(rows * cols) }
}

export function fromRows(rowsIn: readonly (readonly number[])[]): Matrix {
  const rows = rowsIn.length
  const cols = rows === 0 ? 0 : rowsIn[0]!.length
  const data = new Float64Array(rows * cols)
  for (let i = 0; i < rows; i++) {
    const r = rowsIn[i]!
    if (r.length !== cols) throw new Error('fromRows: ragged input')
    for (let j = 0; j < cols; j++) data[i * cols + j] = r[j]!
  }
  return { rows, cols, data }
}

export function identity(n: number): Matrix {
  const m = zeros(n, n)
  for (let i = 0; i < n; i++) m.data[i * n + i] = 1
  return m
}

export function get(m: Matrix, i: number, j: number): number {
  return m.data[i * m.cols + j]!
}

export function set(m: Matrix, i: number, j: number, v: number): void {
  m.data[i * m.cols + j] = v
}

export function row(m: Matrix, i: number): Float64Array {
  return m.data.subarray(i * m.cols, (i + 1) * m.cols)
}

export function col(m: Matrix, j: number): Float64Array {
  const out = new Float64Array(m.rows)
  for (let i = 0; i < m.rows; i++) out[i] = m.data[i * m.cols + j]!
  return out
}

export function transpose(m: Matrix): Matrix {
  const out = zeros(m.cols, m.rows)
  for (let i = 0; i < m.rows; i++) {
    for (let j = 0; j < m.cols; j++) out.data[j * m.rows + i] = m.data[i * m.cols + j]!
  }
  return out
}

export function matmul(a: Matrix, b: Matrix): Matrix {
  if (a.cols !== b.rows) throw new Error(`matmul: ${a.cols} !== ${b.rows}`)
  const out = zeros(a.rows, b.cols)
  for (let i = 0; i < a.rows; i++) {
    for (let k = 0; k < a.cols; k++) {
      const aik = a.data[i * a.cols + k]!
      if (aik === 0) continue
      const bOff = k * b.cols
      const oOff = i * b.cols
      for (let j = 0; j < b.cols; j++) out.data[oOff + j] += aik * b.data[bOff + j]!
    }
  }
  return out
}

export function matvec(a: Matrix, x: Float64Array | readonly number[]): Float64Array {
  const out = new Float64Array(a.rows)
  for (let i = 0; i < a.rows; i++) {
    let s = 0
    const off = i * a.cols
    for (let j = 0; j < a.cols; j++) s += a.data[off + j]! * (x as Float64Array)[j]!
    out[i] = s
  }
  return out
}

/** X'X, exploiting symmetry. The workhorse of every normal-equation path. */
export function crossprod(x: Matrix): Matrix {
  const p = x.cols
  const out = zeros(p, p)
  for (let i = 0; i < x.rows; i++) {
    const off = i * p
    for (let a = 0; a < p; a++) {
      const xa = x.data[off + a]!
      if (xa === 0) continue
      for (let b = a; b < p; b++) out.data[a * p + b] += xa * x.data[off + b]!
    }
  }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) out.data[a * p + b] = out.data[b * p + a]!
  return out
}

/** X'y. */
export function crossvec(x: Matrix, y: Float64Array | readonly number[]): Float64Array {
  const out = new Float64Array(x.cols)
  for (let i = 0; i < x.rows; i++) {
    const yi = (y as Float64Array)[i]!
    if (yi === 0) continue
    const off = i * x.cols
    for (let j = 0; j < x.cols; j++) out[j] += x.data[off + j]! * yi
  }
  return out
}

export function scale(m: Matrix, k: number): Matrix {
  const out = { rows: m.rows, cols: m.cols, data: new Float64Array(m.data) }
  for (let i = 0; i < out.data.length; i++) out.data[i] *= k
  return out
}

export function addInPlace(a: Matrix, b: Matrix, k = 1): Matrix {
  for (let i = 0; i < a.data.length; i++) a.data[i] += k * b.data[i]!
  return a
}

export function trace(m: Matrix): number {
  let s = 0
  for (let i = 0; i < Math.min(m.rows, m.cols); i++) s += m.data[i * m.cols + i]!
  return s
}
