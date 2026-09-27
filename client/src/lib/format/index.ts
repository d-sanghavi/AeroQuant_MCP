/**
 * Presentation formatting for the terminal.
 *
 * Rules that come from the audience (NSO / RBI), not from taste:
 *  - Money is Indian-grouped (1,23,456), because the reader is Indian and the source
 *    statistic is published that way.
 *  - Index levels carry one decimal. Two implies precision the sampling error does not
 *    support; zero hides month-on-month movement.
 *  - A change in an index is quoted in *percentage points* when comparing two rates and
 *    in *percent* when comparing two levels. Conflating them is the single most common
 *    error in press coverage of price indices, so the helpers are named apart.
 */

const inr0 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
const inr2 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const num = new Intl.NumberFormat('en-IN')

export function fmtINR(x: number, decimals = 0): string {
  if (!Number.isFinite(x)) return '--'
  return (decimals > 0 ? inr2 : inr0).format(x)
}

/** Compact money for axis ticks: Rs 1.2L, Rs 3.4Cr. */
export function fmtINRCompact(x: number): string {
  if (!Number.isFinite(x)) return '--'
  const a = Math.abs(x)
  if (a >= 1e7) return `₹${(x / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`
  if (a >= 1e5) return `₹${(x / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`
  if (a >= 1e3) return `₹${(x / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`
  return `₹${Math.round(x)}`
}

export function fmtNumber(x: number, decimals = 0): string {
  if (!Number.isFinite(x)) return '--'
  return num.format(Number(x.toFixed(decimals)))
}

export function fmtCompact(x: number): string {
  if (!Number.isFinite(x)) return '--'
  const a = Math.abs(x)
  if (a >= 1e7) return `${(x / 1e7).toFixed(1)}Cr`
  if (a >= 1e5) return `${(x / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `${(x / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`
  return String(Math.round(x))
}

/** Index level, base = 100. */
export function fmtIndex(x: number, decimals = 1): string {
  if (!Number.isFinite(x)) return '--'
  return x.toFixed(decimals)
}

/** A percent *change* between two levels. Signed by default. */
export function fmtPct(x: number, decimals = 2, signed = true): string {
  if (!Number.isFinite(x)) return '--'
  const s = signed && x > 0 ? '+' : ''
  return `${s}${x.toFixed(decimals)}%`
}

/** A difference between two rates, in percentage points. Never call this "percent". */
export function fmtPP(x: number, decimals = 2, signed = true): string {
  if (!Number.isFinite(x)) return '--'
  const s = signed && x > 0 ? '+' : ''
  return `${s}${x.toFixed(decimals)}pp`
}

/** A share in [0,1] rendered as a percentage. Unsigned. */
export function fmtShare(x: number, decimals = 1): string {
  if (!Number.isFinite(x)) return '--'
  return `${(x * 100).toFixed(decimals)}%`
}

/**
 * p-values. Below 0.001 we print the inequality rather than a spuriously precise
 * figure - the test statistic's own approximation error dominates down there.
 */
export function fmtP(p: number): string {
  if (!Number.isFinite(p)) return '--'
  if (p < 0.001) return '<0.001'
  if (p > 0.999) return '>0.999'
  return p.toFixed(3)
}

export function fmtSigned(x: number, decimals = 2): string {
  if (!Number.isFinite(x)) return '--'
  return `${x > 0 ? '+' : ''}${x.toFixed(decimals)}`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** 'YYYY-MM' -> 'Mar 2026'. The index is monthly, so this is the workhorse. */
export function fmtMonth(period: string): string {
  const [y, m] = period.split('-')
  const mi = Number(m) - 1
  if (!y || Number.isNaN(mi) || mi < 0 || mi > 11) return period
  return `${MONTHS[mi]} ${y}`
}

/** 'YYYY-MM' -> 'Mar 26'. For dense axes on narrow screens. */
export function fmtMonthShort(period: string): string {
  const [y, m] = period.split('-')
  const mi = Number(m) - 1
  if (!y || Number.isNaN(mi) || mi < 0 || mi > 11) return period
  return `${MONTHS[mi]} ${y.slice(2)}`
}

/** 'YYYY-MM-DD' -> '14 Mar 2026'. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  const mi = Number(m) - 1
  if (!y || !d || Number.isNaN(mi)) return iso
  return `${Number(d)} ${MONTHS[mi]} ${y}`
}

export function fmtHorizon(days: number): string {
  return `T-${days}`
}

/** Short SHA display: first 8 and last 6, as git and object stores both do. */
export function fmtHash(hash: string): string {
  if (hash.length <= 18) return hash
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}
