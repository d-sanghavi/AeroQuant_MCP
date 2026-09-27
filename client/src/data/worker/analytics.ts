/**
 * Analytics handlers that sit behind the worker.
 *
 * Kept out of data.worker.ts so the message dispatch stays readable, and so each of
 * these can be tested directly without a worker harness.
 */

import { AIRLINES } from '../master/airlines'
import {
  CALENDAR,
  COLLECTION_DAYS,
  PERIODS,
  PERIOD_INDEX,
} from '../master/calendar'
import { HORIZONS, ROUTES, horizonBand } from '../master/routes'
import { FARE_SOURCES } from '../master/sources'
import { CABINS, FAMILIES, type Dataset } from '../generate/dgp'
import { EVENTS } from '../generate/events'
import {
  ATF_NATIONAL,
  BRENT,
  CPI_COMBINED,
  EXT_INDEX,
  USDINR,
} from '../generate/economics'
import { buildCube, type CubeFilter } from '../cube'
import { computeIndices } from '@/lib/quant/pipeline'
import { lstsq } from '@/lib/linalg/qr'
import { fromRows, zeros } from '@/lib/linalg/matrix'
import { corrFromCov } from '@/lib/linalg/eigen'
import {
  cornishFisherVaR,
  efficientFrontier,
  ledoitWolf,
  monteCarloBudget,
} from '@/lib/quant/risk'
import { adf, benjaminiHochberg, grangerF } from '@/lib/quant/tests'
import { logReturns, stl } from '@/lib/quant/timeseries'
import { quantile } from '@/lib/quant/elementary'
import { mulberry32 } from '@/lib/rng'
import type {
  AnomalyDto,
  AnomalyResultDto,
  AttributionDto,
  BudgetDto,
  BudgetRequest,
  PivotDimension,
  PivotDto,
  PivotSpec,
  PortfolioDto,
  RouteDetailDto,
} from './protocol'
import { normalTwoSided } from '@/lib/quant/distributions'

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

const COMPONENT_LABELS: { key: keyof Omit<Dataset['components'][number], 'period'>; label: string }[] = [
  { key: 'fuel', label: 'Fuel (ATF pass-through)' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'demand', label: 'Demand shock' },
  { key: 'seasonal', label: 'Seasonal and day-of-week' },
  { key: 'termStructure', label: 'Booking-horizon mix and curve shape' },
  { key: 'event', label: 'Disruption events' },
  { key: 'trend', label: 'Underlying trend' },
  { key: 'residual', label: 'Unexplained residual' },
]

