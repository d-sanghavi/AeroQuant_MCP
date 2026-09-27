/// <reference lib="webworker" />

/**
 * The data worker.
 *
 * Owns the generated dataset for the lifetime of the session and answers questions
 * about it. Nothing here touches the DOM; nothing on the main thread touches the
 * panel. That separation is what keeps the term-structure scrubber and the frontier
 * slider at 60fps while half a million observations are being re-aggregated behind
 * them.
 */

import { generateDataset, type Dataset } from '../generate/dgp'
import { EVENTS } from '../generate/events'
import { AIRLINES } from '../master/airlines'
import { AIRPORTS } from '../master/airports'
import { CALENDAR, PERIODS } from '../master/calendar'
import { HORIZONS, ROUTES } from '../master/routes'
import { SOURCES } from '../master/sources'
import { buildCurveMatrix, type CubeFilter } from '../cube'
import { computeIndices } from '@/lib/quant/pipeline'
import { fitNelsonSiegel } from '@/lib/quant/nelsonSiegel'
import { pca } from '@/lib/quant/pca'
import { stl } from '@/lib/quant/timeseries'
import { fromRows } from '@/lib/linalg/matrix'
import { aggregateStrata, rebase } from '@/lib/quant/aggregate'
import { computeCarriers } from './carriers'
import { observationDto } from './provenance'
import {
  computeAnomalies,
  computeAttribution,
  computePivot,
  computePortfolio,
  computeRouteDetail,
  simulateBudget,
} from './analytics'
import type {
  IndexDto,
  TermStructureDto,
  WorkerRequest,
  WorkerResponse,
} from './protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope

let dataset: Dataset | null = null
/** Cache keyed on the serialised filter - filter changes are far more common than
 *  new filters, so even a one-entry cache saves most recomputes. */
const indexCache = new Map<string, IndexDto>()
let defaultVintages: { label: string; values: number[] }[] = []

function post(msg: WorkerResponse): void {
  ctx.postMessage(msg)
}

function requireDataset(): Dataset {
  if (!dataset) throw new Error('Dataset has not been generated yet.')
  return dataset
}

function filterKey(f: CubeFilter): string {
  return JSON.stringify({
    a: f.periodFrom ?? 0,
    b: f.periodTo ?? PERIODS.length - 1,
    s: f.disableScraped ?? false,
    r: f.routeIds ?? null,
    h: f.horizons ?? null,
    l: f.airlineCodes ?? null,
    c: f.cabins ?? null,
  })
}

function isDefaultFilter(f: CubeFilter): boolean {
  return (
    (f.periodFrom ?? 0) === 0 &&
    (f.periodTo ?? PERIODS.length - 1) === PERIODS.length - 1 &&
    !f.disableScraped &&
    !f.routeIds &&
    !f.horizons &&
    !f.airlineCodes &&
    !f.cabins
  )
}

// ---------------------------------------------------------------------------

function buildIndexDto(ds: Dataset, filter: CubeFilter): IndexDto {
  const b = computeIndices(ds, filter)

  // Seasonal adjustment. Airfare seasonality is enormous - Diwali and the summer
  // holidays move the index by more than a year of trend - so the unadjusted series
  // is nearly unreadable as a measure of price change. STL is used rather than a
  // fixed seasonal profile because the festival calendar moves between years.
  const logIndex = b.national.map((v) => (Number.isFinite(v) ? Math.log(v) : NaN))
  const usable = logIndex.every(Number.isFinite)
  const seasonallyAdjusted = usable
    ? (() => {
        const d = stl(logIndex, 12)
        return d.trend.map((t, i) => Math.exp(t + d.remainder[i]!))
      })()
    : b.national.slice()

  return {
    periods: [...b.periods],
    methods: b.methods,
    national: b.national,
    seasonallyAdjusted: rebase(seasonallyAdjusted, 0, 100),
    confidence: b.confidence,
    coverage: b.coverage,
    routeStrata: b.routeStrata.map((s) => ({
      key: s.key,
      label: s.label,
      weight: s.weight,
      values: s.values,
      matched: s.matched,
    })),
    drift: b.drift,
    hedonic: b.hedonic
      ? {
          r2: b.hedonic.r2,
          adjR2: b.hedonic.adjR2,
          sigma: b.hedonic.sigma,
          nObs: b.hedonic.nObs,
          nParams: b.hedonic.nParams,
          coefficients: [...b.hedonic.coefficients],
          horizonCurve: b.hedonic.horizonCurve,
          index: b.hedonic.index,
        }
      : null,
    imputation: b.imputation,
    periodStats: b.cube.periodStats,
    divergencePP: b.divergencePP,
    yoyByMethod: b.yoyByMethod,
    avgYoyByMethod: b.avgYoyByMethod,
    nObservations: b.cube.nObservations,
    nExcluded: b.cube.nExcluded,
    sourcesUsed: b.cube.sourcesUsed,
    computeMs: b.computeMs,
    vintages: isDefaultFilter(filter) ? defaultVintages : [],
  }
}

