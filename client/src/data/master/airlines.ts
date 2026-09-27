/**
 * Carrier master data.
 *
 * Business model matters to the index, not to branding: LCC and FSC price the same
 * seat-kilometre differently, so a shift in the *mix* of carriers observed will move a
 * naive average with no underlying price change. That is precisely the composition
 * effect the Method Lab exists to expose.
 */

export type BusinessModel = 'LCC' | 'FSC' | 'Regional'

export interface Airline {
  readonly code: string
  readonly name: string
  readonly model: BusinessModel
  /** Domestic market share, used as the sampling weight when drawing quotes. */
  readonly share: number
  /** Multiplicative effect on log fare, holding route and horizon fixed. */
  readonly logFareEffect: number
  /** Carriers that operate the full cabin ladder can be quoted in premium/business. */
  readonly cabins: readonly ('economy' | 'premium' | 'business')[]
  readonly colour: string
}

export const AIRLINES: readonly Airline[] = [
  {
    code: '6E', name: 'IndiGo', model: 'LCC', share: 0.625, logFareEffect: -0.11,
    cabins: ['economy', 'premium'], colour: '#7AA5E8',
  },
  {
    code: 'AI', name: 'Air India', model: 'FSC', share: 0.152, logFareEffect: 0.1,
    cabins: ['economy', 'premium', 'business'], colour: '#E06A5E',
  },
  {
    code: 'IX', name: 'Air India Express', model: 'LCC', share: 0.088, logFareEffect: -0.13,
    cabins: ['economy'], colour: '#E0A45E',
  },
  {
    code: 'QP', name: 'Akasa Air', model: 'LCC', share: 0.055, logFareEffect: -0.09,
    cabins: ['economy'], colour: '#C98BD9',
  },
  {
    code: 'SG', name: 'SpiceJet', model: 'LCC', share: 0.052, logFareEffect: -0.14,
    cabins: ['economy'], colour: '#4ECDB4',
  },
  {
    code: '9I', name: 'Alliance Air', model: 'Regional', share: 0.028, logFareEffect: 0.04,
    cabins: ['economy'], colour: '#9AA4B2',
  },
]

export const AIRLINE_BY_CODE: ReadonlyMap<string, Airline> = new Map(
  AIRLINES.map((a) => [a.code, a]),
)

export function airline(code: string): Airline {
  const a = AIRLINE_BY_CODE.get(code)
  if (!a) throw new Error(`Unknown airline ${code}`)
  return a
}

export type Cabin = 'economy' | 'premium' | 'business'

/** Cabin effect on log fare (PROTOTYPE_SPEC section 3.2). */
export const CABIN_EFFECT: Readonly<Record<Cabin, number>> = {
  economy: 0,
  premium: 0.45,
  business: 1.1,
}

export type FareFamily = 'saver' | 'flexi' | 'corporate'

/**
 * Fare families are the quality characteristics the hedonic model adjusts for.
 * Refundability and baggage are what actually differ; the family name is a label.
 */
export const FARE_FAMILY: Readonly<
  Record<FareFamily, { refundable: boolean; baggageKg: number; logFareEffect: number }>
> = {
  saver: { refundable: false, baggageKg: 15, logFareEffect: 0 },
  flexi: { refundable: true, baggageKg: 20, logFareEffect: 0.17 },
  corporate: { refundable: true, baggageKg: 25, logFareEffect: 0.26 },
}
