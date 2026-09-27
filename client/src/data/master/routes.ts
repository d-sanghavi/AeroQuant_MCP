/**
 * Route master data - 60 domestic O&D pairs.
 *
 * `paxPerMonth` stands in for the DGCA monthly traffic table. It is the aggregation
 * weight for every index above route level, so it has to be defined here and nowhere
 * else: a weight that is computed in two places will eventually disagree with itself.
 *
 * `railHours` is present where a competitive rail corridor exists. It is not used in
 * the fare DGP - it is a substitution story the Route Explorer tells, and a reminder
 * that air fare is not the whole price of travel between two cities.
 */

import { AIRLINES, type Airline } from './airlines'
import { airport, haversineKm, type Airport, type Region } from './airports'

export interface RouteDef {
  readonly id: string
  readonly origin: string
  readonly destination: string
  readonly originAirport: Airport
  readonly destinationAirport: Airport
  readonly distanceKm: number
  readonly isTrunk: boolean
  /** Monthly O&D passengers, both directions. */
  readonly paxPerMonth: number
  readonly hasRailSubstitute: boolean
  readonly railHours: number | null
  readonly servingAirlines: readonly string[]
  /** Seats offered per day, before the capacity shocks the DGP applies. */
  readonly baseSeatsPerDay: number
  readonly originRegion: Region
  readonly destinationRegion: Region
}

/** [origin, destination, pax per month (thousands), rail journey hours or 0] */
const RAW: readonly (readonly [string, string, number, number])[] = [
  ['DEL', 'BOM', 520, 0],   ['DEL', 'BLR', 430, 0],   ['DEL', 'CCU', 300, 0],
  ['DEL', 'HYD', 240, 0],   ['DEL', 'MAA', 230, 0],   ['DEL', 'AMD', 200, 0],
  ['DEL', 'PNQ', 150, 0],   ['DEL', 'GOI', 130, 0],   ['DEL', 'LKO', 110, 6.5],
  ['DEL', 'COK', 95, 0],    ['DEL', 'PAT', 95, 0],    ['DEL', 'SXR', 90, 0],
  ['DEL', 'JAI', 85, 4.5],  ['DEL', 'VNS', 80, 9.5],  ['DEL', 'GAU', 70, 0],
  ['DEL', 'IXC', 60, 3.5],  ['DEL', 'ATQ', 55, 6.0],  ['DEL', 'BBI', 50, 0],
  ['DEL', 'IDR', 50, 12.0], ['DEL', 'DED', 45, 4.5],  ['DEL', 'BHO', 45, 8.0],
  ['DEL', 'UDR', 35, 12.0],

  ['BOM', 'BLR', 340, 0],   ['BOM', 'MAA', 190, 0],   ['BOM', 'HYD', 180, 0],
  ['BOM', 'AMD', 160, 5.5], ['BOM', 'CCU', 150, 0],   ['BOM', 'GOI', 110, 11.0],
  ['BOM', 'COK', 85, 0],    ['BOM', 'NAG', 60, 11.5], ['BOM', 'IDR', 55, 13.0],
  ['BOM', 'JAI', 45, 0],    ['BOM', 'RAJ', 30, 12.0],

  ['BLR', 'HYD', 160, 0],   ['BLR', 'CCU', 140, 0],   ['BLR', 'MAA', 130, 4.5],
  ['BLR', 'PNQ', 95, 0],    ['BLR', 'COK', 80, 0],    ['BLR', 'GOI', 70, 14.0],
  ['BLR', 'AMD', 55, 0],    ['BLR', 'TRV', 45, 0],    ['BLR', 'VTZ', 40, 0],
  ['BLR', 'IXE', 40, 7.0],

  ['MAA', 'HYD', 120, 0],   ['MAA', 'CCU', 110, 0],   ['MAA', 'CJB', 55, 6.5],
  ['MAA', 'TRV', 50, 0],    ['MAA', 'IXM', 45, 8.0],  ['MAA', 'COK', 45, 11.0],
  ['MAA', 'TRZ', 35, 5.5],  ['MAA', 'IXZ', 20, 0],

  ['CCU', 'GAU', 95, 0],    ['CCU', 'HYD', 90, 0],    ['CCU', 'IXB', 75, 8.5],
  ['CCU', 'BBI', 60, 7.0],  ['CCU', 'PAT', 50, 9.0],  ['CCU', 'IXR', 45, 7.5],
  ['CCU', 'IMF', 30, 0],

  ['HYD', 'VTZ', 55, 11.0], ['HYD', 'NAG', 35, 8.5],
]