/**
 * Prior published vintages, for the ghost lines on the Index Terminal.
 *
 * A vintage is what the index looked like when it was published with less data. The
 * route-level estimates move as later observations arrive, so earlier vintages differ
 * - and showing that honestly is the point. Computed once, for the default view only,
 * because each vintage costs a full route-level re-estimation.
 */
function buildVintages(ds: Dataset): { label: string; values: number[] }[] {
  const out: { label: string; values: number[] }[] = []
  for (const lag of [1, 3]) {
    const to = PERIODS.length - 1 - lag
    if (to < 13) continue
    const b = computeIndices(ds, { periodTo: to })
    const { values } = aggregateStrata(b.routeStrata, to + 1)
    out.push({
      label: `Vintage: ${PERIODS[to]!} release`,
      values: rebase(values, 0, 100),
    })
  }
  return out
}

// ---------------------------------------------------------------------------

function buildTermStructure(ds: Dataset, filter: CubeFilter): TermStructureDto {
  const curves = buildCurveMatrix(ds, filter)
  if (curves.rows.length < 6) {
    throw new Error('Not enough complete fare curves in this selection to fit a term structure.')
  }
  const result = pca(fromRows(curves.rows), 3)

  const nH = HORIZONS.length
  const meanCurve = new Array<number>(nH).fill(0)
  for (const row of curves.rows) for (let h = 0; h < nH; h++) meanCurve[h] = meanCurve[h]! + row[h]!
  for (let h = 0; h < nH; h++) meanCurve[h] = meanCurve[h]! / curves.rows.length

  const bucketStartDates = curves.departDays.map((d) => CALENDAR[d]?.date ?? '')

  const parameterPath = curves.rows.map((row, i) => {
    const fit = fitNelsonSiegel(HORIZONS, row)
    return {
      date: bucketStartDates[i]!,
      beta0: fit.beta0,
      beta1: fit.beta1,
      beta2: fit.beta2,
      tau: fit.tau,
    }
  })

  return {
    horizons: [...HORIZONS],
    curves: curves.rows,
    bucketStartDates,
    components: result.components,
    scores: result.scores,
    meanCurve,
    latestFit: fitNelsonSiegel(HORIZONS, curves.rows[curves.rows.length - 1]!),
    meanFit: fitNelsonSiegel(HORIZONS, meanCurve),
    parameterPath,
    bucketDays: curves.bucketDays,
  }
}

// ---------------------------------------------------------------------------

