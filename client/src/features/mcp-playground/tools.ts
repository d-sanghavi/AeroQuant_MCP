import { dataWorker } from '@/data/workerClient'
import type { CubeFilter } from '@/data/cube'
import { ROUTES } from '@/data/master/routes'
import { SOURCES } from '@/data/master/sources'
import { PERIODS } from '@/data/master/calendar'

/**
 * The sixteen tools an agent would call.
 *
 * Every one of them routes into the same worker the charts route into. That is the
 * whole design constraint and it is not a detail: if the MCP layer had its own
 * computation path, an agent could state a number in a sentence that no screen in the
 * product agrees with, and the first time that happened in front of a regulator the
 * entire terminal would be worthless. So `aq.index.get` calls `dataWorker.indices`,
 * which is the function the Index Terminal calls, and there is no second
 * implementation to drift from the first.
 *
 * The schemas here are the ones a real MCP server would advertise. They are written
 * out rather than inferred so that the playground can show the reader exactly what an
 * agent sees before it decides which tool to call.
 */

export type ParamType = 'string' | 'number' | 'integer' | 'boolean' | 'enum'

export interface ParamDef {
  readonly name: string
  readonly type: ParamType
  readonly description: string
  readonly required: boolean
  readonly default?: string | number | boolean
  readonly options?: readonly string[]
}

export type ToolCategory = 'index' | 'route' | 'structure' | 'analysis' | 'governance'

export interface ToolDef {
  readonly name: string
  readonly title: string
  readonly category: ToolCategory
  readonly description: string
  readonly params: readonly ParamDef[]
  /** What a reader should notice about the answer, pulled out of the payload. */
  readonly highlights: (result: unknown) => { label: string; value: string }[]
  readonly run: (args: Record<string, unknown>, filter: CubeFilter) => Promise<unknown>
}

const ROUTE_IDS = ROUTES.map((r) => r.id)

function num(args: Record<string, unknown>, key: string, fallback: number): number {
  const v = Number(args[key])
  return Number.isFinite(v) ? v : fallback
}

