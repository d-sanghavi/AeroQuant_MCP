/**
 * Principal component analysis of the fare term structure.
 *
 * Rows are departure dates, columns are booking-horizon buckets, cells are the mean
 * log fare. The interesting result - and it is a real empirical regularity, not a
 * presentation device - is that almost all of the variation in these curves lives in
 * three components with a recognisable shape:
 *
 *   PC1  roughly flat loadings      -> the whole curve moves up or down  (LEVEL)
 *   PC2  monotone, sign change      -> near dates move against far ones  (SLOPE)
 *   PC3  U-shaped                   -> the middle moves against the ends (CURVATURE)
 *
 * The labels are ASSIGNED BY INSPECTION of the loading shape, not asserted. The
 * classifier below states its rule, and reports 'unclassified' when a component does
 * not match one - which is the honest outcome when the data does not cooperate.
 */

import { covariance, jacobiEigen } from '@/lib/linalg/eigen'
import type { Matrix } from '@/lib/linalg/matrix'

export type ComponentShape = 'level' | 'slope' | 'curvature' | 'unclassified'

export interface PrincipalComponent {
  readonly index: number
  readonly eigenvalue: number
  readonly varianceExplained: number
  readonly cumulativeVariance: number
  /** Loading per input column (horizon bucket). */
  readonly loadings: number[]
  readonly shape: ComponentShape
  readonly label: string
  /** Why this shape was assigned. Shown in the UI so the label is auditable. */
  readonly rationale: string
}

export interface PcaResult {
  readonly components: PrincipalComponent[]
  /** Scores: one row per input row, one column per component. */
  readonly scores: number[][]
  readonly means: number[]
  readonly totalVariance: number
  readonly nRows: number
  readonly nCols: number
  readonly converged: boolean
}

/**
 * Classify a loading vector by shape.
 *
 * level      - all loadings the same sign and the spread is modest.
 * slope      - exactly one sign change, monotone either side.
 * curvature  - two sign changes, ends agreeing against the middle.
 */
function classify(loadings: readonly number[]): { shape: ComponentShape; rationale: string } {
  const n = loadings.length
  if (n < 3) return { shape: 'unclassified', rationale: 'too few columns to classify' }

  let signChanges = 0
  for (let i = 1; i < n; i++) {
    if (loadings[i]! * loadings[i - 1]! < 0) signChanges++
  }
  const allSameSign = signChanges === 0
  const absVals = loadings.map(Math.abs)
  const maxAbs = Math.max(...absVals)
  const minAbs = Math.min(...absVals)
  const spread = maxAbs > 0 ? minAbs / maxAbs : 0

  if (allSameSign && spread > 0.35) {
    return {
      shape: 'level',
      rationale: `no sign changes; smallest loading is ${(spread * 100).toFixed(0)}% of the largest, so every horizon moves together`,
    }
  }
  if (signChanges === 1) {
    return {
      shape: 'slope',
      rationale: 'exactly one sign change: short and long horizons move in opposite directions',
    }
  }
  if (signChanges === 2) {
    const endsAgree = loadings[0]! * loadings[n - 1]! > 0
    if (endsAgree) {
      return {
        shape: 'curvature',
        rationale: 'two sign changes with the ends agreeing: the middle of the curve moves against both ends',
      }
    }
  }
  return {
    shape: 'unclassified',
    rationale: `${signChanges} sign changes - does not match a level, slope or curvature pattern`,
  }
}

const SHAPE_LABEL: Record<ComponentShape, string> = {
  level: 'Level',
  slope: 'Slope',
  curvature: 'Curvature',
  unclassified: 'Unclassified',
}

export function pca(X: Matrix, nComponents = 3): PcaResult {
  const { cov, means } = covariance(X)
  const eig = jacobiEigen(cov)

  let total = 0
  for (let i = 0; i < eig.values.length; i++) total += Math.max(0, eig.values[i]!)

  const k = Math.min(nComponents, eig.values.length)
  const components: PrincipalComponent[] = []
  let cum = 0
  for (let c = 0; c < k; c++) {
    const ev = Math.max(0, eig.values[c]!)
    const share = total > 0 ? ev / total : 0
    cum += share
    const loadings: number[] = []
    for (let r = 0; r < X.cols; r++) loadings.push(eig.vectors.data[r * X.cols + c]!)
    const { shape, rationale } = classify(loadings)
    components.push({
      index: c + 1,
      eigenvalue: ev,
      varianceExplained: share,
      cumulativeVariance: cum,
      loadings,
      shape,
      label: `PC${c + 1} - ${SHAPE_LABEL[shape]}`,
      rationale,
    })
  }

  // Scores: centred rows projected onto the retained eigenvectors.
  const scores: number[][] = []
  for (let i = 0; i < X.rows; i++) {
    const row: number[] = []
    for (let c = 0; c < k; c++) {
      let s = 0
      for (let j = 0; j < X.cols; j++) {
        s += (X.data[i * X.cols + j]! - means[j]!) * eig.vectors.data[j * X.cols + c]!
      }
      row.push(s)
    }
    scores.push(row)
  }

  return {
    components,
    scores,
    means: Array.from(means),
    totalVariance: total,
    nRows: X.rows,
    nCols: X.cols,
    converged: eig.converged,
  }
}