export function computeAttribution(
  ds: Dataset,
  filter: CubeFilter,
  period?: string,
): AttributionDto {
  const from = filter.periodFrom ?? 0
  const to = filter.periodTo ?? PERIODS.length - 1
  const periods = PERIODS.slice(from, to + 1)
  const comps = ds.components.slice(from, to + 1)

  const selected = period && periods.includes(period) ? period : periods[periods.length - 1]!
  const si = periods.indexOf(selected)

  const components = COMPONENT_LABELS.map(({ key, label }) => ({
    key: key as string,
    label,
    // Expressed as percent change relative to the first period in view, because a
    // log contribution in absolute terms means nothing to a reader.
    values: comps.map((c) => (Math.exp(c[key] - comps[0]![key]) - 1) * 100),
  }))

  // The waterfall decomposes the month-on-month move of the selected period.
  const prev = si > 0 ? comps[si - 1]! : comps[si]!
  const cur = comps[si]!
  const waterfall = COMPONENT_LABELS.map(({ key, label }) => ({
    key: key as string,
    label,
    value: (Math.exp(cur[key] - prev[key]) - 1) * 100,
  }))

  // --- the statistics the banner is about ---------------------------------
  const extFrom = EXT_INDEX.get(PERIODS[from]!)!
  const extTo = EXT_INDEX.get(PERIODS[to]!)!
  const slice = (xs: readonly number[]): number[] => xs.slice(extFrom, extTo + 1)

  const bundle = computeIndices(ds, filter)
  const indexSeries = bundle.national.filter(Number.isFinite)
  const atf = slice(ATF_NATIONAL.values)
  const brent = slice(BRENT.values)
  const fx = slice(USDINR.values)
  const cpi = slice(CPI_COMBINED.values)

  const tests: { label: string; series: number[] }[] = [
    { label: 'APIx national index', series: indexSeries },
    { label: 'ATF price', series: atf },
    { label: 'Brent crude', series: brent },
    { label: 'USD/INR', series: fx },
  ]

  const adfTests = tests
    .map(({ label, series }) => {
      if (series.length < 12) return null
      const r = adf(series, 1)
      return { ...r, test: `${r.test} - ${label}` }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const granger: AttributionDto['granger'] = []
  const dIndex = logReturns(indexSeries)
  const dAtf = logReturns(atf)
  if (dIndex.length >= 14 && dAtf.length >= 14) {
    const n = Math.min(dIndex.length, dAtf.length)
    const a = dIndex.slice(dIndex.length - n)
    const b = dAtf.slice(dAtf.length - n)
    const fwd = grangerF(a, b, 2)
    const rev = grangerF(b, a, 2)
    granger.push(
      { ...fwd, test: 'Granger F: ATF -> APIx (2 lags)' },
      { ...rev, test: 'Granger F: APIx -> ATF (2 lags)' },
    )
  }

  return {
    periods,
    components,
    waterfall,
    selectedPeriod: selected,
    adf: adfTests,
    granger,
    exogenous: [
      { id: 'atf', label: 'ATF price', unit: 'INR/kL', periods, values: atf },
      { id: 'brent', label: 'Brent crude', unit: 'USD/bbl', periods, values: brent },
      { id: 'usdinr', label: 'USD/INR', unit: 'INR per USD', periods, values: fx },
      { id: 'cpi', label: 'CPI (Combined)', unit: '2012=100', periods, values: cpi },
    ],
  }
}

// ---------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------

function describeAnomaly(routeId: string, period: string, z: number): string {
  const r = ROUTES.find((x) => x.id === routeId)
  const direction = z > 0 ? 'above' : 'below'
  const magnitude = Math.abs(z) > 4 ? 'far' : Math.abs(z) > 3 ? 'well' : 'moderately'

  // Was there a disruption on this route in that month?
  const hit = EVENTS.find(
    (e) =>
      e.startDate.slice(0, 7) === period &&
      r !== undefined &&
      (e.airports.includes(r.origin) || e.airports.includes(r.destination)),
  )
  const festival = CALENDAR.find((c) => c.period === period && c.festivalPressure > 0.15)

  const parts = [
    `Month-on-month move ${magnitude} ${direction} this route's own historical distribution (z = ${z.toFixed(2)}).`,
  ]
  if (hit) {
    parts.push(
      `A disruption overlaps this month: ${hit.label} at ${hit.airports.join(', ')}, severity ${hit.severity}/5.`,
    )
  }
  if (festival?.festival) {
    parts.push(`${festival.festival} falls in this month, which lifts leisure demand.`)
  }
  if (!hit && !festival) {
    parts.push('No disruption or festival on record for this month - worth a manual look.')
  }
  return parts.join(' ')
}

export function computeAnomalies(ds: Dataset, filter: CubeFilter, q = 0.05): AnomalyResultDto {
  const bundle = computeIndices(ds, filter)
  const periods = bundle.periods

  interface Candidate {
    routeId: string
    routeLabel: string
    period: string
    observed: number
    expected: number
    z: number
    p: number
  }
  const candidates: Candidate[] = []

  for (const s of bundle.routeStrata) {
    const rets = logReturns(s.values).filter(Number.isFinite)
    if (rets.length < 8) continue
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const sd = Math.sqrt(
      rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1),
    )
    if (!(sd > 0)) continue

    for (let t = 1; t < s.values.length; t++) {
      const a = s.values[t - 1]!
      const b = s.values[t]!
      if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) continue
      const r = Math.log(b / a)
      // Leave-one-out standardisation: an outlier should not be allowed to inflate
      // the scale it is judged against.
      const n = rets.length
      const looMean = (mean * n - r) / (n - 1)
      const looVar = Math.max(
        1e-12,
        (rets.reduce((acc, x) => acc + (x - mean) ** 2, 0) - (r - mean) ** 2) / Math.max(1, n - 2),
      )
      const z = (r - looMean) / Math.sqrt(looVar)
      candidates.push({
        routeId: s.key,
        routeLabel: s.label,
        period: periods[t]!,
        observed: (Math.exp(r) - 1) * 100,
        expected: (Math.exp(looMean) - 1) * 100,
        z,
        p: normalTwoSided(z),
      })
    }
  }

  const fdr = benjaminiHochberg(
    candidates.map((c) => c.p),
    q,
  )
  const rejectedSet = new Set(fdr.rejected)

  const anomalies: AnomalyDto[] = candidates
    .map((c, i) => ({
      id: `${c.routeId}-${c.period}`,
      routeId: c.routeId,
      routeLabel: c.routeLabel,
      period: c.period,
      observed: c.observed,
      expected: c.expected,
      zScore: c.z,
      pValue: c.p,
      adjustedP: fdr.adjusted[i]!,
      severity: (Math.abs(c.z) > 4 ? 'high' : Math.abs(c.z) > 3 ? 'medium' : 'low') as
        | 'high'
        | 'medium'
        | 'low',
      explanation: describeAnomaly(c.routeId, c.period, c.z),
      flaggedRaw: c.p < 0.05,
      flaggedFdr: rejectedSet.has(i),
    }))
    .filter((a) => a.flaggedRaw)
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))

  return {
    anomalies: anomalies.slice(0, 120),
    nTested: candidates.length,
    nRawFlagged: anomalies.length,
    nFdrFlagged: anomalies.filter((a) => a.flaggedFdr).length,
    q,
  }
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

