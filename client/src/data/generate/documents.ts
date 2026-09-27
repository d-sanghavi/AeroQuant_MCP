/**
 * The regulatory corpus the Research Assistant retrieves over.
 *
 * Twenty-one chunks across nine documents. They are synthetic - written for this
 * prototype, in the register and structure of the real instruments they stand in for -
 * and the screen says so. What is NOT synthetic is the retrieval: TF-IDF with cosine
 * similarity, computed in the browser over these chunks, with no model involved.
 *
 * Two documents matter more than the rest:
 *
 *  - AERA/2024/PSF/07 sets a passenger service fee and is SUPERSEDED on 2026-04-01 by
 *    AERA/2026/PSF/03, which sets a different one. An `as_of` date before April 2026
 *    must return the old figure and an `as_of` after it must return the new one. A
 *    retrieval system that cannot do this is unusable for official statistics, where
 *    the question is almost always "what was the rule at the time", not "what is the
 *    rule now".
 *
 *  - AQ/METH/2026/01 is our own methodology note, so that a question about the index
 *    resolves to a citable statement rather than to the interface's own prose.
 */

export type DocType = 'circular' | 'order' | 'methodology' | 'standard' | 'note'

export interface DocChunk {
  readonly id: string
  readonly docId: string
  readonly title: string
  readonly issuer: string
  readonly docType: DocType
  /** Date the instrument took effect. A chunk is invisible to an earlier as_of. */
  readonly publishedOn: string
  /** Date it ceased to have effect, if it has been superseded. */
  readonly supersededOn: string | null
  readonly supersededBy: string | null
  readonly section: string
  readonly text: string
  readonly reference: string
}

