/**
 * Calendar master data - 24 months of departure dates.
 *
 * Indian air fares are driven far more by the festival calendar than by the Gregorian
 * one. Diwali and Dussehra move ~20 days year to year, which means a naive
 * year-on-year comparison of the same calendar week compares a festival week against
 * an ordinary one. The index has to know about this, so the calendar is master data,
 * not a formatting concern.
 */

export type Season = 'peak' | 'shoulder' | 'lean'

export interface Festival {
  readonly date: string
  readonly name: string
  /** Days before the festival when outbound travel surges. */
  readonly leadDays: number
  /** Days after, when return travel surges. */
  readonly trailDays: number
  /**
   * Pressure on log fare at the centre of the window, in logs.
   *
   * Calibrated to a ~20% uplift at the Diwali peak rather than the 40% a single
   * trunk route can show. These intensities apply to EVERY route at once, and a
   * network-wide 40% uplift sustained for eleven days is not what the traffic data
   * shows - it would also make the year-on-year rate hostage to the fact that Indian
   * festivals move by several weeks between years.
   */
  readonly intensity: number
}

export interface CalendarDay {
  readonly date: string
  readonly year: number
  readonly month: number
  readonly day: number
  /** 0 = Sunday. */
  readonly dow: number
  readonly period: string
  readonly season: Season
  readonly isWeekend: boolean
  readonly isLongWeekend: boolean
  readonly isSchoolHoliday: boolean
  readonly festival: string | null
  /** Aggregate festival pressure on this date, 0 when nothing is near. */
  readonly festivalPressure: number
  /** Index of this day within the window, 0-based. */
  readonly t: number
}

/**
 * Two distinct windows, and conflating them is a real bug.
 *
 * COLLECTION window = the 24 months the index covers. A quote's *collection* date is
 * what assigns it to a period, because that is when the price was observed.
 * CALENDAR window extends 92 days further, because a T-90 quote collected on the last
 * collection day departs in December and still needs its day-of-week and festival
 * context.
 */
export const WINDOW_START = '2024-10-01'
export const COLLECTION_END = '2026-09-30'
export const WINDOW_END = '2026-12-31'

/**
 * Real Indian festival dates for the window. Approximate to the day for the movable
 * feasts, which is close enough for a fare model and honest about its own precision.
 */
const FESTIVALS: readonly Festival[] = [
  { date: '2024-10-12', name: 'Dussehra',           leadDays: 4, trailDays: 3, intensity: 0.120 },
  { date: '2024-11-01', name: 'Diwali',             leadDays: 6, trailDays: 5, intensity: 0.192 },
  { date: '2024-12-25', name: 'Christmas',          leadDays: 5, trailDays: 7, intensity: 0.144 },
  { date: '2025-01-01', name: 'New Year',           leadDays: 4, trailDays: 4, intensity: 0.132 },
  { date: '2025-01-26', name: 'Republic Day',       leadDays: 2, trailDays: 2, intensity: 0.060 },
  { date: '2025-03-14', name: 'Holi',               leadDays: 3, trailDays: 3, intensity: 0.102 },
  { date: '2025-03-31', name: 'Eid al-Fitr',        leadDays: 3, trailDays: 3, intensity: 0.084 },
  { date: '2025-06-07', name: 'Eid al-Adha',        leadDays: 2, trailDays: 2, intensity: 0.060 },
  { date: '2025-08-15', name: 'Independence Day',   leadDays: 2, trailDays: 2, intensity: 0.066 },
  { date: '2025-08-27', name: 'Ganesh Chaturthi',   leadDays: 3, trailDays: 3, intensity: 0.090 },
  { date: '2025-10-02', name: 'Dussehra',           leadDays: 4, trailDays: 3, intensity: 0.120 },
  { date: '2025-10-20', name: 'Diwali',             leadDays: 6, trailDays: 5, intensity: 0.198 },
  { date: '2025-12-25', name: 'Christmas',          leadDays: 5, trailDays: 7, intensity: 0.144 },
  { date: '2026-01-01', name: 'New Year',           leadDays: 4, trailDays: 4, intensity: 0.132 },
  { date: '2026-01-26', name: 'Republic Day',       leadDays: 2, trailDays: 2, intensity: 0.060 },
  { date: '2026-03-04', name: 'Holi',               leadDays: 3, trailDays: 3, intensity: 0.102 },
  { date: '2026-03-20', name: 'Eid al-Fitr',        leadDays: 3, trailDays: 3, intensity: 0.084 },
  { date: '2026-05-27', name: 'Eid al-Adha',        leadDays: 2, trailDays: 2, intensity: 0.060 },
  { date: '2026-08-15', name: 'Independence Day',   leadDays: 2, trailDays: 2, intensity: 0.066 },
  { date: '2026-09-14', name: 'Ganesh Chaturthi',   leadDays: 3, trailDays: 3, intensity: 0.090 },
]

