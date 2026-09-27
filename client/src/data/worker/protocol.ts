/**
 * Worker protocol.
 *
 * The dataset lives in the worker and never crosses to the main thread. Half a million
 * observations plus the product cube is ~30MB of typed arrays; structured-cloning that
 * on every filter change would stall the UI for longer than the computation it was
 * meant to avoid. So the worker owns the data and the main thread asks it questions.
 *
 * Everything crossing the boundary is a DTO: plain arrays and numbers, sized for the
 * screen that asked for it.
 */

import type { CubeFilter } from '../cube'
import type { PeriodStats } from '../cube'
import type { ChainDriftResult, ConfidenceBand, ImputationStats } from '@/lib/quant/diagnostics'
import type { IndexResult } from '@/lib/quant/types'
import type { PrincipalComponent } from '@/lib/quant/pca'
import type { NelsonSiegelFit } from '@/lib/quant/nelsonSiegel'
import type { TestResult } from '@/lib/quant/tests'
import type { HedonicCoefficient } from '@/lib/quant/hedonic'

export interface DatasetSummary {
  readonly seed: number
  readonly nObservations: number
  readonly nProducts: number
  readonly nRoutes: number
  readonly nAirports: number
  readonly nAirlines: number
  readonly nSources: number
  readonly periods: string[]
  readonly generationMs: number
  readonly collectionMissRate: number
  readonly cellMissingRate: number
  readonly nEvents: number
}

export interface StratumDto {
  readonly key: string
  readonly label: string
  readonly weight: number
  readonly values: number[]
  readonly matched: number[]
}

export interface HedonicDto {
  readonly r2: number
  readonly adjR2: number
  readonly sigma: number
  readonly nObs: number
  readonly nParams: number
  readonly coefficients: HedonicCoefficient[]
  readonly horizonCurve: { horizon: number; logEffect: number }[]
  readonly index: number[]
}

export interface IndexDto {
  readonly periods: string[]
  readonly methods: IndexResult[]
  readonly national: number[]
  readonly seasonallyAdjusted: number[]
  readonly confidence: ConfidenceBand
  readonly coverage: number[]
  readonly routeStrata: StratumDto[]
  readonly drift: ChainDriftResult[]
  readonly hedonic: HedonicDto | null
  readonly imputation: ImputationStats
  readonly periodStats: PeriodStats[]
  readonly divergencePP: number
  readonly yoyByMethod: Record<string, number>
  readonly avgYoyByMethod: Record<string, number>
  readonly nObservations: number
  readonly nExcluded: number
  readonly sourcesUsed: string[]
  readonly computeMs: number
  /** Prior published vintages of the national index, for the ghost lines. */
  readonly vintages: { label: string; values: number[] }[]
}

export interface TermStructureDto {
  readonly horizons: number[]
  /** One curve per weekly bucket: mean log fare relative to the route mean. */
  readonly curves: number[][]
  readonly bucketStartDates: string[]
  readonly components: PrincipalComponent[]
  readonly scores: number[][]
  readonly meanCurve: number[]
  /** Nelson-Siegel fitted to the latest bucket and to the mean curve. */
  readonly latestFit: NelsonSiegelFit
  readonly meanFit: NelsonSiegelFit
  /** Nelson-Siegel parameters through time, one per bucket. */
  readonly parameterPath: { date: string; beta0: number; beta1: number; beta2: number; tau: number }[]
  readonly bucketDays: number
}

export interface AttributionDto {
  readonly periods: string[]
  /** Mean log contribution per component, relative to the first period. */
  readonly components: { key: string; label: string; values: number[] }[]
  readonly waterfall: { key: string; label: string; value: number }[]
  readonly selectedPeriod: string
  readonly adf: TestResult[]
  readonly granger: TestResult[]
  readonly exogenous: { id: string; label: string; unit: string; periods: string[]; values: number[] }[]
}

