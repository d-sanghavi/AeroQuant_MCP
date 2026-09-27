/**
 * Source registry - the compliance spine.
 *
 * In the full system this is a first-class database entity with a public page, because
 * a national statistical office cannot publish a number whose provenance it will not
 * state. The prototype keeps the same shape.
 *
 * Two rules are encoded here rather than in prose:
 *  1. A source whose terms of service prohibit automated access is `enabled: false`.
 *     It is not quietly used "for research". It appears in the registry, disabled,
 *     with the clause quoted and the review dated - that is the whole point.
 *  2. A ToS verdict without a clause reference and a review date is not a verdict.
 *     `tosClause` and `reviewedOn` are non-nullable for that reason.
 */

export type SourceKind = 'aggregator-api' | 'airline-direct' | 'ota' | 'government'
export type RobotsVerdict = 'allowed' | 'disallowed' | 'not-applicable'
export type TosVerdict = 'permitted' | 'permitted-with-conditions' | 'prohibited' | 'public-data'

export interface Source {
  readonly id: string
  readonly name: string
  readonly kind: SourceKind
  /** True where the data is obtained by browser automation rather than a licensed API. */
  readonly isScraped: boolean
  readonly robots: RobotsVerdict
  readonly robotsPath: string
  readonly tos: TosVerdict
  /** The specific clause the verdict rests on. A verdict without one is an opinion. */
  readonly tosClause: string
  readonly reviewedOn: string
  readonly reviewedBy: string
  readonly licence: string
  /** Whether licence terms permit redistributing derived aggregates. */
  readonly redistributable: boolean
  readonly rateLimitPerMin: number
  /** Share of successful calls over the last 30 days. */
  readonly reliability: number
  readonly lastSuccessAt: string
  readonly enabled: boolean
  /** Share of the panel this source contributes when enabled. Sums to 1 over enabled. */
  readonly observationShare: number
  readonly notes: string
}

