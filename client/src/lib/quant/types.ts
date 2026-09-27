/**
 * Shared shapes for the index layer.
 *
 * Every index method in this directory consumes a PriceMatrix and nothing else. That
 * is deliberate: it is the only way to be able to say, on stage, that the six lines in
 * the Method Lab were computed on identical data. If one method reached back into the
 * raw panel for a different filter, the comparison would be meaningless and the claim
 * would be false.
 */

export interface PriceMatrix {
  readonly nProducts: number
  readonly nPeriods: number
  /** Mean LOG price per (product, period), laid out [product * nPeriods + period]. */
  readonly logPrice: Float64Array
  /** Mean price in levels, same layout. Dutot needs levels, not logs. */
  readonly price: Float64Array
  /** Observation count per cell. Zero means unobserved. */
  readonly count: Int32Array
  /** Quantity proxy per cell, for expenditure-share weighting. */
  readonly quantity: Float64Array
  /** Period labels, length nPeriods. */
  readonly periods: readonly string[]
}

export type IndexMethod =
  | 'naive-mean'
  | 'median'
  | 'carli'
  | 'dutot'
  | 'jevons-fixed'
  | 'jevons-chained'
  | 'geks-tornqvist'
  | 'tpd'
  | 'rygeks-fews'
  | 'hedonic-tdh'

export interface IndexResult {
  readonly method: IndexMethod
  readonly label: string
  /** Index levels with the first in-window period = 100. */
  readonly values: number[]
  /** Number of products contributing in each period. */
  readonly matched: number[]
  readonly periods: readonly string[]
  /** True when this method is a deliberately-wrong comparator, not a candidate. */
  readonly isComparator: boolean
  /** One line an analyst can read without opening the methodology note. */
  readonly note: string
}

export const METHOD_LABEL: Readonly<Record<IndexMethod, string>> = {
  'naive-mean': 'Naive mean of fares',
  median: 'Median fare',
  carli: 'Carli (mean of relatives)',
  dutot: 'Dutot (ratio of means)',
  'jevons-fixed': 'Jevons, fixed matched panel',
  'jevons-chained': 'Jevons, chained',
  'geks-tornqvist': 'GEKS-Tornqvist',
  tpd: 'Time Product Dummy',
  'rygeks-fews': 'RYGEKS-FEWS',
  'hedonic-tdh': 'Time-Dummy Hedonic',
}

/** Base value of every index published by this system. */
export const INDEX_BASE = 100

export function cellIndex(product: number, period: number, nPeriods: number): number {
  return product * nPeriods + period
}
