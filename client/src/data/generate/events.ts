/**
 * Network disruption events.
 *
 * Disruptions matter to a price index for a reason that is easy to miss: they remove
 * capacity, which raises the fares that remain bookable, while simultaneously removing
 * observations from the panel. The price goes up and the sample gets thinner at the
 * same moment. A system that does not model both will report the price move and hide
 * the reliability loss.
 */

import { makeNormal, streamFor, uniform, weightedIndex, MASTER_SEED } from '@/lib/rng'
import { addDays, CALENDAR, COLLECTION_END, daysBetween } from '../master/calendar'

export type EventType = 'fog' | 'monsoon' | 'cyclone' | 'atc' | 'technical' | 'airspace'

export interface DisruptionEvent {
  readonly id: string
  readonly type: EventType
  readonly label: string
  readonly startDate: string
  readonly endDate: string
  readonly durationDays: number
  /** 1 (minor) to 5 (network-wide). */
  readonly severity: number
  readonly airports: readonly string[]
  /** Effect on log fare for affected routes at the peak of the event. */
  readonly logFareEffect: number
  /** Share of scheduled capacity lost at the peak. */
  readonly capacityLoss: number
  readonly description: string
}

const NORTH_FOG = ['DEL', 'LKO', 'VNS', 'IXC', 'ATQ', 'PAT', 'DED', 'JAI']
const WEST_MONSOON = ['BOM', 'GOI', 'PNQ', 'AMD', 'STV', 'IXE']
const SOUTH_MONSOON = ['COK', 'TRV', 'MAA', 'BLR', 'CJB']
const EAST_CYCLONE = ['BBI', 'CCU', 'VTZ', 'IXB']
const MAJOR = ['DEL', 'BOM', 'BLR', 'MAA', 'CCU', 'HYD']

const TYPE_LABEL: Record<EventType, string> = {
  fog: 'Dense fog - low visibility procedures',
  monsoon: 'Monsoon - heavy rainfall and waterlogging',
  cyclone: 'Cyclone - airport closure',
  atc: 'ATC flow restriction',
  technical: 'Fleet technical grounding',
  airspace: 'Airspace closure / reroute',
}

function pickN<T>(rng: () => number, xs: readonly T[], n: number): T[] {
  const pool = [...xs]
  const out: T[] = []
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!)
  }
  return out
}

/**
 * Events are drawn month by month with season-appropriate type probabilities, so fog
 * lands in January and cyclones in October rather than uniformly across the window.
 */