export interface AnomalyDto {
  readonly id: string
  readonly routeId: string
  readonly routeLabel: string
  readonly period: string
  readonly observed: number
  readonly expected: number
  readonly zScore: number
  readonly pValue: number
  readonly adjustedP: number
  readonly severity: 'high' | 'medium' | 'low'
  readonly explanation: string
  readonly flaggedRaw: boolean
  readonly flaggedFdr: boolean
}

export interface AnomalyResultDto {
  readonly anomalies: AnomalyDto[]
  readonly nTested: number
  readonly nRawFlagged: number
  readonly nFdrFlagged: number
  readonly q: number
}

export interface PortfolioDto {
  readonly routeIds: string[]
  readonly routeLabels: string[]
  readonly correlation: number[][]
  readonly clusterOrder: number[]
  readonly shrinkageIntensity: number
  readonly shrinkageNote: string
  readonly factors: {
    routeId: string
    routeLabel: string
    marketBeta: number
    fuelBeta: number
    capacityBeta: number
    r2: number
    idioVol: number
  }[]
  readonly frontier: {
    riskAversion: number
    expectedReturn: number
    volatility: number
    weights: number[]
    effectiveN: number
  }[]
  readonly expectedReturns: number[]
  readonly varResult: {
    alpha: number
    var: number
    gaussianVar: number
    historicalVar: number
    cvar: number
    note: string
    skewness: number
    excessKurtosis: number
  }
}

/**
 * One carrier's slice of the panel.
 *
 * Two index series are carried deliberately. `index` is the constant-quality series -
 * the same RYGEKS-FEWS estimator the national index uses, run on that carrier's own
 * products. `naiveIndex` is the geometric mean of its observed fares. The gap between
 * them is the composition effect *within a single airline*, which is the part readers
 * usually assume cannot exist.
 */
export interface CarrierDto {
  readonly code: string
  readonly name: string
  readonly model: string
  readonly colour: string
  readonly nObservations: number
  readonly observationShare: number
  readonly seatShare: number
  readonly routesServed: number
  readonly meanFare: number
  readonly medianFare: number
  readonly geomeanFare: number
  readonly p10: number
  readonly p90: number
  readonly meanHorizonDays: number
  readonly index: number[]
  readonly naiveIndex: number[]
  readonly avgYoy: number
  readonly naiveAvgYoy: number
  readonly shareByPeriod: number[]
  readonly cabinMix: { cabin: string; share: number }[]
  /**
   * Mean log-fare gap against every other carrier quoted in the *same*
   * (route, horizon, cabin, fare family, month) cell, in percent. This is the carrier
   * effect with the network mix held fixed - a raw mean difference would mostly be
   * measuring which routes each airline flies.
   */
  readonly matchedPremiumPct: number
  readonly matchedCells: number
  readonly matchedTest: TestResult | null
}

export interface CarrierResultDto {
  readonly periods: string[]
  readonly carriers: CarrierDto[]
  readonly marketGeomean: number[]
  readonly totalObservations: number
  readonly computeMs: number
}

export interface ObservationDto {
  readonly index: number
  readonly routeId: string
  readonly airline: string
  readonly horizon: number
  readonly cabin: string
  readonly fareFamily: string
  readonly stops: number
  readonly source: string
  readonly collectionDate: string
  readonly departureDate: string
  readonly period: string
  readonly fare: number
  readonly seatsAvailable: number
  readonly rawBlobUri: string
  readonly parserVersion: string
  readonly ingestionRunId: string
  /** The raw payload the source is supposed to have returned, reconstructed. */
  readonly rawPayload: string
  /** SHA-256 recorded at ingestion. Verify recomputes it from rawPayload. */
  readonly sha256: string
}

/** How the traced figure should be rendered. Declared by the caller, never inferred. */
export type LineageUnit = 'index' | 'percent' | 'pp' | 'inr' | 'count'

export interface LineageDto {
  readonly title: string
  readonly subtitle: string
  readonly value: number
  readonly unit: LineageUnit
  readonly method: string
  readonly contributors: ObservationDto[]
  readonly totalContributors: number
  readonly periodLabel: string
}