export const CORPUS: readonly DocChunk[] = [
  // --- AERA passenger service fee, the superseded pair ----------------------
  {
    id: 'aera-2024-psf-01',
    docId: 'AERA/2024/PSF/07',
    title: 'Determination of Passenger Service Fee for Major Airports, Third Control Period',
    issuer: 'Airports Economic Regulatory Authority of India',
    docType: 'order',
    publishedOn: '2024-04-01',
    supersededOn: '2026-04-01',
    supersededBy: 'AERA/2026/PSF/03',
    section: 'Paragraph 4.2 - Tariff',
    text:
      'The Authority determines the Passenger Service Fee (facilitation component) payable by embarking domestic passengers at major airports at Rs 160 per departing passenger with effect from 1 April 2024. The fee shall be collected by the airline at the time of ticket issue, shown as a separate line item on the fare breakdown, and remitted to the airport operator. For international embarking passengers the corresponding determination is Rs 400 per departing passenger.',
    reference: 'AERA Order 07/2024-25, para 4.2',
  },
  {
    id: 'aera-2024-psf-02',
    docId: 'AERA/2024/PSF/07',
    title: 'Determination of Passenger Service Fee for Major Airports, Third Control Period',
    issuer: 'Airports Economic Regulatory Authority of India',
    docType: 'order',
    publishedOn: '2024-04-01',
    supersededOn: '2026-04-01',
    supersededBy: 'AERA/2026/PSF/03',
    section: 'Paragraph 6.1 - Treatment in fare display',
    text:
      'Statutory levies including the Passenger Service Fee, the User Development Fee and the Aviation Security Fee shall be displayed separately from the base fare and from carrier-imposed surcharges. No airline or travel agent shall describe a statutory levy as a fare component, nor aggregate it into a single displayed total without an itemised breakdown available to the passenger before payment.',
    reference: 'AERA Order 07/2024-25, para 6.1',
  },
  {
    id: 'aera-2026-psf-01',
    docId: 'AERA/2026/PSF/03',
    title: 'Revised Determination of Passenger Service Fee, Fourth Control Period',
    issuer: 'Airports Economic Regulatory Authority of India',
    docType: 'order',
    publishedOn: '2026-04-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Paragraph 3.4 - Revised tariff',
    text:
      'In supersession of Order 07/2024-25, the Authority determines the Passenger Service Fee (facilitation component) payable by embarking domestic passengers at major airports at Rs 185 per departing passenger with effect from 1 April 2026. For international embarking passengers the determination is revised to Rs 450 per departing passenger. The revision reflects the approved capital expenditure programme for the fourth control period and the true-up of the preceding period.',
    reference: 'AERA Order 03/2026-27, para 3.4',
  },
  {
    id: 'aera-2026-psf-02',
    docId: 'AERA/2026/PSF/03',
    title: 'Revised Determination of Passenger Service Fee, Fourth Control Period',
    issuer: 'Airports Economic Regulatory Authority of India',
    docType: 'order',
    publishedOn: '2026-04-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Paragraph 8.2 - Statistical reporting',
    text:
      'Airport operators shall report monthly collections of the Passenger Service Fee, disaggregated by domestic and international embarkation, to the Authority within twenty-one days of the close of the month. Aggregated figures shall be made available for statistical use, including compilation of price indices, subject to the confidentiality provisions of paragraph 9.',
    reference: 'AERA Order 03/2026-27, para 8.2',
  },

  // --- DGCA tariff transparency --------------------------------------------
  {
    id: 'dgca-tariff-01',
    docId: 'DGCA/CAR/M3/S4/II',
    title: 'Civil Aviation Requirement: Air Transport Tariff',
    issuer: 'Directorate General of Civil Aviation',
    docType: 'circular',
    publishedOn: '2023-11-15',
    supersededOn: null,
    supersededBy: null,
    section: 'Clause 3 - Tariff establishment',
    text:
      'Under Rule 135 of the Aircraft Rules 1937, every air transport undertaking shall establish its tariff having regard to all relevant factors including the cost of operation, characteristics of service, reasonable profit and the generally prevailing tariff. Tariffs so established shall be published on the website of the undertaking and shall be available for inspection. The Directorate does not approve tariffs but monitors them for reasonableness and may call for justification.',
    reference: 'CAR Section 3, Series M, Part IV',
  },
  {
    id: 'dgca-tariff-02',
    docId: 'DGCA/CAR/M3/S4/II',
    title: 'Civil Aviation Requirement: Air Transport Tariff',
    issuer: 'Directorate General of Civil Aviation',
    docType: 'circular',
    publishedOn: '2023-11-15',
    supersededOn: null,
    supersededBy: null,
    section: 'Clause 5 - Fare buckets and display',
    text:
      'Airlines operate a system of fare buckets within each cabin, released sequentially as inventory depletes. The tariff filed with the Directorate shall state the range of fare levels offered in each bucket. The displayed price to a prospective passenger shall be the all-inclusive amount payable, with statutory levies and carrier-imposed charges itemised. Fare families differing in refundability, baggage allowance or change fee shall be presented as distinct products.',
    reference: 'CAR Section 3, Series M, Part IV, cl. 5',
  },
  {
    id: 'dgca-traffic-01',
    docId: 'DGCA/STAT/2026/MONTHLY',
    title: 'Monthly Traffic Statistics: Domestic Scheduled Operations',
    issuer: 'Directorate General of Civil Aviation',
    docType: 'note',
    publishedOn: '2026-09-15',
    supersededOn: null,
    supersededBy: null,
    section: 'Table 2 - Passengers carried by scheduled domestic airlines',
    text:
      'Passengers carried by scheduled domestic airlines and market share by carrier are published monthly. Market share is computed on passengers carried, not on seats offered or on departures. Users compiling price statistics should note that share of passengers carried differs from share of fares observed in any sampling frame, because carriers differ in the number of fare products they offer per departure and in the cabins they operate.',
    reference: 'DGCA Monthly Traffic Statistics, Table 2',
  },

  // --- MoSPI CPI methodology -----------------------------------------------
  {
    id: 'mospi-cpi-01',
    docId: 'MOSPI/CPI/MANUAL/2024',
    title: 'Consumer Price Index: Concepts, Methodology and Compilation',
    issuer: 'Ministry of Statistics and Programme Implementation',
    docType: 'methodology',
    publishedOn: '2024-02-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Chapter 4 - Price collection',
    text:
      'Price collection for the Consumer Price Index follows the principle of constant quality: the item priced in the current period must be the same item, of the same specification, as that priced in the base period. Where the specification changes, the price change attributable to the change in specification must be separated from the pure price change by an appropriate quality adjustment, failing which the index measures a mixture of the two.',
    reference: 'MoSPI CPI Manual 2024, ch. 4',
  },
  {
    id: 'mospi-cpi-02',
    docId: 'MOSPI/CPI/MANUAL/2024',
    title: 'Consumer Price Index: Concepts, Methodology and Compilation',
    issuer: 'Ministry of Statistics and Programme Implementation',
    docType: 'methodology',
    publishedOn: '2024-02-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Chapter 5 - Elementary aggregation',
    text:
      'At the elementary level, where expenditure weights within the aggregate are not available, the geometric mean of price relatives (the Jevons index) is the preferred formula. The ratio of arithmetic means (Dutot) is admissible only where the items in the aggregate are homogeneous and quoted in identical units. The arithmetic mean of price relatives (Carli) is not recommended, as it fails the time reversal test and carries a known upward bias.',
    reference: 'MoSPI CPI Manual 2024, ch. 5',
  },
  {
    id: 'mospi-cpi-03',
    docId: 'MOSPI/CPI/MANUAL/2024',
    title: 'Consumer Price Index: Concepts, Methodology and Compilation',
    issuer: 'Ministry of Statistics and Programme Implementation',
    docType: 'methodology',
    publishedOn: '2024-02-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Chapter 9 - Transport services',
    text:
      'Air transport presents particular difficulty because the price of a seat varies systematically with the interval between booking and departure, with the cabin and fare conditions purchased, and with the day of week and season of travel. A simple average of observed fares will move when the composition of bookings observed changes, even where no tariff has been revised. Compilers are advised to hold the booking interval and the fare conditions fixed, or to adjust for them explicitly.',
    reference: 'MoSPI CPI Manual 2024, ch. 9',
  },
  {
    id: 'mospi-webscrape-01',
    docId: 'MOSPI/DIID/2026/WEB',
    title: 'Guidance Note on the Use of Web-Scraped Data in Official Statistics',
    issuer: 'MoSPI, Data Informatics and Innovation Division',
    docType: 'note',
    publishedOn: '2026-01-20',
    supersededOn: null,
    supersededBy: null,
    section: 'Section 3 - Legal and ethical basis',
    text:
      'Automated collection from a website shall proceed only where the terms of service of that website permit it, and where the robots exclusion protocol does not disallow the paths in question. Where terms prohibit automated access, the source shall not be collected, and its absence shall be recorded in the source register together with the clause relied upon and the date of review. The register shall be capable of inspection.',
    reference: 'MoSPI DIID Guidance Note 1/2026, s. 3',
  },
  {
    id: 'mospi-webscrape-02',
    docId: 'MOSPI/DIID/2026/WEB',
    title: 'Guidance Note on the Use of Web-Scraped Data in Official Statistics',
    issuer: 'MoSPI, Data Informatics and Innovation Division',
    docType: 'note',
    publishedOn: '2026-01-20',
    supersededOn: null,
    supersededBy: null,
    section: 'Section 6 - Continuity of the series',
    text:
      'A statistical series shall not be made wholly dependent on a collection method that may be withdrawn without notice. Compilers shall demonstrate, by recomputation, that the series remains publishable when web-scraped sources are removed from the sample, and shall document the resulting effect on coverage, imputation and estimated sampling error.',
    reference: 'MoSPI DIID Guidance Note 1/2026, s. 6',
  },

  // --- ILO / international manuals -----------------------------------------
  {
    id: 'ilo-manual-01',
    docId: 'ILO/CPI/MANUAL/2020',
    title: 'Consumer Price Index Manual: Concepts and Methods',
    issuer: 'International Labour Organization and partner agencies',
    docType: 'standard',
    publishedOn: '2020-06-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Chapter 8 - Multilateral index number methods',
    text:
      'Where the set of products available changes rapidly, bilateral comparison between two periods uses only the products common to both and discards the remainder. Multilateral methods - the GEKS family, the Time Product Dummy, and the Geary-Khamis method - use all products observed anywhere in a window and produce transitive comparisons. Transitivity means that the comparison between two periods does not depend on the path taken between them.',
    reference: 'ILO CPI Manual 2020, ch. 8',
  },
  {
    id: 'ilo-manual-02',
    docId: 'ILO/CPI/MANUAL/2020',
    title: 'Consumer Price Index Manual: Concepts and Methods',
    issuer: 'International Labour Organization and partner agencies',
    docType: 'standard',
    publishedOn: '2020-06-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Chapter 10 - Chain drift',
    text:
      'Chaining a bilateral index over successive short periods can produce cumulative drift, in which the chained comparison between two distant periods differs materially from the direct comparison between them. Drift is most severe where products enter and leave the sample frequently and where prices fluctuate rather than trend. Chain drift is a distinct defect from failure of the time reversal test and a formula may exhibit either without the other.',
    reference: 'ILO CPI Manual 2020, ch. 10',
  },
  {
    id: 'ilo-manual-03',
    docId: 'ILO/CPI/MANUAL/2020',
    title: 'Consumer Price Index Manual: Concepts and Methods',
    issuer: 'International Labour Organization and partner agencies',
    docType: 'standard',
    publishedOn: '2020-06-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Chapter 22 - Revision policy',
    text:
      'A published index should not be revised except under a stated and infrequent revision policy. Where a rolling window estimator is used, the window must be extended by a splicing procedure that leaves previously published values unchanged. The window splice, the movement splice and the half splice differ in which previously estimated period is used to attach the new one; each is defensible, and the choice must be documented.',
    reference: 'ILO CPI Manual 2020, ch. 22',
  },
  {
    id: 'eurostat-hicp-01',
    docId: 'EUROSTAT/HICP/2022/AIR',
    title: 'Harmonised Index of Consumer Prices: Treatment of Passenger Air Transport',
    issuer: 'Eurostat',
    docType: 'standard',
    publishedOn: '2022-09-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Section 4 - Sampling of booking horizons',
    text:
      'Member States collecting airfares shall sample a fixed set of booking horizons relative to the departure date, and shall hold that set constant through time. Where the realised distribution of booking horizons in the collected sample drifts, the resulting index movement will conflate the change in tariff with the change in the timing of observation. A fixed-horizon design is preferred to ex post reweighting.',
    reference: 'Eurostat HICP methodological guidance, air transport, s. 4',
  },

  // --- our own methodology note --------------------------------------------
  {
    id: 'aq-meth-01',
    docId: 'AQ/METH/2026/01',
    title: 'AeroQuant Airfare Price Index: Methodology Note',
    issuer: 'AeroQuant (prototype)',
    docType: 'methodology',
    publishedOn: '2026-09-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Section 2 - Definition of a product',
    text:
      'A product is the tuple of route, operating carrier, booking horizon, cabin and fare family. Two quotes are treated as the same product if and only if all five components agree. The booking horizon is included in the product definition rather than adjusted for afterwards, because the fare-horizon relationship is steep at short horizons and an ex post adjustment would carry the entire burden of the index.',
    reference: 'AeroQuant Methodology Note 1/2026, s. 2',
  },
  {
    id: 'aq-meth-02',
    docId: 'AQ/METH/2026/01',
    title: 'AeroQuant Airfare Price Index: Methodology Note',
    issuer: 'AeroQuant (prototype)',
    docType: 'methodology',
    publishedOn: '2026-09-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Section 4 - Published estimator',
    text:
      'The published series is a Rolling Year GEKS index with a Fixed Effects Window Splice, estimated over a thirteen-month window by a Time Product Dummy regression and extended by a mean splice. The estimator is transitive within the window and previously published values are never revised. A fixed-panel Jevons index, a Carli index, a Dutot index, the median and the arithmetic mean of observed fares are computed on the identical cube and published alongside as comparators.',
    reference: 'AeroQuant Methodology Note 1/2026, s. 4',
  },
  {
    id: 'aq-meth-03',
    docId: 'AQ/METH/2026/01',
    title: 'AeroQuant Airfare Price Index: Methodology Note',
    issuer: 'AeroQuant (prototype)',
    docType: 'methodology',
    publishedOn: '2026-09-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Section 7 - Estimation of sampling error',
    text:
      'Confidence intervals are estimated by a block bootstrap resampling whole routes with replacement. Quotes within a route share a carrier mix, a capacity schedule and a demand shock and are therefore not independent; an observation-level bootstrap would understate the interval substantially. A consequence is that the interval width is governed by the number of routes in the panel rather than by the number of quotes collected within them.',
    reference: 'AeroQuant Methodology Note 1/2026, s. 7',
  },
  {
    id: 'aq-meth-04',
    docId: 'AQ/METH/2026/01',
    title: 'AeroQuant Airfare Price Index: Methodology Note',
    issuer: 'AeroQuant (prototype)',
    docType: 'methodology',
    publishedOn: '2026-09-01',
    supersededOn: null,
    supersededBy: null,
    section: 'Section 9 - Quality adjustment',
    text:
      'A time-dummy hedonic regression of log fare on a natural cubic spline in booking horizon, cabin, number of stops, refundability, checked baggage allowance and carrier, route and month dummies is estimated alongside the multilateral index. The month coefficients provide a constant-quality series and the characteristic coefficients provide implicit prices for the characteristics, including the shape of the fare-horizon curve.',
    reference: 'AeroQuant Methodology Note 1/2026, s. 9',
  },
]

export const DOCUMENTS = [...new Set(CORPUS.map((c) => c.docId))]