/** Average-linkage hierarchical clustering, returning a leaf order for the heatmap. */
function clusterOrder(corr: number[][]): number[] {
  const n = corr.length
  let clusters: number[][] = Array.from({ length: n }, (_, i) => [i])
  const dist = (a: number[], b: number[]): number => {
    let s = 0
    for (const i of a) for (const j of b) s += 1 - corr[i]![j]!
    return s / (a.length * b.length)
  }
  while (clusters.length > 1) {
    let bi = 0
    let bj = 1
    let best = Infinity
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = dist(clusters[i]!, clusters[j]!)
        if (d < best) {
          best = d
          bi = i
          bj = j
        }
      }
    }
    const merged = [...clusters[bi]!, ...clusters[bj]!]
    clusters = clusters.filter((_, k) => k !== bi && k !== bj)
    clusters.push(merged)
  }
  return clusters[0]!
}

export function computePortfolio(ds: Dataset, filter: CubeFilter): PortfolioDto {
  const bundle = computeIndices(ds, filter)
  const from = filter.periodFrom ?? 0
  const to = filter.periodTo ?? PERIODS.length - 1

  // Routes with a complete return history - the covariance needs a balanced panel.
  const usable = bundle.routeStrata.filter((s) => s.values.every(Number.isFinite))
  const returns = usable.map((s) => logReturns(s.values))
  const T = returns[0]?.length ?? 0
  if (usable.length < 3 || T < 4) {
    throw new Error('Not enough complete route histories in this selection for a portfolio view.')
  }

  const R = zeros(T, usable.length)
  for (let j = 0; j < usable.length; j++) {
    for (let t = 0; t < T; t++) R.data[t * usable.length + j] = returns[j]![t]!
  }

  const shrink = ledoitWolf(R)
  const corr = corrFromCov(shrink.cov)
  const correlation: number[][] = []
  for (let i = 0; i < usable.length; i++) {
    const row: number[] = []
    for (let j = 0; j < usable.length; j++) row.push(corr.data[i * usable.length + j]!)
    correlation.push(row)
  }

  // --- factor exposures ----------------------------------------------------
  const market = logReturns(bundle.national.filter(Number.isFinite))
  const extFrom = EXT_INDEX.get(PERIODS[from]!)!
  const extTo = EXT_INDEX.get(PERIODS[to]!)!
  const fuel = logReturns(ATF_NATIONAL.values.slice(extFrom, extTo + 1))

  const factors = usable.map((s, j) => {
    const ri = ROUTES.findIndex((r) => r.id === s.key)
    const nCal = CALENDAR.length
    // Monthly capacity change for this route, from the generator's seat path.
    const seatsByPeriod = PERIODS.slice(from, to + 1).map((p) => {
      let sum = 0
      let n = 0
      for (let d = 0; d < COLLECTION_DAYS.length; d++) {
        if (COLLECTION_DAYS[d]!.period !== p) continue
        sum += ds.routeSeats[ri * nCal + d]!
        n++
      }
      return n > 0 ? sum / n : NaN
    })
    const capacity = logReturns(seatsByPeriod)

    const rows: number[][] = []
    const target: number[] = []
    const n = Math.min(returns[j]!.length, market.length, fuel.length, capacity.length)
    for (let t = 0; t < n; t++) {
      const y = returns[j]![t]!
      const m = market[t]!
      const f = fuel[t]!
      const c = capacity[t]!
      if (![y, m, f, c].every(Number.isFinite)) continue
      rows.push([1, m, f, c])
      target.push(y)
    }
    if (rows.length < 6) {
      return {
        routeId: s.key,
        routeLabel: s.label,
        marketBeta: NaN,
        fuelBeta: NaN,
        capacityBeta: NaN,
        r2: NaN,
        idioVol: NaN,
      }
    }
    const fit = lstsq(fromRows(rows), Float64Array.from(target))
    return {
      routeId: s.key,
      routeLabel: s.label,
      marketBeta: fit.beta[1]!,
      fuelBeta: fit.beta[2]!,
      capacityBeta: fit.beta[3]!,
      r2: fit.r2,
      // Annualised idiosyncratic volatility.
      idioVol: fit.sigma * Math.sqrt(12),
    }
  })

  // --- frontier ------------------------------------------------------------
  // Sign convention: the "return" of a route is the SAVING, i.e. minus its expected
  // fare growth. A travel budget wants low expected cost and low variance, which is
  // the same optimisation with the sign flipped once, stated here rather than left
  // for the reader to infer from an axis label.
  const mu = returns.map((r) => {
    const m = r.reduce((a, b) => a + b, 0) / r.length
    return -m * 12
  })
  const annualCov = zeros(usable.length, usable.length)
  for (let i = 0; i < annualCov.data.length; i++) annualCov.data[i] = shrink.cov.data[i]! * 12

  const frontier = efficientFrontier(mu, annualCov, 20, 0.25)

  // --- VaR on the national index ------------------------------------------
  const v = cornishFisherVaR(market, 0.05)

  return {
    routeIds: usable.map((s) => s.key),
    routeLabels: usable.map((s) => s.label),
    correlation,
    clusterOrder: clusterOrder(correlation),
    shrinkageIntensity: shrink.intensity,
    shrinkageNote: shrink.note,
    factors,
    frontier,
    expectedReturns: mu,
    varResult: {
      alpha: v.alpha,
      var: v.var,
      gaussianVar: v.gaussianVar,
      historicalVar: v.historicalVar,
      cvar: v.cvar,
      note: v.note,
      skewness: v.moments.skewness,
      excessKurtosis: v.moments.excessKurtosis,
    },
  }
}