/**
 * Which carriers actually quote a route. Thin routes are not served by everyone, and
 * that is a source of real missingness in the panel - a route with two carriers has
 * fewer observations and a wider confidence interval, which the terminal must show
 * rather than paper over.
 */
/**
 * Which carriers fly a route.
 *
 * The thresholds are calibrated, not guessed. Within a route the sampler draws an
 * airline in proportion to its national share *renormalised over the carriers that
 * actually serve that route* - so if IndiGo were the only operator on every thin
 * route, its share of the observed panel would come out far above its true national
 * share, and the terminal would open with a number an aviation reader knows is wrong.
 * These cut-offs are set so that the pax-weighted expected share of each carrier lands
 * within about a point of the published domestic shares in `airlines.ts`.
 */
function servingAirlines(paxThousands: number, distanceKm: number): string[] {
  const by = (c: string): Airline => AIRLINES.find((a) => a.code === c)!
  const out: string[] = ['6E'] // IndiGo is on essentially everything
  if (paxThousands >= 24) out.push('AI')
  if (paxThousands >= 18) out.push('SG')
  if (paxThousands >= 36) out.push('QP')
  if (paxThousands >= 20 && distanceKm > 420) out.push('IX')
  if (paxThousands < 58) out.push('9I')
  if (out.length === 1) out.push('SG')
  return out.filter((c) => by(c) !== undefined)
}

export const ROUTES: readonly RouteDef[] = RAW.map(([o, d, paxK, rail]) => {
  const oa = airport(o)
  const da = airport(d)
  const distanceKm = Math.round(haversineKm(oa, da))
  const paxPerMonth = paxK * 1000
  const serving = servingAirlines(paxK, distanceKm)
  return {
    id: `${o}-${d}`,
    origin: o,
    destination: d,
    originAirport: oa,
    destinationAirport: da,
    distanceKm,
    isTrunk: oa.isMetro && da.isMetro && paxK >= 110,
    paxPerMonth,
    hasRailSubstitute: rail > 0,
    railHours: rail > 0 ? rail : null,
    servingAirlines: serving,
    // ~180 seats a frame; frequency scales with traffic but sub-linearly (load factor
    // absorbs the rest), which is why the exponent is below 1.
    baseSeatsPerDay: Math.round(180 * Math.max(1, Math.pow(paxK / 30, 0.85))),
    originRegion: oa.region,
    destinationRegion: da.region,
  }
})

export const ROUTE_BY_ID: ReadonlyMap<string, RouteDef> = new Map(
  ROUTES.map((r) => [r.id, r]),
)

export function route(id: string): RouteDef {
  const r = ROUTE_BY_ID.get(id)
  if (!r) throw new Error(`Unknown route ${id}`)
  return r
}

export const TOTAL_PAX_PER_MONTH = ROUTES.reduce((s, r) => s + r.paxPerMonth, 0)

/**
 * DGCA-style passenger weights, normalised to sum to exactly 1.
 * PROTOTYPE_SPEC section 4.4 requires the assertion, so it lives with the weights.
 */
export const ROUTE_WEIGHTS: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>()
  for (const r of ROUTES) m.set(r.id, r.paxPerMonth / TOTAL_PAX_PER_MONTH)
  const total = [...m.values()].reduce((a, b) => a + b, 0)
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`Route weights must sum to 1, got ${total}`)
  }
  return m
})()

/** The nine fixed booking horizons the panel is collected on. */
export const HORIZONS: readonly number[] = [1, 2, 3, 7, 15, 30, 45, 60, 90]

/** Coarser bands, for cross-tabs where nine columns is too many. */
export type HorizonBand = 'last-minute' | 'short' | 'medium' | 'advance'
export function horizonBand(h: number): HorizonBand {
  if (h <= 3) return 'last-minute'
  if (h <= 15) return 'short'
  if (h <= 45) return 'medium'
  return 'advance'
}

export const REGIONS: readonly Region[] = [
  'North', 'West', 'South', 'East', 'Northeast', 'Central', 'Islands',
]