export type PivotDimension =
  | 'period'
  | 'originState'
  | 'destinationState'
  | 'originRegion'
  | 'airline'
  | 'fareFamily'
  | 'horizonBand'
  | 'season'
  | 'cabin'
  | 'source'

export type PivotMeasure = 'geomean' | 'median' | 'p10' | 'p90' | 'count' | 'mean'

export interface PivotSpec {
  readonly rows: PivotDimension[]
  readonly cols: PivotDimension[]
  readonly measure: PivotMeasure
  readonly filter: CubeFilter
}

export interface PivotDto {
  readonly rowKeys: string[]
  readonly colKeys: string[]
  readonly values: (number | null)[][]
  readonly counts: number[][]
  readonly measure: PivotMeasure
  readonly rowTotals: (number | null)[]
  readonly colTotals: (number | null)[]
  readonly grandTotal: number | null
  readonly nCells: number
}

export interface RouteDetailDto {
  readonly routeId: string
  readonly index: number[]
  readonly periods: string[]
  readonly fareByHorizon: { horizon: number; values: number[]; median: number; p10: number; p90: number }[]
  readonly capacity: { date: string; seats: number }[]
  readonly events: { id: string; label: string; startDate: string; severity: number }[]
  readonly forecast: { period: string; median: number; lower80: number; upper80: number; lower95: number; upper95: number }[]
  readonly railHours: number | null
  readonly railComparison: { airMeanFare: number; railFareEstimate: number; airHours: number } | null
}

export interface BudgetRequest {
  readonly legs: { routeId: string; trips: number }[]
  readonly draws: number
}

export interface BudgetDto {
  readonly mean: number
  readonly p50: number
  readonly p80: number
  readonly p95: number
  readonly var95: number
  readonly cvar95: number
  readonly histogram: { x: number; count: number }[]
  readonly legDetail: { routeId: string; label: string; trips: number; meanFare: number; contribution: number }[]
}

// --- request / response envelopes ------------------------------------------

export type WorkerRequest =
  | { id: number; type: 'generate'; seed: number }
  | { id: number; type: 'indices'; filter: CubeFilter }
  | { id: number; type: 'termStructure'; filter: CubeFilter }
  | { id: number; type: 'attribution'; filter: CubeFilter; period?: string }
  | { id: number; type: 'anomalies'; filter: CubeFilter; q: number }
  | { id: number; type: 'portfolio'; filter: CubeFilter }
  | { id: number; type: 'carriers'; filter: CubeFilter }
  | { id: number; type: 'pivot'; spec: PivotSpec }
  | { id: number; type: 'routeDetail'; routeId: string; filter: CubeFilter }
  | {
      id: number
      type: 'lineage'
      kind: 'cell'
      productId?: number
      periodIdx: number
      routeId?: string
      airlineCode?: string
      label: string
      value: number
      method: string
      unit: LineageUnit
      filter: CubeFilter
    }
  | { id: number; type: 'observation'; index: number }
  | { id: number; type: 'budget'; request: BudgetRequest; filter: CubeFilter }

export type WorkerResponse =
  | { id: number; type: 'progress'; fraction: number; label: string }
  | { id: number; type: 'generated'; summary: DatasetSummary }
  | { id: number; type: 'indices'; payload: IndexDto }
  | { id: number; type: 'termStructure'; payload: TermStructureDto }
  | { id: number; type: 'attribution'; payload: AttributionDto }
  | { id: number; type: 'anomalies'; payload: AnomalyResultDto }
  | { id: number; type: 'portfolio'; payload: PortfolioDto }
  | { id: number; type: 'carriers'; payload: CarrierResultDto }
  | { id: number; type: 'pivot'; payload: PivotDto }
  | { id: number; type: 'routeDetail'; payload: RouteDetailDto }
  | { id: number; type: 'lineage'; payload: LineageDto }
  | { id: number; type: 'observation'; payload: ObservationDto }
  | { id: number; type: 'budget'; payload: BudgetDto }
  | { id: number; type: 'error'; message: string; stack?: string }