export const EVENTS: readonly DisruptionEvent[] = (() => {
  const rng = streamFor(MASTER_SEED, 'events')
  const normal = makeNormal(rng)
  const out: DisruptionEvent[] = []

  const collectionDays = CALENDAR.filter((c) => c.date <= COLLECTION_END)
  const months = [...new Set(collectionDays.map((c) => c.period))]

  let n = 0
  for (const period of months) {
    const month = Number(period.slice(5, 7))
    // Roughly 40 events over 24 months, front-loaded into the disruptive seasons.
    const expected =
      month === 12 || month === 1 ? 2.6 : month >= 6 && month <= 9 ? 2.3 : 1.1
    const count = Math.max(0, Math.round(expected + 0.6 * normal()))

    for (let k = 0; k < count; k++) {
      const weights: number[] = [
        month === 12 || month === 1 ? 6 : month === 11 || month === 2 ? 2 : 0.15, // fog
        month >= 6 && month <= 9 ? 6 : 0.2,                                        // monsoon
        month === 10 || month === 11 || month === 5 ? 2.2 : 0.2,                   // cyclone
        1.6,                                                                       // atc
        0.9,                                                                       // technical
        0.5,                                                                       // airspace
      ]
      const types: EventType[] = ['fog', 'monsoon', 'cyclone', 'atc', 'technical', 'airspace']
      const type = types[weightedIndex(rng, weights)]!

      const daysInMonth = collectionDays.filter((c) => c.period === period)
      const start = daysInMonth[Math.floor(rng() * daysInMonth.length)]!.date

      let pool: readonly string[]
      let duration: number
      let severity: number
      switch (type) {
        case 'fog':
          pool = NORTH_FOG
          duration = Math.round(uniform(rng, 2, 7))
          severity = Math.round(uniform(rng, 2, 5))
          break
        case 'monsoon':
          pool = rng() < 0.6 ? WEST_MONSOON : SOUTH_MONSOON
          duration = Math.round(uniform(rng, 1, 5))
          severity = Math.round(uniform(rng, 2, 4))
          break
        case 'cyclone':
          pool = EAST_CYCLONE
          duration = Math.round(uniform(rng, 2, 4))
          severity = Math.round(uniform(rng, 3, 5))
          break
        case 'atc':
          pool = MAJOR
          duration = 1
          severity = Math.round(uniform(rng, 1, 3))
          break
        case 'technical':
          pool = MAJOR
          duration = Math.round(uniform(rng, 3, 12))
          severity = Math.round(uniform(rng, 2, 4))
          break
        default:
          pool = MAJOR
          duration = Math.round(uniform(rng, 1, 3))
          severity = Math.round(uniform(rng, 1, 3))
      }

      /**
       * A small number of disruptions are not ordinary ones.
       *
       * The December 2023 Delhi fog, Cyclone Michaung closing Chennai, the 737 MAX
       * grounding: a handful of events per decade take double-digit capacity out of a
       * specific set of airports for a fortnight, and the fares on those routes move by
       * an amount nothing else in the series explains. Without them the disruption
       * channel is a gentle hum, every route-month looks like every other, and the
       * Anomaly Console has nothing to find - which would misrepresent the problem the
       * console exists to solve.
       *
       * They are rare (about one in twelve events, so roughly three in two years),
       * concentrated on few airports, and excluded for flow restrictions, which are by
       * nature short and mild.
       */
      const major = type !== 'atc' && type !== 'airspace' && rng() < 0.16
      if (major) {
        severity = 5
        duration = Math.round(duration * 2.2)
      }

      const airports = major
        ? pickN(rng, pool, Math.min(2, pool.length))
        : pickN(rng, pool, Math.max(1, Math.round(severity * 0.8)))
      const capacityLoss = major
        ? Math.min(0.8, 0.34 + uniform(rng, 0, 0.26))
        : Math.min(0.55, 0.04 * severity + uniform(rng, 0, 0.06))

      out.push({
        id: `EVT-${String(++n).padStart(3, '0')}`,
        type,
        label: TYPE_LABEL[type],
        startDate: start,
        endDate: addDays(start, duration - 1),
        durationDays: duration,
        severity,
        airports,
        // Capacity withdrawn raises the fares that remain sellable. The linear
        // coefficient is below one because some demand defers rather than re-books at
        // a higher fare. The quadratic term is scarcity pricing: losing the first
        // tenth of capacity sells the same fare ladder to slightly fewer seats, but
        // losing half of it means the only inventory left is at the top of the ladder,
        // and the pass-through stops being proportional. It is zero for ordinary
        // disruptions and only bites on the rare severe ones.
        logFareEffect: 0.42 * capacityLoss + 1.6 * Math.max(0, capacityLoss - 0.3) ** 2,
        capacityLoss,
        description: describe(type, airports, severity, duration),
      })
    }
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate))
})()

function describe(
  type: EventType,
  airports: readonly string[],
  severity: number,
  days: number,
): string {
  const at = airports.join(', ')
  const d = `${days} ${days === 1 ? 'day' : 'days'}`
  switch (type) {
    case 'fog':
      return `CAT III low-visibility procedures at ${at} for ${d}; severity ${severity}/5. Departures held, non-CAT-III-equipped aircraft diverted.`
    case 'monsoon':
      return `Heavy rainfall and waterlogging at ${at} for ${d}; severity ${severity}/5. Reduced runway acceptance rate.`
    case 'cyclone':
      return `Cyclone warning - operations suspended at ${at} for ${d}; severity ${severity}/5.`
    case 'atc':
      return `ATC flow restriction at ${at}; severity ${severity}/5. Ground delay programme in effect.`
    case 'technical':
      return `Fleet technical inspection affecting services through ${at} for ${d}; severity ${severity}/5.`
    default:
      return `Temporary airspace restriction affecting ${at} for ${d}; severity ${severity}/5.`
  }
}