function str(args: Record<string, unknown>, key: string, fallback: string): string {
  const v = args[key]
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

/** Narrow the shared filter with any window the caller supplied. */
function windowed(args: Record<string, unknown>, filter: CubeFilter): CubeFilter {
  const from = args.period_from
  const to = args.period_to
  return {
    ...filter,
    periodFrom: typeof from === 'string' ? Math.max(0, PERIODS.indexOf(from)) : filter.periodFrom,
    periodTo: typeof to === 'string' && PERIODS.indexOf(to) >= 0 ? PERIODS.indexOf(to) : filter.periodTo,
  }
}

const WINDOW_PARAMS: ParamDef[] = [
  {
    name: 'period_from',
    type: 'string',
    description: 'First month, YYYY-MM. Defaults to the window selected in the terminal.',
    required: false,
  },
  {
    name: 'period_to',
    type: 'string',
    description: 'Last month, YYYY-MM. Defaults to the window selected in the terminal.',
    required: false,
  },
]

function pct(x: number | undefined): string {
  return typeof x === 'number' && Number.isFinite(x) ? `${x.toFixed(2)}%` : '--'
}

export const TOOLS: readonly ToolDef[] = [
  {
    name: 'aq.index.get',
    title: 'Get the published index',
    category: 'index',
    description:
      'Return the national constant-quality airfare price index (APIx) for a window, with its confidence band and the seasonally adjusted series.',
    params: WINDOW_PARAMS,
    run: async (args, filter) => {
      const d = await dataWorker.indices(windowed(args, filter))
      return {
        periods: d.periods,
        index: d.national.map((v) => Number(v.toFixed(3))),
        seasonally_adjusted: d.seasonallyAdjusted.map((v) => Number(v.toFixed(3))),
        confidence_95: {
          lower: d.confidence.lower.map((v) => Number(v.toFixed(3))),
          upper: d.confidence.upper.map((v) => Number(v.toFixed(3))),
          replicates: d.confidence.replicates,
          method: 'block bootstrap clustered on route',
        },
        average_yoy_pct: Number(d.avgYoyByMethod['rygeks-fews']?.toFixed(3)),
        estimator: 'RYGEKS-FEWS (Time Product Dummy, 13-month window, mean splice)',
        n_observations: d.nObservations,
        compute_ms: Number(d.computeMs.toFixed(1)),
      }
    },
    highlights: (r) => {
      const d = r as { index: number[]; average_yoy_pct: number; n_observations: number }
      return [
        { label: 'Latest level', value: (d.index.at(-1) ?? 0).toFixed(1) },
        { label: 'Average YoY', value: pct(d.average_yoy_pct) },
        { label: 'Observations', value: d.n_observations.toLocaleString('en-IN') },
      ]
    },
  },
  {
    name: 'aq.index.compare_methods',
    title: 'Compare index formulae',
    category: 'index',
    description:
      'Run six index formulae on the identical product cube and return the divergence between the naive mean and the published estimator, in percentage points.',
    params: WINDOW_PARAMS,
    run: async (args, filter) => {
      const d = await dataWorker.indices(windowed(args, filter))
      return {
        methods: d.methods.map((m) => ({
          method: m.method,
          label: m.label,
          is_comparator: m.isComparator,
          average_yoy_pct: Number((d.avgYoyByMethod[m.method] ?? NaN).toFixed(3)),
          final_level: Number((m.values.at(-1) ?? NaN).toFixed(3)),
        })),
        divergence_pp: Number(d.divergencePP.toFixed(3)),
        interpretation:
          'The naive mean of observed fares exceeds the constant-quality index because the ' +
          'composition of quotes shifted toward shorter booking horizons and more expensive ' +
          'cabins. That shift is not a price change.',
      }
    },
    highlights: (r) => {
      const d = r as { divergence_pp: number; methods: { method: string; average_yoy_pct: number }[] }
      const naive = d.methods.find((m) => m.method === 'naive-mean')
      const pub = d.methods.find((m) => m.method === 'rygeks-fews')
      return [
        { label: 'Naive mean', value: pct(naive?.average_yoy_pct) },
        { label: 'Published', value: pct(pub?.average_yoy_pct) },
        { label: 'Divergence', value: `${d.divergence_pp.toFixed(2)}pp` },
      ]
    },
  },
  {
    name: 'aq.index.vintages',
    title: 'Get prior vintages',
    category: 'index',
    description:
      'Return earlier published vintages of the national index, to show that previously published values were not revised.',
    params: WINDOW_PARAMS,
    run: async (args, filter) => {
      const d = await dataWorker.indices(windowed(args, filter))
      return {
        current: d.national.map((v) => Number(v.toFixed(3))),
        vintages: d.vintages.map((v) => ({
          release: v.label,
          values: v.values.map((x) => Number(x.toFixed(3))),
        })),
        revision_policy:
          'The window splice leaves previously published periods untouched. Differences between ' +
          'vintages arise only where a period had not yet been published.',
      }
    },
    highlights: (r) => {
      const d = r as { vintages: { release: string }[] }
      return [
        { label: 'Vintages', value: String(d.vintages.length) },
        { label: 'Revisions', value: 'none by construction' },
      ]
    },
  },
  {
    name: 'aq.route.detail',
    title: 'Get route detail',
    category: 'route',
    description:
      'Return one route’s constant-quality index, fare distribution by booking horizon, seat capacity, disruption events and rail-substitute comparison.',
    params: [
      {
        name: 'route_id',
        type: 'enum',
        description: 'Origin-destination pair, e.g. DEL-BOM.',
        required: true,
        default: 'DEL-BOM',
        options: ROUTE_IDS,
      },
      ...WINDOW_PARAMS,
    ],
    run: async (args, filter) => {
      const d = await dataWorker.routeDetail(str(args, 'route_id', 'DEL-BOM'), windowed(args, filter))
      return {
        route_id: d.routeId,
        periods: d.periods,
        index: d.index.map((v) => Number(v.toFixed(3))),
        fare_by_horizon: d.fareByHorizon.map((h) => ({
          horizon_days: h.horizon,
          median: Math.round(h.median),
          p10: Math.round(h.p10),
          p90: Math.round(h.p90),
        })),
        events: d.events,
        rail_hours: d.railHours,
        rail_comparison: d.railComparison,
      }
    },
    highlights: (r) => {
      const d = r as { route_id: string; index: number[]; events: unknown[] }
      return [
        { label: 'Route', value: d.route_id },
        { label: 'Latest level', value: (d.index.at(-1) ?? 0).toFixed(1) },
        { label: 'Events', value: String(d.events.length) },
      ]
    },
  },
  {
    name: 'aq.route.forecast',
    title: 'Forecast a route',
    category: 'route',
    description:
      'Return a forward projection of one route’s index with split-conformal prediction bands at 80% and 95%.',
    params: [
      {
        name: 'route_id',
        type: 'enum',
        description: 'Origin-destination pair.',
        required: true,
        default: 'DEL-BOM',
        options: ROUTE_IDS,
      },
    ],
    run: async (args, filter) => {
      const d = await dataWorker.routeDetail(str(args, 'route_id', 'DEL-BOM'), filter)
      return {
        route_id: d.routeId,
        forecast: d.forecast.map((f) => ({
          period: f.period,
          median: Number(f.median.toFixed(2)),
          interval_80: [Number(f.lower80.toFixed(2)), Number(f.upper80.toFixed(2))],
          interval_95: [Number(f.lower95.toFixed(2)), Number(f.upper95.toFixed(2))],
        })),
        method: 'split-conformal bands over a seasonal-naive-with-drift point forecast',
        caveat:
          'Coverage holds for the generated series only. This is not a forecast of any actual airfare.',
      }
    },
    highlights: (r) => {
      const d = r as { forecast: { period: string; median: number }[] }
      return [
        { label: 'Horizon', value: `${d.forecast.length} months` },
        { label: 'Next period', value: d.forecast[0]?.period ?? '--' },
      ]
    },
  },
  {
    name: 'aq.carrier.breakdown',
    title: 'Break the index down by carrier',
    category: 'route',
    description:
      'Return per-carrier observation share, fare levels, constant-quality and naive indices, and the matched-cell fare premium against competitors.',
    params: WINDOW_PARAMS,
    run: async (args, filter) => {
      const d = await dataWorker.carriers(windowed(args, filter))
      return {
        periods: d.periods,
        carriers: d.carriers.map((c) => ({
          code: c.code,
          name: c.name,
          business_model: c.model,
          observation_share: Number(c.observationShare.toFixed(4)),
          median_fare_inr: Math.round(c.medianFare),
          matched_premium_pct: Number(c.matchedPremiumPct.toFixed(2)),
          matched_cells: c.matchedCells,
          constant_quality_yoy_pct: Number(c.avgYoy.toFixed(3)),
          naive_yoy_pct: Number(c.naiveAvgYoy.toFixed(3)),
          routes_served: c.routesServed,
        })),
        note:
          'Shares are of observed quotes, not of seats flown. Matched premium compares only within ' +
          'the same route, cabin, fare family, booking horizon and month.',
      }
    },
    highlights: (r) => {
      const d = r as { carriers: { name: string; observation_share: number; matched_premium_pct: number }[] }
      const top = [...d.carriers].sort((a, b) => b.observation_share - a.observation_share)[0]
      return [
        { label: 'Carriers', value: String(d.carriers.length) },
        { label: 'Largest', value: `${top?.name} ${((top?.observation_share ?? 0) * 100).toFixed(1)}%` },
        { label: 'Its premium', value: pct(top?.matched_premium_pct) },
      ]
    },
  },
  {
    name: 'aq.term_structure.curve',
    title: 'Get the fare term structure',
    category: 'structure',
    description:
      'Return the fare-against-booking-horizon curve and its Nelson-Siegel parameters for the latest bucket and the window mean.',
    params: WINDOW_PARAMS,
    run: async (args, filter) => {
      const d = await dataWorker.termStructure(windowed(args, filter))
      return {
        horizons_days: d.horizons,
        mean_curve: d.meanCurve.map((v) => Number(v.toFixed(4))),
        latest_bucket: d.bucketStartDates.at(-1),
        nelson_siegel_latest: {
          beta0_level: Number(d.latestFit.beta0.toFixed(4)),
          beta1_slope: Number(d.latestFit.beta1.toFixed(4)),
          beta2_curvature: Number(d.latestFit.beta2.toFixed(4)),
          tau_days: Number(d.latestFit.tau.toFixed(2)),
          r2: Number(d.latestFit.r2.toFixed(4)),
        },
        bucket_days: d.bucketDays,
        n_buckets: d.curves.length,
      }
    },
    highlights: (r) => {
      const d = r as { nelson_siegel_latest: { tau_days: number; r2: number }; n_buckets: number }
      return [
        { label: 'Tau', value: `${d.nelson_siegel_latest.tau_days.toFixed(1)}d` },
        { label: 'Fit R²', value: d.nelson_siegel_latest.r2.toFixed(3) },
        { label: 'Buckets', value: String(d.n_buckets) },
      ]
    },
  },
  {
    name: 'aq.term_structure.pca',
    title: 'Decompose the curve',
    category: 'structure',
    description:
      'Return the principal components of the fare term structure with their loadings, variance explained and shape classification.',
    params: WINDOW_PARAMS,
    run: async (args, filter) => {
      const d = await dataWorker.termStructure(windowed(args, filter))
      return {
        components: d.components.map((c) => ({
          label: c.label,
          shape: c.shape,
          variance_explained: Number(c.varianceExplained.toFixed(4)),
          cumulative: Number(c.cumulativeVariance.toFixed(4)),
          loadings: c.loadings.map((l) => Number(l.toFixed(3))),
          rationale: c.rationale,
        })),
        horizons_days: d.horizons,
      }
    },
    highlights: (r) => {
      const d = r as { components: { shape: string; cumulative: number }[] }
      return [
        { label: 'Components', value: String(d.components.length) },
        {
          label: 'Cumulative',
          value: `${((d.components.at(-1)?.cumulative ?? 0) * 100).toFixed(1)}%`,
        },
        { label: 'Shapes', value: d.components.map((c) => c.shape).join(', ') },
      ]
    },
  },
  {
    name: 'aq.attribution.decompose',
    title: 'Decompose a monthly move',
    category: 'analysis',
    description:
      'Return the contribution of fuel, capacity, demand, seasonality, booking-horizon structure, disruption events, trend and residual to one month’s index change.',
    params: [
      {
        name: 'period',
        type: 'string',
        description: 'Month to decompose, YYYY-MM. Defaults to the last month in the window.',
        required: false,
      },
      ...WINDOW_PARAMS,
    ],
    run: async (args, filter) => {
      const period = typeof args.period === 'string' && args.period.length > 0 ? args.period : undefined
      const d = await dataWorker.attribution(windowed(args, filter), period)
      return {
        period: d.selectedPeriod,
        contributions_pct: Object.fromEntries(
          d.waterfall.map((w) => [w.key, Number(w.value.toFixed(4))]),
        ),
        net_change_pct: Number(d.waterfall.reduce((s, w) => s + w.value, 0).toFixed(4)),
        warning:
          'Estimated statistical association. Causal interpretation requires the identification ' +
          'assumption that ATF price is exogenous to domestic airfare formation over this window.',
      }
    },
    highlights: (r) => {
      const d = r as { period: string; net_change_pct: number; contributions_pct: Record<string, number> }
      const largest = Object.entries(d.contributions_pct).sort(
        (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
      )[0]
      return [
        { label: 'Month', value: d.period },
        { label: 'Net change', value: pct(d.net_change_pct) },
        { label: 'Largest channel', value: `${largest?.[0]} ${pct(largest?.[1])}` },
      ]
    },
  },
  {
    name: 'aq.attribution.tests',
    title: 'Run the association tests',
    category: 'analysis',
    description:
      'Return augmented Dickey-Fuller tests on each series and Granger F tests in both directions, each with its null, decision and assumption checks.',
    params: WINDOW_PARAMS,
    run: async (args, filter) => {
      const d = await dataWorker.attribution(windowed(args, filter))
      const shape = (t: (typeof d.adf)[number]) => ({
        test: t.test,
        statistic: Number(t.statistic.toFixed(4)),
        p_value: Number(t.pValue.toFixed(5)),
        n: t.n,
        null_hypothesis: t.nullHypothesis,
        decision: t.decision,
        alpha: t.alpha,
        assumptions_checked: t.assumptionsChecked,
        interpretation: t.interpretation,
      })
      return { stationarity: d.adf.map(shape), granger: d.granger.map(shape) }
    },
    highlights: (r) => {
      const d = r as { stationarity: { decision: string }[]; granger: { decision: string }[] }
      return [
        { label: 'ADF tests', value: String(d.stationarity.length) },
        { label: 'Granger tests', value: String(d.granger.length) },
        {
          label: 'Rejections',
          value: String(
            [...d.stationarity, ...d.granger].filter((t) => t.decision === 'reject').length,
          ),
        },
      ]
    },
  },
  {
    name: 'aq.anomaly.scan',
    title: 'Scan for anomalies',
    category: 'analysis',
    description:
      'Test every route-month against that route’s own leave-one-out return distribution and return the flags surviving Benjamini-Hochberg correction.',
    params: [
      {
        name: 'q',
        type: 'number',
        description: 'False discovery rate to control at.',
        required: false,
        default: 0.05,
      },
      ...WINDOW_PARAMS,
    ],
    run: async (args, filter) => {
      const q = num(args, 'q', 0.05)
      const d = await dataWorker.anomalies(windowed(args, filter), q)
      return {
        n_tested: d.nTested,
        n_flagged_uncorrected: d.nRawFlagged,
        n_flagged_after_fdr: d.nFdrFlagged,
        q: d.q,
        expected_false_positives_uncorrected: Number((d.nTested * q).toFixed(1)),
        anomalies: d.anomalies
          .filter((a) => a.flaggedFdr)
          .map((a) => ({
            route_id: a.routeId,
            period: a.period,
            observed_move_pct: Number(a.observed.toFixed(2)),
            typical_move_pct: Number(a.expected.toFixed(2)),
            z_score: Number(a.zScore.toFixed(3)),
            adjusted_p: Number(a.adjustedP.toFixed(5)),
            severity: a.severity,
            explanation: a.explanation,
          })),
      }
    },
    highlights: (r) => {
      const d = r as { n_tested: number; n_flagged_uncorrected: number; n_flagged_after_fdr: number }
      return [
        { label: 'Tested', value: d.n_tested.toLocaleString('en-IN') },
        { label: 'Uncorrected', value: String(d.n_flagged_uncorrected) },
        { label: 'After BH', value: String(d.n_flagged_after_fdr) },
      ]
    },
  },
  {
    name: 'aq.portfolio.risk',
    title: 'Get portfolio risk',
    category: 'analysis',
    description:
      'Return the route correlation structure, Ledoit-Wolf shrinkage intensity, factor exposures and Cornish-Fisher value at risk.',
    params: WINDOW_PARAMS,
    run: async (args, filter) => {
      const d = await dataWorker.portfolio(windowed(args, filter))
      return {
        n_routes: d.routeIds.length,
        shrinkage_intensity: Number(d.shrinkageIntensity.toFixed(4)),
        shrinkage_note: d.shrinkageNote,
        value_at_risk_95: {
          cornish_fisher: Number(d.varResult.var.toFixed(5)),
          gaussian: Number(d.varResult.gaussianVar.toFixed(5)),
          historical: Number(d.varResult.historicalVar.toFixed(5)),
          conditional: Number(d.varResult.cvar.toFixed(5)),
          skewness: Number(d.varResult.skewness.toFixed(4)),
          excess_kurtosis: Number(d.varResult.excessKurtosis.toFixed(4)),
          note: d.varResult.note,
        },
        factor_exposures: d.factors.slice(0, 10).map((f) => ({
          route_id: f.routeId,
          market_beta: Number(f.marketBeta.toFixed(3)),
          fuel_beta: Number(f.fuelBeta.toFixed(3)),
          capacity_beta: Number(f.capacityBeta.toFixed(3)),
          r2: Number(f.r2.toFixed(3)),
        })),
      }
    },
    highlights: (r) => {
      const d = r as { shrinkage_intensity: number; value_at_risk_95: { cornish_fisher: number; gaussian: number } }
      return [
        { label: 'VaR 95 (CF)', value: `${(d.value_at_risk_95.cornish_fisher * 100).toFixed(2)}%` },
        { label: 'VaR 95 (normal)', value: `${(d.value_at_risk_95.gaussian * 100).toFixed(2)}%` },
        { label: 'Shrinkage', value: d.shrinkage_intensity.toFixed(3) },
      ]
    },
  },
  {
    name: 'aq.budget.simulate',
    title: 'Simulate a travel budget',
    category: 'analysis',
    description:
      'Monte Carlo a travel programme with correlated route returns and return the median, p80, p95 and expected shortfall.',
    params: [
      {
        name: 'legs',
        type: 'string',
        description: 'Comma-separated ROUTE:TRIPS pairs, e.g. DEL-BOM:48,BOM-BLR:12.',
        required: true,
        default: 'DEL-BOM:48,BOM-BLR:12,DEL-BLR:12',
      },
      {
        name: 'draws',
        type: 'integer',
        description: 'Number of simulated years.',
        required: false,
        default: 20000,
      },
    ],
    run: async (args, filter) => {
      const legs = str(args, 'legs', 'DEL-BOM:48')
        .split(',')
        .map((part) => {
          const [routeId, trips] = part.trim().split(':')
          return { routeId: (routeId ?? '').trim(), trips: Number(trips ?? 1) || 1 }
        })
        .filter((l) => ROUTE_IDS.includes(l.routeId))
      if (legs.length === 0) throw new Error('No recognised route in `legs`.')
      const d = await dataWorker.budget({ legs, draws: num(args, 'draws', 20000) }, filter)
      return {
        median_inr: Math.round(d.p50),
        p80_inr: Math.round(d.p80),
        p95_inr: Math.round(d.p95),
        mean_inr: Math.round(d.mean),
        overrun_at_p95_inr: Math.round(d.var95),
        expected_shortfall_inr: Math.round(d.cvar95),
        legs: d.legDetail.map((l) => ({
          route_id: l.routeId,
          trips: l.trips,
          mean_fare_inr: Math.round(l.meanFare),
          at_current_prices_inr: Math.round(l.contribution),
        })),
        method:
          'Block bootstrap over historical months, applied jointly to every leg so routes move ' +
          'together, compounded along a twelve-month path.',
      }
    },
    highlights: (r) => {
      const d = r as { median_inr: number; p80_inr: number; p95_inr: number }
      const f = (x: number) => `₹${x.toLocaleString('en-IN')}`
      return [
        { label: 'Median', value: f(d.median_inr) },
        { label: 'p80', value: f(d.p80_inr) },
        { label: 'p95', value: f(d.p95_inr) },
      ]
    },
  },
  {
    name: 'aq.pivot.query',
    title: 'Cross-tabulate the panel',
    category: 'index',
    description:
      'Aggregate the observation panel on any two dimensions with a chosen measure. The same engine the OLAP Workbench uses.',
    params: [
      {
        name: 'rows',
        type: 'enum',
        description: 'Row dimension.',
        required: true,
        default: 'period',
        options: ['period', 'originState', 'destinationState', 'originRegion', 'airline', 'fareFamily', 'horizonBand', 'season', 'cabin', 'source'],
      },
      {
        name: 'cols',
        type: 'enum',
        description: 'Column dimension.',
        required: true,
        default: 'airline',
        options: ['period', 'originState', 'destinationState', 'originRegion', 'airline', 'fareFamily', 'horizonBand', 'season', 'cabin', 'source'],
      },
      {
        name: 'measure',
        type: 'enum',
        description: 'Aggregation applied to each cell.',
        required: true,
        default: 'geomean',
        options: ['geomean', 'median', 'mean', 'p10', 'p90', 'count'],
      },
    ],
    run: async (args, filter) => {
      const d = await dataWorker.pivot({
        rows: [str(args, 'rows', 'period') as never],
        cols: [str(args, 'cols', 'airline') as never],
        measure: str(args, 'measure', 'geomean') as never,
        filter,
      })
      return {
        measure: d.measure,
        row_keys: d.rowKeys,
        col_keys: d.colKeys,
        values: d.values.map((row) => row.map((v) => (v === null ? null : Number(v.toFixed(2))))),
        counts: d.counts,
        grand_total: d.grandTotal === null ? null : Number(d.grandTotal.toFixed(2)),
        n_cells: d.nCells,
      }
    },
    highlights: (r) => {
      const d = r as { row_keys: string[]; col_keys: string[]; n_cells: number }
      return [
        { label: 'Shape', value: `${d.row_keys.length} × ${d.col_keys.length}` },
        { label: 'Cells', value: String(d.n_cells) },
      ]
    },
  },
  {
    name: 'aq.compliance.sources',
    title: 'List the source registry',
    category: 'governance',
    description:
      'Return every collection source with its robots verdict, the terms-of-service clause the verdict rests on, the reviewer and the review date.',
    params: [
      {
        name: 'only_enabled',
        type: 'boolean',
        description: 'Omit sources that are not collected.',
        required: false,
        default: false,
      },
    ],
    run: async (args) => {
      const onlyEnabled = args.only_enabled === true || args.only_enabled === 'true'
      const rows = SOURCES.filter((s) => !onlyEnabled || s.enabled)
      return {
        sources: rows.map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          is_scraped: s.isScraped,
          robots: s.robots,
          terms_verdict: s.tos,
          terms_clause: s.tosClause,
          reviewed_on: s.reviewedOn,
          reviewed_by: s.reviewedBy,
          enabled: s.enabled,
          rate_limit_per_min: s.rateLimitPerMin,
          observation_share: s.observationShare,
        })),
        prohibited_and_not_collected: rows.filter((s) => s.tos === 'prohibited').map((s) => s.id),
      }
    },
    highlights: (r) => {
      const d = r as { sources: { enabled: boolean }[]; prohibited_and_not_collected: string[] }
      return [
        { label: 'Sources', value: String(d.sources.length) },
        { label: 'Enabled', value: String(d.sources.filter((s) => s.enabled).length) },
        { label: 'Prohibited', value: String(d.prohibited_and_not_collected.length) },
      ]
    },
  },
  {
    name: 'aq.provenance.observation',
    title: 'Trace one observation',
    category: 'governance',
    description:
      'Return a single collected quote with its reconstructed raw payload, SHA-256, parser version and ingestion run. The same object the Lineage drawer shows.',
    params: [
      {
        name: 'index',
        type: 'integer',
        description: 'Observation index within the panel.',
        required: true,
        default: 1000,
      },
    ],
    run: async (args) => {
      const d = await dataWorker.observation(Math.max(0, Math.floor(num(args, 'index', 1000))))
      return {
        index: d.index,
        route_id: d.routeId,
        airline: d.airline,
        booking_horizon_days: d.horizon,
        cabin: d.cabin,
        fare_family: d.fareFamily,
        source: d.source,
        collection_date: d.collectionDate,
        departure_date: d.departureDate,
        period: d.period,
        fare_inr: d.fare,
        sha256: d.sha256,
        parser_version: d.parserVersion,
        ingestion_run_id: d.ingestionRunId,
        raw_blob_uri: d.rawBlobUri,
        raw_payload: JSON.parse(d.rawPayload) as unknown,
      }
    },
    highlights: (r) => {
      const d = r as { route_id: string; fare_inr: number; sha256: string }
      return [
        { label: 'Route', value: d.route_id },
        { label: 'Fare', value: `₹${d.fare_inr.toLocaleString('en-IN')}` },
        { label: 'SHA-256', value: `${d.sha256.slice(0, 10)}…` },
      ]
    },
  },
]

export const TOOL_CATEGORIES: { id: ToolCategory; label: string }[] = [
  { id: 'index', label: 'Index' },
  { id: 'route', label: 'Routes and carriers' },
  { id: 'structure', label: 'Term structure' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'governance', label: 'Governance' },
]

/** Default argument object for a tool, from its schema. */
export function defaultArgs(tool: ToolDef): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of tool.params) {
    if (p.default !== undefined) out[p.name] = p.default
    else if (p.type === 'boolean') out[p.name] = false
    else out[p.name] = ''
  }
  return out
}

/** The JSON-RPC envelope an MCP client would actually put on the wire. */
export function jsonRpcRequest(
  tool: ToolDef,
  args: Record<string, unknown>,
  id: number,
): string {
  const params = Object.fromEntries(
    Object.entries(args).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  )
  return JSON.stringify(
    { jsonrpc: '2.0', id, method: 'tools/call', params: { name: tool.name, arguments: params } },
    null,
    2,
  )
}