export const FESTIVAL_LIST = FESTIVALS

function toUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

export function isoOf(ms: number): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function addDays(iso: string, n: number): string {
  return isoOf(toUTC(iso) + n * 86400000)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000)
}

export function periodOf(iso: string): string {
  return iso.slice(0, 7)
}

function seasonOf(month: number): Season {
  // Apr-Jun: summer holidays. Oct-Jan: festive and winter. Jul-Sep: monsoon trough.
  if (month >= 4 && month <= 6) return 'peak'
  if (month >= 10 || month === 1) return 'peak'
  if (month >= 7 && month <= 9) return 'lean'
  return 'shoulder'
}

function schoolHoliday(month: number, day: number): boolean {
  if (month === 5) return true
  if (month === 6 && day <= 15) return true
  if (month === 12 && day >= 20) return true
  if (month === 1 && day <= 5) return true
  return false
}

/** Triangular kernel around each festival, summed where windows overlap. */
function festivalPressure(iso: string): { pressure: number; name: string | null } {
  let pressure = 0
  let name: string | null = null
  let best = 0
  for (const f of FESTIVALS) {
    const delta = daysBetween(f.date, iso)
    const span = delta < 0 ? f.leadDays : f.trailDays
    if (Math.abs(delta) > span) continue
    const w = 1 - Math.abs(delta) / (span + 1)
    const p = f.intensity * w
    pressure += p
    if (p > best) {
      best = p
      name = f.name
    }
  }
  return { pressure, name }
}

export const CALENDAR: readonly CalendarDay[] = (() => {
  const out: CalendarDay[] = []
  const end = toUTC(WINDOW_END)
  let t = 0
  for (let ms = toUTC(WINDOW_START); ms <= end; ms += 86400000, t++) {
    const d = new Date(ms)
    const iso = isoOf(ms)
    const month = d.getUTCMonth() + 1
    const day = d.getUTCDate()
    const dow = d.getUTCDay()
    const { pressure, name } = festivalPressure(iso)
    const isWeekend = dow === 0 || dow === 6
    // A Monday or Friday public holiday makes a long weekend; approximate by treating
    // a high-intensity festival adjacent to a weekend as one.
    const isLongWeekend =
      (dow === 5 || dow === 1) && pressure > 0.08

    out.push({
      date: iso,
      year: d.getUTCFullYear(),
      month,
      day,
      dow,
      period: iso.slice(0, 7),
      season: seasonOf(month),
      isWeekend,
      isLongWeekend,
      isSchoolHoliday: schoolHoliday(month, day),
      festival: name,
      festivalPressure: pressure,
      t,
    })
  }
  return out
})()

export const CALENDAR_BY_DATE: ReadonlyMap<string, CalendarDay> = new Map(
  CALENDAR.map((c) => [c.date, c]),
)

/** Days on which collection happens. Index t in the panel refers into this array. */
export const COLLECTION_DAYS: readonly CalendarDay[] = CALENDAR.filter(
  (c) => c.date <= COLLECTION_END,
)

export const N_COLLECTION_DAYS = COLLECTION_DAYS.length

/** The 24 monthly periods, ascending. These are the index's time dimension. */
export const PERIODS: readonly string[] = [
  ...new Set(COLLECTION_DAYS.map((c) => c.period)),
].sort()

export const PERIOD_INDEX: ReadonlyMap<string, number> = new Map(
  PERIODS.map((p, i) => [p, i]),
)

/** Day-of-week effect on log fare. Friday and Sunday carry the leisure peak. */
export const DOW_EFFECT: readonly number[] = [
  0.055, // Sun
  0.02,  // Mon
  -0.03, // Tue
  -0.035,// Wed
  0.0,   // Thu
  0.062, // Fri
  -0.015,// Sat
]