// ---------------------------------------------------------------------------
// OLAP pivot
// ---------------------------------------------------------------------------

function dimensionValue(ds: Dataset, i: number, dim: PivotDimension): string {
  const { panel } = ds
  switch (dim) {
    case 'period':
      return PERIODS[panel.periodIdx[i]!]!
    case 'originState':
      return ROUTES[panel.routeIdx[i]!]!.originAirport.state
    case 'destinationState':
      return ROUTES[panel.routeIdx[i]!]!.destinationAirport.state
    case 'originRegion':
      return ROUTES[panel.routeIdx[i]!]!.originRegion
    case 'airline':
      return AIRLINES[panel.airlineIdx[i]!]!.code
    case 'fareFamily':
      return FAMILIES[panel.familyIdx[i]!]!
    case 'horizonBand':
      return horizonBand(HORIZONS[panel.horizonIdx[i]!]!)
    case 'season':
      return COLLECTION_DAYS[panel.collectDay[i]!]!.season
    case 'cabin':
      return CABINS[panel.cabinIdx[i]!]!
    case 'source':
      return FARE_SOURCES[panel.sourceIdx[i]!]!.id
  }
}

export function computePivot(ds: Dataset, spec: PivotSpec): PivotDto {
  const { panel } = ds
  const f = spec.filter
  const from = f.periodFrom ?? 0
  const to = f.periodTo ?? PERIODS.length - 1

  const sourceAllowed = new Uint8Array(FARE_SOURCES.length)
  for (let i = 0; i < FARE_SOURCES.length; i++) {
    const s = FARE_SOURCES[i]!
    sourceAllowed[i] = s.enabled && !(f.disableScraped && s.isScraped) ? 1 : 0
  }
  const routeAllowed = new Uint8Array(ROUTES.length).fill(1)
  if (f.routeIds && f.routeIds.length > 0) {
    routeAllowed.fill(0)
    const want = new Set(f.routeIds)
    for (let i = 0; i < ROUTES.length; i++) if (want.has(ROUTES[i]!.id)) routeAllowed[i] = 1
  }

  const cells = new Map<string, number[]>()
  const rowSet = new Set<string>()
  const colSet = new Set<string>()

  const keyOf = (i: number, dims: PivotDimension[]): string =>
    dims.length === 0 ? 'All' : dims.map((d) => dimensionValue(ds, i, d)).join(' / ')

  for (let i = 0; i < panel.n; i++) {
    const t = panel.periodIdx[i]!
    if (t < from || t > to) continue
    if (!routeAllowed[panel.routeIdx[i]!]) continue
    if (!sourceAllowed[panel.sourceIdx[i]!]) continue

    const rk = keyOf(i, spec.rows)
    const ck = keyOf(i, spec.cols)
    rowSet.add(rk)
    colSet.add(ck)
    const key = `${rk}\u0000${ck}`
    const bucket = cells.get(key)
    if (bucket) bucket.push(panel.fare[i]!)
    else cells.set(key, [panel.fare[i]!])
  }

  const rowKeys = [...rowSet].sort()
  const colKeys = [...colSet].sort()

  const measureOf = (xs: number[] | undefined): number | null => {
    if (!xs || xs.length === 0) return null
    switch (spec.measure) {
      case 'count':
        return xs.length
      case 'mean':
        return xs.reduce((a, b) => a + b, 0) / xs.length
      case 'geomean': {
        let s = 0
        for (const x of xs) s += Math.log(x)
        return Math.exp(s / xs.length)
      }
      default: {
        const sorted = Float64Array.from(xs).sort()
        const q = spec.measure === 'median' ? 0.5 : spec.measure === 'p10' ? 0.1 : 0.9
        return quantile(sorted, q)
      }
    }
  }

  const values: (number | null)[][] = []
  const counts: number[][] = []
  for (const rk of rowKeys) {
    const vrow: (number | null)[] = []
    const crow: number[] = []
    for (const ck of colKeys) {
      const xs = cells.get(`${rk}\u0000${ck}`)
      vrow.push(measureOf(xs))
      crow.push(xs?.length ?? 0)
    }
    values.push(vrow)
    counts.push(crow)
  }

  const rowTotals = rowKeys.map((rk) => {
    const all: number[] = []
    for (const ck of colKeys) {
      const xs = cells.get(`${rk}\u0000${ck}`)
      if (xs) all.push(...xs)
    }
    return measureOf(all)
  })
  const colTotals = colKeys.map((ck) => {
    const all: number[] = []
    for (const rk of rowKeys) {
      const xs = cells.get(`${rk}\u0000${ck}`)
      if (xs) all.push(...xs)
    }
    return measureOf(all)
  })
  const everything: number[] = []
  for (const xs of cells.values()) everything.push(...xs)

  return {
    rowKeys,
    colKeys,
    values,
    counts,
    measure: spec.measure,
    rowTotals,
    colTotals,
    grandTotal: measureOf(everything),
    nCells: rowKeys.length * colKeys.length,
  }
}