/**
 * Calendar-index form of every event. The DGP resolves event pressure for 60 routes
 * across 823 days; doing that by parsing ISO strings costs a couple of seconds of the
 * user's loading screen, so the numeric form exists alongside the readable one.
 */
const CAL_INDEX: ReadonlyMap<string, number> = new Map(
  CALENDAR.map((c, i) => [c.date, i]),
)

interface EventSpan {
  readonly startIdx: number
  readonly endIdx: number
  readonly logFareEffect: number
  readonly capacityLoss: number
  readonly airports: ReadonlySet<string>
}

const SPANS: readonly EventSpan[] = EVENTS.map((e) => ({
  startIdx: CAL_INDEX.get(e.startDate) ?? 0,
  endIdx: CAL_INDEX.get(e.endDate) ?? 0,
  logFareEffect: e.logFareEffect,
  capacityLoss: e.capacityLoss,
  airports: new Set(e.airports),
}))

/**
 * Numeric equivalent of eventEffect, taking a CALENDAR index instead of a date.
 * Same decay shape: 3 days of anticipation, 5 days of spill-over.
 */
export function eventEffectAt(
  origin: string,
  destination: string,
  dayIdx: number,
): { logEffect: number; capacityLoss: number } {
  let logEffect = 0
  let capacityLoss = 0
  for (let i = 0; i < SPANS.length; i++) {
    const s = SPANS[i]!
    if (!s.airports.has(origin) && !s.airports.has(destination)) continue
    const fromStart = dayIdx - s.startIdx
    const fromEnd = dayIdx - s.endIdx
    let w = 0
    if (fromStart >= 0 && fromEnd <= 0) w = 1
    else if (fromStart < 0 && fromStart >= -3) w = 1 + fromStart / 4
    else if (fromEnd > 0 && fromEnd <= 5) w = 1 - fromEnd / 6
    if (w <= 0) continue
    logEffect += s.logFareEffect * w
    capacityLoss += s.capacityLoss * w
  }
  return { logEffect, capacityLoss: Math.min(0.7, capacityLoss) }
}

/** Index from date -> events active that day, for fast lookup inside the DGP loop. */
export const EVENTS_BY_DATE: ReadonlyMap<string, DisruptionEvent[]> = (() => {
  const m = new Map<string, DisruptionEvent[]>()
  for (const e of EVENTS) {
    for (let d = 0; d < e.durationDays; d++) {
      const day = addDays(e.startDate, d)
      const list = m.get(day)
      if (list) list.push(e)
      else m.set(day, [e])
    }
  }
  return m
})()

/**
 * Event pressure on a given route and departure date. Effects decay either side of the
 * event window because bookings shift rather than vanish.
 */
export function eventEffect(
  origin: string,
  destination: string,
  departureDate: string,
): { logEffect: number; capacityLoss: number; events: DisruptionEvent[] } {
  let logEffect = 0
  let capacityLoss = 0
  const hits: DisruptionEvent[] = []
  for (const e of EVENTS) {
    if (!e.airports.includes(origin) && !e.airports.includes(destination)) continue
    const fromStart = daysBetween(e.startDate, departureDate)
    const fromEnd = daysBetween(e.endDate, departureDate)
    let w = 0
    if (fromStart >= 0 && fromEnd <= 0) w = 1
    else if (fromStart < 0 && fromStart >= -3) w = 1 + fromStart / 4
    else if (fromEnd > 0 && fromEnd <= 5) w = 1 - fromEnd / 6
    if (w <= 0) continue
    logEffect += e.logFareEffect * w
    capacityLoss += e.capacityLoss * w
    hits.push(e)
  }
  return { logEffect, capacityLoss: Math.min(0.7, capacityLoss), events: hits }
}
