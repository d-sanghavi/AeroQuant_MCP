/**
 * Synthetic provenance.
 *
 * Every observation in this prototype can be traced back to a raw payload, and the
 * hash on that payload verifies. The payload is synthetic, but the CHAIN is real:
 * the bytes shown in the Lineage drawer are the bytes that were hashed, and the
 * Verify button recomputes SHA-256 over them in the browser with Web Crypto. Nothing
 * is asserted that is not checkable on screen.
 *
 * The blob is reconstructed on demand from the observation's own fields rather than
 * stored. Storing 500,000 JSON documents would cost hundreds of megabytes to prove a
 * point that a deterministic reconstruction proves just as well.
 */

import { AIRLINES } from '../master/airlines'
import { CALENDAR, COLLECTION_DAYS } from '../master/calendar'
import { HORIZONS, ROUTES } from '../master/routes'
import { FARE_SOURCES } from '../master/sources'
import { CABINS, FAMILIES, type Panel } from '../generate/dgp'
import { hash32 } from '@/lib/rng'
import type { ObservationDto } from './protocol'

const PARSER_VERSIONS: Record<string, string> = {
  amadeus: 'amadeus-offer-parser@2.4.1',
  duffel: 'duffel-ndc-parser@1.9.0',
  kiwi: 'tequila-parser@3.1.2',
  travelport: 'travelport-json-parser@1.4.7',
  'indigo-direct': 'playwright-6e-extractor@0.8.3',
  'airindia-direct': 'playwright-ai-extractor@0.7.1',
  'spicejet-direct': 'playwright-sg-extractor@0.6.9',
  'dgca-traffic': 'dgca-xlsx-parser@1.2.0',
}

/** SHA-256 as lowercase hex, via Web Crypto. Real hash, real verification. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * The payload as the source is supposed to have returned it, shaped like the real
 * offer documents these APIs emit. Deterministic in the observation's own fields, so
 * it is byte-identical every time it is reconstructed - which is what makes the hash
 * stable across reloads.
 */
export function rawPayloadFor(panel: Panel, i: number): { uri: string; payload: string; runId: string; parser: string } {
  const r = ROUTES[panel.routeIdx[i]!]!
  const a = AIRLINES[panel.airlineIdx[i]!]!
  const h = HORIZONS[panel.horizonIdx[i]!]!
  const cabin = CABINS[panel.cabinIdx[i]!]!
  const family = FAMILIES[panel.familyIdx[i]!]!
  const source = FARE_SOURCES[panel.sourceIdx[i]!]!
  const collect = COLLECTION_DAYS[panel.collectDay[i]!]!
  const depart = CALENDAR[panel.departDay[i]!]!
  const fare = panel.fare[i]!
  const stops = panel.stops[i]!

  const key = `${r.id}|${a.code}|${h}|${cabin}|${family}|${collect.date}|${i}`
  const seq = hash32(key)
  const offerId = `${a.code}-${(seq % 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`
  const flightNo = `${a.code} ${100 + (seq % 899)}`
  const runId = `ing_${collect.date}_${source.id}_${String(seq % 24).padStart(2, '0')}`

  // Fares are quoted as base + taxes; the ratio is roughly stable in Indian domestic.
  const base = Math.round(fare / 1.21)
  const taxes = Math.round(fare) - base
  const depHour = 6 + (seq % 15)
  const depMin = (seq % 4) * 15
  const durationMin = Math.round(r.distanceKm / 11.5 + 35 + (stops === 1 ? 95 : 0))

  const payload = {
    source: source.id,
    schema: source.isScraped ? 'aq.scrape.offer.v2' : 'aq.api.offer.v2',
    retrieved_at: `${collect.date}T0${1 + (seq % 5)}:${String(seq % 60).padStart(2, '0')}:00Z`,
    query: {
      origin: r.origin,
      destination: r.destination,
      departure_date: depart.date,
      booking_horizon_days: h,
      cabin,
      adults: 1,
      currency: 'INR',
    },
    offer: {
      offer_id: offerId,
      validating_carrier: a.code,
      fare_family: family,
      refundable: family !== 'saver',
      segments: [
        {
          flight_number: flightNo,
          origin: r.origin,
          destination: r.destination,
          departure_local: `${depart.date}T${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}:00`,
          duration_minutes: durationMin,
          stops,
          cabin,
          seats_remaining_bucket: panel.seats[i]! > 400 ? '>9' : String(1 + (seq % 9)),
        },
      ],
      price: {
        currency: 'INR',
        base: base,
        taxes_and_fees: taxes,
        total: Math.round(fare),
      },
      baggage: { checked_kg: family === 'saver' ? 15 : family === 'flexi' ? 20 : 25 },
    },
    collection: {
      run_id: runId,
      collector: source.isScraped ? 'playwright-worker' : 'api-client',
      rate_limit_per_min: source.rateLimitPerMin,
      compliance_gate: {
        robots: source.robots,
        tos: source.tos,
        reviewed_on: source.reviewedOn,
        decision: 'allow',
      },
    },
  }

  const yyyy = collect.date.slice(0, 4)
  const mm = collect.date.slice(5, 7)
  const dd = collect.date.slice(8, 10)
  const uri =
    `s3://aq-bronze/fares/source=${source.id}/year=${yyyy}/month=${mm}/day=${dd}/` +
    `${runId}/${offerId}.json.gz`

  return {
    uri,
    payload: JSON.stringify(payload, null, 2),
    runId,
    parser: PARSER_VERSIONS[source.id] ?? 'generic-parser@1.0.0',
  }
}

export async function observationDto(panel: Panel, i: number): Promise<ObservationDto> {
  const r = ROUTES[panel.routeIdx[i]!]!
  const a = AIRLINES[panel.airlineIdx[i]!]!
  const source = FARE_SOURCES[panel.sourceIdx[i]!]!
  const collect = COLLECTION_DAYS[panel.collectDay[i]!]!
  const depart = CALENDAR[panel.departDay[i]!]!
  const { uri, payload, runId, parser } = rawPayloadFor(panel, i)

  return {
    index: i,
    routeId: r.id,
    airline: `${a.code} ${a.name}`,
    horizon: HORIZONS[panel.horizonIdx[i]!]!,
    cabin: CABINS[panel.cabinIdx[i]!]!,
    fareFamily: FAMILIES[panel.familyIdx[i]!]!,
    stops: panel.stops[i]!,
    source: source.name,
    collectionDate: collect.date,
    departureDate: depart.date,
    period: collect.period,
    fare: panel.fare[i]!,
    seatsAvailable: panel.seats[i]!,
    rawBlobUri: uri,
    parserVersion: parser,
    ingestionRunId: runId,
    rawPayload: payload,
    sha256: await sha256Hex(payload),
  }
}
