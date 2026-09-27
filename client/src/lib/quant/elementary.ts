/**
 * Elementary (bilateral, unweighted) index formulae.
 *
 * These compare exactly two periods over a set of matched items. Three of them are
 * serious candidates and two are here precisely because they are wrong - the naive
 * mean and the median of a drifting sample are what you get if you treat "average
 * scraped fare" as a price index, and the Method Lab exists to show what that costs.
 *
 * The formula choice is not cosmetic. Jevons (geometric) is the ILO's recommended
 * elementary aggregate because it satisfies time reversal and is invariant to the
 * units each item is quoted in; Carli (arithmetic mean of relatives) fails time
 * reversal and is upward-biased; Dutot (ratio of arithmetic means) is only meaningful
 * when the items are genuinely homogeneous, which airline seats on different routes
 * are not.
 */

/** Geometric mean of price relatives. The ILO's recommended elementary index. */
export function jevons(base: readonly number[], curr: readonly number[]): number {
  if (base.length !== curr.length) throw new Error('jevons: length mismatch')
  if (base.length === 0) return NaN
  let s = 0
  let n = 0
  for (let i = 0; i < base.length; i++) {
    const b = base[i]!
    const c = curr[i]!
    if (!(b > 0) || !(c > 0)) continue
    s += Math.log(c / b)
    n++
  }
  return n === 0 ? NaN : Math.exp(s / n)
}

/** Jevons from already-logged prices - the form the cube actually stores. */
export function jevonsFromLogs(
  baseLog: readonly number[],
  currLog: readonly number[],
): number {
  if (baseLog.length !== currLog.length) throw new Error('jevonsFromLogs: length mismatch')
  let s = 0
  let n = 0
  for (let i = 0; i < baseLog.length; i++) {
    const b = baseLog[i]!
    const c = currLog[i]!
    if (!Number.isFinite(b) || !Number.isFinite(c)) continue
    s += c - b
    n++
  }
  return n === 0 ? NaN : Math.exp(s / n)
}

/** Ratio of arithmetic means. Meaningful only for homogeneous items. */
export function dutot(base: readonly number[], curr: readonly number[]): number {
  if (base.length !== curr.length) throw new Error('dutot: length mismatch')
  let sb = 0
  let sc = 0
  let n = 0
  for (let i = 0; i < base.length; i++) {
    const b = base[i]!
    const c = curr[i]!
    if (!(b > 0) || !(c > 0)) continue
    sb += b
    sc += c
    n++
  }
  return n === 0 || sb === 0 ? NaN : sc / sb
}

/** Arithmetic mean of price relatives. Fails time reversal; upward-biased. */
export function carli(base: readonly number[], curr: readonly number[]): number {
  if (base.length !== curr.length) throw new Error('carli: length mismatch')
  let s = 0
  let n = 0
  for (let i = 0; i < base.length; i++) {
    const b = base[i]!
    const c = curr[i]!
    if (!(b > 0) || !(c > 0)) continue
    s += c / b
    n++
  }
  return n === 0 ? NaN : s / n
}

/** Harmonic mean of relatives. The downward-biased mirror of Carli. */
export function harmonic(base: readonly number[], curr: readonly number[]): number {
  let s = 0
  let n = 0
  for (let i = 0; i < base.length; i++) {
    const b = base[i]!
    const c = curr[i]!
    if (!(b > 0) || !(c > 0)) continue
    s += b / c
    n++
  }
  return n === 0 ? NaN : n / s
}

/**
 * The arithmetic mean of a period's fares, with NO matching at all.
 *
 * This is the comparator the entire project argues against. It is not an index: it
 * measures the average of whatever happened to be collected, so a shift in the mix of
 * booking horizons or carriers moves it even when every single fare is unchanged.
 */
export function naiveMean(prices: readonly number[]): number {
  if (prices.length === 0) return NaN
  let s = 0
  for (let i = 0; i < prices.length; i++) s += prices[i]!
  return s / prices.length
}

/** Median of a period's fares. Robust to outliers, still not a price index. */
export function median(prices: readonly number[]): number {
  if (prices.length === 0) return NaN
  const xs = Float64Array.from(prices).sort()
  const mid = xs.length >> 1
  return xs.length % 2 === 1 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2
}

/** Quantile by linear interpolation between order statistics (type 7). */
export function quantile(sorted: Float64Array | readonly number[], q: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  if (n === 1) return sorted[0]!
  const h = (n - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!)
}

export function geometricMean(xs: readonly number[]): number {
  let s = 0
  let n = 0
  for (const x of xs) {
    if (!(x > 0)) continue
    s += Math.log(x)
    n++
  }
  return n === 0 ? NaN : Math.exp(s / n)
}

/**
 * Tornqvist: the superlative bilateral index, a share-weighted geometric mean of
 * relatives using the AVERAGE of the two periods' expenditure shares. This is the
 * bilateral building block GEKS makes transitive.
 */
export function tornqvist(
  basePrice: readonly number[],
  currPrice: readonly number[],
  baseShare: readonly number[],
  currShare: readonly number[],
): number {
  let s = 0
  let wsum = 0
  for (let i = 0; i < basePrice.length; i++) {
    const p0 = basePrice[i]!
    const p1 = currPrice[i]!
    if (!(p0 > 0) || !(p1 > 0)) continue
    const w = 0.5 * (baseShare[i]! + currShare[i]!)
    if (!(w > 0)) continue
    s += w * Math.log(p1 / p0)
    wsum += w
  }
  return wsum === 0 ? NaN : Math.exp(s / wsum)
}

/** Expenditure shares from prices and quantities, normalised to sum to 1. */
export function expenditureShares(
  price: readonly number[],
  quantity: readonly number[],
): number[] {
  const exp = price.map((p, i) => (p > 0 && quantity[i]! > 0 ? p * quantity[i]! : 0))
  const total = exp.reduce((a, b) => a + b, 0)
  return total > 0 ? exp.map((e) => e / total) : exp.map(() => 0)
}