ctx.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const req = event.data
  void (async () => {
    try {
      switch (req.type) {
        case 'generate': {
          indexCache.clear()
          dataset = generateDataset({
            seed: req.seed,
            onProgress: (fraction, label) =>
              post({ id: req.id, type: 'progress', fraction: fraction * 0.72, label }),
          })
          post({ id: req.id, type: 'progress', fraction: 0.78, label: 'Computing the index' })
          const dto = buildIndexDto(dataset, {})
          indexCache.set(filterKey({}), dto)
          post({ id: req.id, type: 'progress', fraction: 0.9, label: 'Reconstructing prior vintages' })
          defaultVintages = buildVintages(dataset)
          indexCache.set(filterKey({}), { ...dto, vintages: defaultVintages })
          post({
            id: req.id,
            type: 'generated',
            summary: {
              seed: dataset.seed,
              nObservations: dataset.panel.n,
              nProducts: dataset.products.length,
              nRoutes: ROUTES.length,
              nAirports: AIRPORTS.length,
              nAirlines: AIRLINES.length,
              nSources: SOURCES.length,
              periods: [...PERIODS],
              generationMs: dataset.generatedAtMs,
              collectionMissRate: dataset.collectionMissRate,
              cellMissingRate: dataset.cellMissingRate,
              nEvents: EVENTS.length,
            },
          })
          break
        }

        case 'indices': {
          const ds = requireDataset()
          const key = filterKey(req.filter)
          let dto = indexCache.get(key)
          if (!dto) {
            dto = buildIndexDto(ds, req.filter)
            // Bounded cache: the filter space is large and the payloads are not tiny.
            if (indexCache.size > 12) {
              const oldest = indexCache.keys().next().value
              if (oldest !== undefined) indexCache.delete(oldest)
            }
            indexCache.set(key, dto)
          }
          post({ id: req.id, type: 'indices', payload: dto })
          break
        }

        case 'termStructure': {
          post({ id: req.id, type: 'termStructure', payload: buildTermStructure(requireDataset(), req.filter) })
          break
        }

        case 'attribution': {
          post({
            id: req.id,
            type: 'attribution',
            payload: computeAttribution(requireDataset(), req.filter, req.period),
          })
          break
        }

        case 'anomalies': {
          post({
            id: req.id,
            type: 'anomalies',
            payload: computeAnomalies(requireDataset(), req.filter, req.q),
          })
          break
        }

        case 'portfolio': {
          post({ id: req.id, type: 'portfolio', payload: computePortfolio(requireDataset(), req.filter) })
          break
        }

        case 'carriers': {
          post({ id: req.id, type: 'carriers', payload: computeCarriers(requireDataset(), req.filter) })
          break
        }

        case 'pivot': {
          post({ id: req.id, type: 'pivot', payload: computePivot(requireDataset(), req.spec) })
          break
        }

        case 'routeDetail': {
          post({
            id: req.id,
            type: 'routeDetail',
            payload: computeRouteDetail(requireDataset(), req.routeId, req.filter),
          })
          break
        }

        case 'observation': {
          const ds = requireDataset()
          post({ id: req.id, type: 'observation', payload: await observationDto(ds.panel, req.index) })
          break
        }

        case 'lineage': {
          const ds = requireDataset()
          const { panel } = ds
          const matches: number[] = []
          const routeIdx = req.routeId ? ROUTES.findIndex((r) => r.id === req.routeId) : -1
          const airlineIdx = req.airlineCode
            ? AIRLINES.findIndex((a) => a.code === req.airlineCode)
            : -1
          const globalPeriod = (req.filter.periodFrom ?? 0) + req.periodIdx

          const contributes = (i: number): boolean => {
            if (panel.periodIdx[i]! !== globalPeriod) return false
            if (req.productId !== undefined && panel.productIdx[i]! !== req.productId) return false
            if (routeIdx >= 0 && panel.routeIdx[i]! !== routeIdx) return false
            if (airlineIdx >= 0 && panel.airlineIdx[i]! !== airlineIdx) return false
            return true
          }

          for (let i = 0; i < panel.n && matches.length < 400; i++) {
            if (contributes(i)) matches.push(i)
          }

          // Count the full contributing set even though only a page of it is returned.
          let total = 0
          for (let i = 0; i < panel.n; i++) if (contributes(i)) total++

          const contributors = await Promise.all(
            matches.slice(0, 25).map((i) => observationDto(panel, i)),
          )

          post({
            id: req.id,
            type: 'lineage',
            payload: {
              title: req.label,
              subtitle: [
                req.routeId ? `Route ${req.routeId}` : null,
                airlineIdx >= 0 ? AIRLINES[airlineIdx]!.name : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'National aggregate',
              value: req.value,
              unit: req.unit,
              method: req.method,
              contributors,
              totalContributors: total,
              periodLabel: PERIODS[globalPeriod] ?? '',
            },
          })
          break
        }

        case 'budget': {
          post({
            id: req.id,
            type: 'budget',
            payload: simulateBudget(requireDataset(), req.request, req.filter),
          })
          break
        }
      }
    } catch (err) {
      post({
        id: req.id,
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
    }
  })()
})
