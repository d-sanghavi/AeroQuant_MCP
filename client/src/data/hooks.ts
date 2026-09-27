import * as React from 'react'
import { useApp } from './store'
import { dataWorker } from './workerClient'
import type { CubeFilter } from './cube'
import type {
  AnomalyResultDto,
  AttributionDto,
  BudgetDto,
  BudgetRequest,
  CarrierResultDto,
  IndexDto,
  PivotDto,
  PivotSpec,
  PortfolioDto,
  RouteDetailDto,
  TermStructureDto,
} from './worker/protocol'

export interface AsyncState<T> {
  readonly data: T | null
  readonly loading: boolean
  readonly error: string | null
  readonly refresh: () => void
}

/**
 * Await a worker call, keyed on a dependency list.
 *
 * Stale responses are dropped rather than cancelled: the worker has no cancellation
 * and adding one would be more machinery than a sub-second computation deserves. What
 * matters is that a slow response for an old filter never overwrites a fast one for
 * the current filter, which the sequence guard handles.
 */
export function useWorkerQuery<T>(
  run: () => Promise<T>,
  deps: React.DependencyList,
  enabled = true,
): AsyncState<T> {
  const [data, setData] = React.useState<T | null>(null)
  const [loading, setLoading] = React.useState(enabled)
  const [error, setError] = React.useState<string | null>(null)
  const [nonce, setNonce] = React.useState(0)
  const seq = React.useRef(0)

  React.useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    setError(null)
    run()
      .then((value) => {
        if (seq.current !== mine) return
        setData(value)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (seq.current !== mine) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    // `run` is intentionally excluded: callers pass an inline closure, and the
    // dependency list they supply is the real key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce])

  return { data, loading, error, refresh: () => setNonce((n) => n + 1) }
}

/** The filter every screen shares, as a stable value. */
export function useFilter(): CubeFilter {
  const periodFrom = useApp((s) => s.periodFrom)
  const periodTo = useApp((s) => s.periodTo)
  const disableScraped = useApp((s) => s.disableScraped)
  const selectedRoutes = useApp((s) => s.selectedRoutes)
  const routeKey = selectedRoutes.join(',')

  return React.useMemo(
    () => ({
      periodFrom,
      periodTo,
      disableScraped,
      routeIds: routeKey.length > 0 ? routeKey.split(',') : undefined,
    }),
    [periodFrom, periodTo, disableScraped, routeKey],
  )
}

function key(f: CubeFilter): string {
  return `${f.periodFrom}-${f.periodTo}-${f.disableScraped ? 1 : 0}-${f.routeIds?.join(',') ?? ''}`
}

export function useIndices(filter: CubeFilter): AsyncState<IndexDto> {
  const ready = useApp((s) => s.status === 'ready')
  return useWorkerQuery(() => dataWorker.indices(filter), [key(filter)], ready)
}

export function useTermStructure(filter: CubeFilter): AsyncState<TermStructureDto> {
  const ready = useApp((s) => s.status === 'ready')
  return useWorkerQuery(() => dataWorker.termStructure(filter), [key(filter)], ready)
}

export function useAttribution(filter: CubeFilter, period?: string): AsyncState<AttributionDto> {
  const ready = useApp((s) => s.status === 'ready')
  return useWorkerQuery(
    () => dataWorker.attribution(filter, period),
    [key(filter), period ?? ''],
    ready,
  )
}

export function useAnomalies(filter: CubeFilter, q: number): AsyncState<AnomalyResultDto> {
  const ready = useApp((s) => s.status === 'ready')
  return useWorkerQuery(() => dataWorker.anomalies(filter, q), [key(filter), q], ready)
}

export function usePortfolio(filter: CubeFilter): AsyncState<PortfolioDto> {
  const ready = useApp((s) => s.status === 'ready')
  return useWorkerQuery(() => dataWorker.portfolio(filter), [key(filter)], ready)
}

export function useCarriers(filter: CubeFilter): AsyncState<CarrierResultDto> {
  const ready = useApp((s) => s.status === 'ready')
  return useWorkerQuery(() => dataWorker.carriers(filter), [key(filter)], ready)
}

export function usePivot(spec: PivotSpec): AsyncState<PivotDto> {
  const ready = useApp((s) => s.status === 'ready')
  return useWorkerQuery(
    () => dataWorker.pivot(spec),
    [key(spec.filter), spec.rows.join(','), spec.cols.join(','), spec.measure],
    ready,
  )
}

export function useRouteDetail(
  routeId: string | null,
  filter: CubeFilter,
): AsyncState<RouteDetailDto> {
  const ready = useApp((s) => s.status === 'ready')
  return useWorkerQuery(
    () => dataWorker.routeDetail(routeId ?? '', filter),
    [routeId ?? '', key(filter)],
    ready && routeId !== null,
  )
}

export function useBudget(
  request: BudgetRequest | null,
  filter: CubeFilter,
): AsyncState<BudgetDto> {
  const ready = useApp((s) => s.status === 'ready')
  return useWorkerQuery(
    () => dataWorker.budget(request!, filter),
    [JSON.stringify(request), key(filter)],
    ready && request !== null && request.legs.length > 0,
  )
}