// ---------------------------------------------------------------------------
// Route detail
// ---------------------------------------------------------------------------

export function computeRouteDetail(
  ds: Dataset,
  routeId: string,
  filter: CubeFilter,
): RouteDetailDto {
  const route = ROUTES.find((r) => r.id === routeId)
  if (!route) throw new Error(`Unknown route ${routeId}`)
  const ri = ROUTES.indexOf(route)

  const bundle = computeIndices(ds, { ...filter, routeIds: [routeId] })
  const stratum = bundle.routeStrata.find((s) => s.key === routeId)
  const index = stratum?.values ?? bundle.national

  // Fare distribution by horizon, from the filtered panel.
  const cube = buildCube(ds, { ...filter, routeIds: [routeId] })
  const from = filter.periodFrom ?? 0
  const to = filter.periodTo ?? PERIODS.length - 1

  const byHorizon: number[][] = HORIZONS.map(() => [])
  const { panel } = ds
  const sourceAllowed = FARE_SOURCES.map((s) => s.enabled && !(filter.disableScraped && s.isScraped))
  for (let i = 0; i < panel.n; i++) {
    if (panel.routeIdx[i]! !== ri) continue
    const t = panel.periodIdx[i]!
    if (t < from || t > to) continue
    if (!sourceAllowed[panel.sourceIdx[i]!]) continue
    byHorizon[panel.horizonIdx[i]!]!.push(panel.fare[i]!)
  }

  const fareByHorizon = HORIZONS.map((h, k) => {
    const xs = byHorizon[k]!
    const sorted = Float64Array.from(xs).sort()
    // Thin the sample for the violin - 20,000 points would not render and would not
    // show anything a 600-point sample does not.
    const stride = Math.max(1, Math.floor(xs.length / 600))
    const thinned: number[] = []
    for (let i = 0; i < sorted.length; i += stride) thinned.push(sorted[i]!)
    return {
      horizon: h,
      values: thinned,
      median: quantile(sorted, 0.5),
      p10: quantile(sorted, 0.1),
      p90: quantile(sorted, 0.9),
    }
  })

  const nCal = CALENDAR.length
  const capacity = COLLECTION_DAYS.filter((_, d) => d % 7 === 0).map((c) => ({
    date: c.date,
    seats: ds.routeSeats[ri * nCal + c.t]!,
  }))

  const events = EVENTS.filter(
    (e) => e.airports.includes(route.origin) || e.airports.includes(route.destination),
  )
    .slice(0, 40)
    .map((e) => ({ id: e.id, label: e.label, startDate: e.startDate, severity: e.severity }))

  return {
    routeId,
    index,
    periods: [...bundle.periods],
    fareByHorizon,
    capacity,
    events,
    forecast: forecastRoute(index, bundle.periods),
    railHours: route.railHours,
    railComparison: route.hasRailSubstitute
      ? {
          airMeanFare: cube.periodStats[cube.periodStats.length - 1]?.meanFare ?? NaN,
          // AC 2-tier fare scales roughly with distance at a far lower rate per km.
          railFareEstimate: Math.round(560 + route.distanceKm * 1.95),
          airHours: route.distanceKm / 700 + 1.6,
        }
      : null,
  }
}