export const SOURCES: readonly Source[] = [
  {
    id: 'amadeus',
    name: 'Amadeus Self-Service Flight Offers',
    kind: 'aggregator-api',
    isScraped: false,
    robots: 'not-applicable',
    robotsPath: '-',
    tos: 'permitted',
    tosClause: 'Self-Service API Terms cl. 3.1 - licensed programmatic access for the subscribed entity',
    reviewedOn: '2026-08-14',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'Commercial API subscription',
    redistributable: true,
    rateLimitPerMin: 600,
    reliability: 0.994,
    lastSuccessAt: '2026-09-27T04:12:00Z',
    enabled: true,
    observationShare: 0.30,
    notes: 'Primary panel source. Cached offers; quoted price excludes ancillaries.',
  },
  {
    id: 'duffel',
    name: 'Duffel Flights API',
    kind: 'aggregator-api',
    isScraped: false,
    robots: 'not-applicable',
    robotsPath: '-',
    tos: 'permitted',
    tosClause: 'Duffel API Terms cl. 2.2 - permitted use for search and booking integrations',
    reviewedOn: '2026-08-14',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'Commercial API subscription',
    redistributable: true,
    rateLimitPerMin: 300,
    reliability: 0.988,
    lastSuccessAt: '2026-09-27T04:09:00Z',
    enabled: true,
    observationShare: 0.22,
    notes: 'Live NDC content. Best coverage of LCC branded fares.',
  },
  {
    id: 'kiwi',
    name: 'Kiwi.com Tequila API',
    kind: 'aggregator-api',
    isScraped: false,
    robots: 'not-applicable',
    robotsPath: '-',
    tos: 'permitted-with-conditions',
    tosClause: 'Tequila Partner Terms cl. 5.4 - derived aggregates permitted, raw offer redistribution prohibited',
    reviewedOn: '2026-08-21',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'Partner API agreement',
    redistributable: false,
    rateLimitPerMin: 100,
    reliability: 0.971,
    lastSuccessAt: '2026-09-27T03:55:00Z',
    enabled: true,
    observationShare: 0.14,
    notes:
      'Raw offers must stay in bronze. Only aggregates leave the boundary - enforced by the export layer.',
  },
  {
    id: 'travelport',
    name: 'Travelport JSON Air API',
    kind: 'aggregator-api',
    isScraped: false,
    robots: 'not-applicable',
    robotsPath: '-',
    tos: 'permitted-with-conditions',
    tosClause: 'Travelport Developer Agreement cl. 4.1 - non-transferable licence, per-seat metering',
    reviewedOn: '2026-07-30',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'GDS developer agreement',
    redistributable: false,
    rateLimitPerMin: 60,
    reliability: 0.962,
    lastSuccessAt: '2026-09-26T22:41:00Z',
    enabled: true,
    observationShare: 0.09,
    notes: 'Used for corporate and flexi fare families the LCC APIs under-report.',
  },
  {
    id: 'indigo-direct',
    name: 'IndiGo (goindigo.in) availability',
    kind: 'airline-direct',
    isScraped: true,
    robots: 'allowed',
    robotsPath: '/robots.txt - no Disallow covering /flight-booking search paths',
    tos: 'permitted-with-conditions',
    tosClause: 'Website Terms cl. 11 - no bulk extraction; measured access for research tolerated',
    reviewedOn: '2026-09-02',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'Public web content',
    redistributable: true,
    rateLimitPerMin: 6,
    reliability: 0.934,
    lastSuccessAt: '2026-09-27T03:30:00Z',
    enabled: true,
    observationShare: 0.10,
    notes:
      'Conservative rate limit set well below the tolerated ceiling. Collector honours Crawl-delay.',
  },
  {
    id: 'airindia-direct',
    name: 'Air India (airindia.com) availability',
    kind: 'airline-direct',
    isScraped: true,
    robots: 'allowed',
    robotsPath: '/robots.txt - Disallow: /booking/payment only',
    tos: 'permitted-with-conditions',
    tosClause: 'Conditions of Use cl. 8.3 - personal non-commercial use; research access agreed by letter 2026-08-19',
    reviewedOn: '2026-08-19',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'Public web content + written consent',
    redistributable: true,
    rateLimitPerMin: 4,
    reliability: 0.897,
    lastSuccessAt: '2026-09-27T02:58:00Z',
    enabled: true,
    observationShare: 0.07,
    notes: 'Written consent on file. Covers FSC business-cabin fares the APIs miss.',
  },
  {
    id: 'spicejet-direct',
    name: 'SpiceJet (spicejet.com) availability',
    kind: 'airline-direct',
    isScraped: true,
    robots: 'allowed',
    robotsPath: '/robots.txt - User-agent: * Allow: /',
    tos: 'permitted-with-conditions',
    tosClause: 'Terms of Use cl. 6 - automated access permitted at non-disruptive rates',
    reviewedOn: '2026-09-02',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'Public web content',
    redistributable: true,
    rateLimitPerMin: 5,
    reliability: 0.861,
    lastSuccessAt: '2026-09-26T21:14:00Z',
    enabled: true,
    observationShare: 0.05,
    notes: 'Lowest reliability of the enabled sources; session expiry drives most failures.',
  },
  {
    id: 'ota-alpha',
    name: 'OTA Alpha (major Indian OTA)',
    kind: 'ota',
    isScraped: true,
    robots: 'disallowed',
    robotsPath: '/robots.txt - Disallow: /flight/search',
    tos: 'prohibited',
    tosClause:
      'Terms of Service cl. 4.2 - "You shall not use any robot, spider, scraper or other automated means to access the Services"',
    reviewedOn: '2026-07-11',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'None',
    redistributable: false,
    rateLimitPerMin: 0,
    reliability: 0,
    lastSuccessAt: '-',
    enabled: false,
    observationShare: 0,
    notes:
      'DISABLED. robots.txt and ToS both prohibit automated access. Retained in the registry so the exclusion is auditable, not invisible.',
  },
  {
    id: 'ota-beta',
    name: 'OTA Beta (metasearch aggregator)',
    kind: 'ota',
    isScraped: true,
    robots: 'disallowed',
    robotsPath: '/robots.txt - Disallow: / for non-listed agents',
    tos: 'prohibited',
    tosClause:
      'User Agreement cl. 9.1 - "systematic retrieval of content to create a collection, compilation or database is expressly prohibited"',
    reviewedOn: '2026-07-11',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'None',
    redistributable: false,
    rateLimitPerMin: 0,
    reliability: 0,
    lastSuccessAt: '-',
    enabled: false,
    observationShare: 0,
    notes:
      'DISABLED. Clause 9.1 names database compilation specifically, which is exactly what an index is.',
  },
  {
    id: 'dgca-traffic',
    name: 'DGCA monthly domestic traffic reports',
    kind: 'government',
    isScraped: false,
    robots: 'allowed',
    robotsPath: 'Open Government Data portal',
    tos: 'public-data',
    tosClause: 'National Data Sharing and Accessibility Policy - Government Open Data Licence (India)',
    reviewedOn: '2026-06-05',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'GODL-India',
    redistributable: true,
    rateLimitPerMin: 30,
    reliability: 1.0,
    lastSuccessAt: '2026-09-15T10:00:00Z',
    enabled: true,
    observationShare: 0.03,
    notes: 'Source of the passenger weights used in every aggregation above route level.',
  },
  {
    id: 'aera-orders',
    name: 'AERA tariff orders and determinations',
    kind: 'government',
    isScraped: false,
    robots: 'allowed',
    robotsPath: 'aera.gov.in - public document repository',
    tos: 'public-data',
    tosClause: 'Published under the AERA Act 2008 s.13 disclosure obligations',
    reviewedOn: '2026-06-05',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'GODL-India',
    redistributable: true,
    rateLimitPerMin: 30,
    reliability: 1.0,
    lastSuccessAt: '2026-09-11T10:00:00Z',
    enabled: true,
    observationShare: 0,
    notes: 'Corpus for the regulatory assistant. Superseded orders are retained, not deleted.',
  },
  {
    id: 'iocl-atf',
    name: 'Oil marketing company ATF price notifications',
    kind: 'government',
    isScraped: false,
    robots: 'allowed',
    robotsPath: 'Public price notification pages',
    tos: 'public-data',
    tosClause: 'Published tariff notifications - no access restriction asserted',
    reviewedOn: '2026-06-05',
    reviewedBy: 'Compliance (legal review, MoSPI DIID)',
    licence: 'Public domain',
    redistributable: true,
    rateLimitPerMin: 12,
    reliability: 0.999,
    lastSuccessAt: '2026-09-01T06:00:00Z',
    enabled: true,
    observationShare: 0,
    notes: 'Monthly city-wise ATF, the fuel cost driver in the attribution model.',
  },
]

export const SOURCE_BY_ID: ReadonlyMap<string, Source> = new Map(SOURCES.map((s) => [s.id, s]))

/** Sources that actually contribute fare observations to the panel. */
export const FARE_SOURCES = SOURCES.filter((s) => s.observationShare > 0)

export const SCRAPED_FARE_SOURCE_IDS = FARE_SOURCES.filter((s) => s.isScraped).map((s) => s.id)

export function sourcesEnabled(disableScraped: boolean): Source[] {
  return FARE_SOURCES.filter((s) => s.enabled && !(disableScraped && s.isScraped))
}

/** Re-normalised sampling weights over whichever sources are currently live. */
export function sourceWeights(disableScraped: boolean): Map<string, number> {
  const live = sourcesEnabled(disableScraped)
  const total = live.reduce((a, s) => a + s.observationShare, 0)
  return new Map(live.map((s) => [s.id, s.observationShare / total]))
}