/**
 * Six-month-ahead forecast with SPLIT-CONFORMAL intervals.
 *
 * The point forecast is an STL trend extrapolation plus last year's seasonal factor -
 * deliberately simple, because the interval is what matters here. The interval is not
 * a model-based standard error: it is the empirical quantile of this series' own past
 * h-step-ahead errors. That is distribution-free and honest about the fact that the
 * point model is wrong; a Gaussian interval from a model this simple would be far too
 * narrow and would be lying.
 */
function forecastRoute(
  index: readonly number[],
  periods: readonly string[],
): RouteDetailDto['forecast'] {
  const clean = index.filter(Number.isFinite)
  if (clean.length < 14) return []
  const logIndex = clean.map(Math.log)
  const d = stl(logIndex, 12)

  const n = logIndex.length
  const slope =
    (d.trend[n - 1]! - d.trend[Math.max(0, n - 7)]!) / Math.min(6, n - 1)

  // Backtest residuals at each horizon, to calibrate the bands.
  const errorsByH: number[][] = Array.from({ length: 6 }, () => [])
  for (let origin = 12; origin < n - 1; origin++) {
    const localSlope =
      (d.trend[origin]! - d.trend[Math.max(0, origin - 6)]!) / Math.min(6, origin)
    for (let h = 1; h <= 6 && origin + h < n; h++) {
      const seasonal = d.seasonal[origin + h - 12] ?? 0
      const pred = d.trend[origin]! + localSlope * h + seasonal
      errorsByH[h - 1]!.push(logIndex[origin + h]! - pred)
    }
  }

  const lastPeriod = periods[periods.length - 1]!
  const [y0, m0] = lastPeriod.split('-').map(Number)

  const out: RouteDetailDto['forecast'] = []
  for (let h = 1; h <= 6; h++) {
    let mm = m0! + h
    let yy = y0!
    while (mm > 12) {
      mm -= 12
      yy++
    }
    const seasonal = d.seasonal[n + h - 1 - 12] ?? 0
    const pred = d.trend[n - 1]! + slope * h + seasonal
    const errs = Float64Array.from(errorsByH[h - 1]!).sort()
    const q = (p: number): number => (errs.length > 0 ? quantile(errs, p) : 0)
    out.push({
      period: `${yy}-${String(mm).padStart(2, '0')}`,
      median: Math.exp(pred + q(0.5)),
      lower80: Math.exp(pred + q(0.1)),
      upper80: Math.exp(pred + q(0.9)),
      lower95: Math.exp(pred + q(0.025)),
      upper95: Math.exp(pred + q(0.975)),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Budget simulator
// ---------------------------------------------------------------------------

export function simulateBudget(
  ds: Dataset,
  request: BudgetRequest,
  filter: CubeFilter,
): BudgetDto {
  const bundle = computeIndices(ds, filter)
  const stats = bundle.cube.periodStats

  const legs: { routeIdx: number; basePrice: number; count: number }[] = []
  const legDetail: BudgetDto['legDetail'] = []
  const routeReturns: number[][] = ROUTES.map(() => [])

  for (let i = 0; i < bundle.routeStrata.length; i++) {
    routeReturns[i] = logReturns(bundle.routeStrata[i]!.values).filter(Number.isFinite)
  }

  for (const leg of request.legs) {
    const ri = ROUTES.findIndex((r) => r.id === leg.routeId)
    if (ri < 0 || leg.trips <= 0) continue
    const route = ROUTES[ri]!
    // Base fare = the route's most recent mean, from the filtered panel.
    const cube = buildCube(ds, { ...filter, routeIds: [leg.routeId] })
    const last = cube.periodStats[cube.periodStats.length - 1]
    const basePrice = last && Number.isFinite(last.meanFare) ? last.meanFare : stats[stats.length - 1]!.meanFare
    legs.push({ routeIdx: ri, basePrice, count: leg.trips })
    legDetail.push({
      routeId: leg.routeId,
      label: `${route.origin}-${route.destination}`,
      trips: leg.trips,
      meanFare: basePrice,
      contribution: basePrice * leg.trips,
    })
  }

  if (legs.length === 0) {
    throw new Error('Add at least one route to the travel plan.')
  }

  const rng = mulberry32(ds.seed ^ 0x5eed)
  const mc = monteCarloBudget(legs, routeReturns, Math.max(1000, request.draws), rng)

  return {
    mean: mc.mean,
    p50: mc.p50,
    p80: mc.p80,
    p95: mc.p95,
    var95: mc.var95,
    cvar95: mc.cvar95,
    histogram: mc.histogram,
    legDetail,
  }
}

export { PERIOD_INDEX }
