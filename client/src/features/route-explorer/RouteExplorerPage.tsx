import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Search, TrainFront } from 'lucide-react'
import { EChart, type ChartTokens } from '@/components/charts/EChart'
import type { EChartsOption } from 'echarts'
import { alpha, categoryAxis, SERIES_COLOURS, valueAxis } from '@/components/charts/theme'
import { Violin } from '@/components/charts/Violin'
import {
  Badge,
  Button,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Tip,
} from '@/components/ui/primitives'
import { ProvValue, Readout } from '@/components/ui/numbers'
import { useFilter, useIndices, useRouteDetail } from '@/data/hooks'
import { ROUTES, type RouteDef } from '@/data/master/routes'
import { fmtDate, fmtIndex, fmtINR, fmtMonthShort, fmtNumber, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Route Explorer.
 *
 * The index is a national number; a route is where it becomes checkable. Everything an
 * analyst needs to decide whether a route's contribution is believable lives here: the
 * series, the distribution behind it, the capacity that drove it, the disruptions that
 * interrupted it, and a forecast whose interval is honest about the model being simple.
 */

function RouteRow({
  route,
  index,
  change,
  selected,
  onSelect,
}: {
  route: RouteDef
  index: number
  change: number
  selected: boolean
  onSelect: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'tap flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors sm:px-4',
        selected ? 'bg-elevated' : 'hover:bg-elevated/50',
      )}
    >
      <span className={cn('num w-[4.5rem] shrink-0 text-xs', selected ? 'text-accent' : 'text-ink')}>
        {route.origin}-{route.destination}
      </span>
      <span className="hidden min-w-0 flex-1 truncate text-2xs text-faint md:block">
        {route.originAirport.city} to {route.destinationAirport.city}
      </span>
      <span className="num hidden w-16 shrink-0 text-right text-2xs text-faint sm:inline">
        {fmtNumber(route.distanceKm)} km
      </span>
      <span className="num w-14 shrink-0 text-right text-xs text-muted">
        {Number.isFinite(index) ? fmtIndex(index) : '--'}
      </span>
      <span
        className={cn(
          'num w-14 shrink-0 text-right text-xs',
          !Number.isFinite(change) ? 'text-faint' : change > 0 ? 'text-neg' : 'text-pos',
        )}
      >
        {Number.isFinite(change) ? fmtPct(change, 1) : '--'}
      </span>
    </button>
  )
}

export default function RouteExplorerPage(): React.ReactElement {
  const filter = useFilter()
  const [params, setParams] = useSearchParams()
  const reduce = useReducedMotion()
  const [query, setQuery] = React.useState('')

  const selectedId = params.get('route')
  const select = (id: string | null): void => {
    const next = new URLSearchParams(params)
    if (id) next.set('route', id)
    else next.delete('route')
    setParams(next, { replace: true })
  }

  const { data: indices, loading: indicesLoading } = useIndices(filter)
  const { data: detail, loading: detailLoading, error } = useRouteDetail(selectedId, filter)

  const route = selectedId ? ROUTES.find((r) => r.id === selectedId) : undefined

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const byKey = new Map(indices?.routeStrata.map((s) => [s.key, s]) ?? [])
    return ROUTES.filter((r) => {
      if (!q) return true
      return (
        r.id.toLowerCase().includes(q) ||
        r.originAirport.city.toLowerCase().includes(q) ||
        r.destinationAirport.city.toLowerCase().includes(q) ||
        r.originAirport.state.toLowerCase().includes(q) ||
        r.destinationAirport.state.toLowerCase().includes(q)
      )
    })
      .map((r) => {
        const s = byKey.get(r.id)
        const values = s?.values ?? []
        const last = values[values.length - 1] ?? NaN
        const prev = values[values.length - 2] ?? NaN
        return {
          route: r,
          index: last,
          change: Number.isFinite(last) && Number.isFinite(prev) ? (last / prev - 1) * 100 : NaN,
        }
      })
      .sort((a, b) => b.route.paxPerMonth - a.route.paxPerMonth)
  }, [query, indices])

  const seriesOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!detail) return {} as EChartsOption
      const months = [...detail.periods, ...detail.forecast.map((f) => f.period)].map(
        fmtMonthShort,
      )
      const pad = new Array(detail.periods.length - 1).fill(null)
      const lastValue = detail.index[detail.index.length - 1] ?? null

      return {
        grid: { left: 4, right: 10, top: 30, bottom: 4, containLabel: true },
        // The stacked fan needs an invisible base series under each band; naming them
        // explicitly here keeps those internals out of the legend.
        legend: {
          top: 0,
          left: 0,
          data: ['Route index', 'Forecast', '80% forecast band', '95% forecast band'],
        },
        xAxis: categoryAxis(tok, { data: months }),
        yAxis: valueAxis(tok, { scale: true }),
        tooltip: {
          valueFormatter: (v: unknown) =>
            typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '--',
        },
        series: [
          // Fan bands first so the central line draws over them.
          {
            name: 'fan-95-base',
            type: 'line',
            stack: 'f95',
            symbol: 'none',
            silent: true,
            lineStyle: { opacity: 0 },
            tooltip: { show: false },
            data: [...pad, lastValue, ...detail.forecast.map((f) => f.lower95)],
            z: 1,
          },
          {
            name: '95% forecast band',
            type: 'line',
            stack: 'f95',
            symbol: 'none',
            silent: true,
            lineStyle: { opacity: 0 },
            itemStyle: { color: alpha(SERIES_COLOURS[2], 0.25) },
            areaStyle: { color: alpha(SERIES_COLOURS[2], 0.1) },
            data: [
              ...pad,
              0,
              ...detail.forecast.map((f) => f.upper95 - f.lower95),
            ],
            z: 1,
          },
          {
            name: 'fan-80-base',
            type: 'line',
            stack: 'f80',
            symbol: 'none',
            silent: true,
            lineStyle: { opacity: 0 },
            tooltip: { show: false },
            data: [...pad, lastValue, ...detail.forecast.map((f) => f.lower80)],
            z: 2,
          },
          {
            name: '80% forecast band',
            type: 'line',
            stack: 'f80',
            symbol: 'none',
            silent: true,
            lineStyle: { opacity: 0 },
            itemStyle: { color: alpha(SERIES_COLOURS[2], 0.4) },
            areaStyle: { color: alpha(SERIES_COLOURS[2], 0.18) },
            data: [...pad, 0, ...detail.forecast.map((f) => f.upper80 - f.lower80)],
            z: 2,
          },
          {
            name: 'Forecast',
            type: 'line',
            symbol: 'none',
            lineStyle: { width: 1.75, color: SERIES_COLOURS[2], type: 'dashed' },
            itemStyle: { color: SERIES_COLOURS[2] },
            data: [...pad, lastValue, ...detail.forecast.map((f) => f.median)],
            z: 4,
          },
          {
            name: 'Route index',
            type: 'line',
            symbol: 'none',
            lineStyle: { width: 2, color: tok.accent },
            itemStyle: { color: tok.accent },
            data: detail.index,
            z: 5,
            markPoint:
              detail.events.length > 0
                ? {
                    symbol: 'pin',
                    symbolSize: 22,
                    itemStyle: { color: alpha(tok.negative, 0.8) },
                    label: { show: false },
                    data: detail.events
                      .filter((e) => e.severity >= 4)
                      .slice(0, 6)
                      .map((e) => {
                        const idx = detail.periods.indexOf(e.startDate.slice(0, 7))
                        return idx >= 0
                          ? { xAxis: idx, yAxis: detail.index[idx] ?? 100, name: e.label }
                          : null
                      })
                      .filter((x): x is NonNullable<typeof x> => x !== null),
                  }
                : undefined,
          },
        ],
      }
    },
    [detail],
  )

  const capacityOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!detail) return {} as EChartsOption
      return {
        grid: { left: 4, right: 10, top: 12, bottom: 4, containLabel: true },
        legend: { show: false },
        xAxis: categoryAxis(tok, {
          data: detail.capacity.map((c) => fmtMonthShort(c.date.slice(0, 7))),
          axisLabel: { color: tok.faint, fontSize: 9, hideOverlap: true },
        }),
        yAxis: valueAxis(tok, { scale: true }),
        tooltip: {
          valueFormatter: (v: unknown) => (typeof v === 'number' ? `${fmtNumber(v)} seats` : '--'),
        },
        series: [
          {
            name: 'Seats offered per day',
            type: 'line',
            symbol: 'none',
            smooth: true,
            lineStyle: { width: 1.5, color: SERIES_COLOURS[1] },
            itemStyle: { color: SERIES_COLOURS[1] },
            areaStyle: { color: alpha(SERIES_COLOURS[1], 0.1) },
            data: detail.capacity.map((c) => c.seats),
          },
        ],
      }
    },
    [detail],
  )

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        kicker="Route explorer"
        title={route ? `${route.originAirport.city} to ${route.destinationAirport.city}` : 'Routes'}
        description={
          route ? (
            <>
              {route.id} &middot; {fmtNumber(route.distanceKm)} km &middot;{' '}
              {fmtNumber(route.paxPerMonth)} passengers a month &middot; served by{' '}
              {route.servingAirlines.join(', ')}
            </>
          ) : (
            <>
              Sixty origin-destination pairs carrying the national index. Select one to see
              its own index, the distribution behind it, the capacity that drove it and a
              forecast with conformal intervals.
            </>
          )
        }
        actions={
          route ? (
            <Button size="sm" onClick={() => select(null)}>
              <ArrowLeft className="h-3 w-3" aria-hidden />
              All routes
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* --- list ------------------------------------------------------- */}
        <Panel className={cn(route ? 'hidden xl:flex' : 'flex')}>
          <PanelHeader
            title="Routes by traffic"
            subtitle={`${rows.length} of ${ROUTES.length}`}
          />
          <div className="border-b border-line px-3 py-2 sm:px-4">
            <div className="flex items-center gap-2 rounded border border-line bg-bg px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by code, city or state"
                aria-label="Filter routes"
                className="h-8 w-full bg-transparent text-xs text-ink placeholder:text-faint focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2.5 border-b border-line px-3 py-1.5 sm:px-4">
            <span className="label-caps w-[4.5rem] shrink-0">Route</span>
            <span className="label-caps hidden flex-1 md:block">Cities</span>
            <span className="label-caps hidden w-16 shrink-0 text-right sm:inline">Distance</span>
            <span className="label-caps w-14 shrink-0 text-right">Index</span>
            <span className="label-caps w-14 shrink-0 text-right">MoM</span>
          </div>
          <div className="max-h-[32rem] min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {indicesLoading ? (
              <ChartSkeleton height={320} />
            ) : rows.length === 0 ? (
              <EmptyState title="No routes match that filter" />
            ) : (
              rows.map((r) => (
                <RouteRow
                  key={r.route.id}
                  route={r.route}
                  index={r.index}
                  change={r.change}
                  selected={r.route.id === selectedId}
                  onSelect={() => select(r.route.id)}
                />
              ))
            )}
          </div>
        </Panel>

        {/* --- detail ------------------------------------------------------ */}
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <AnimatePresence mode="wait">
            {!route ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Panel>
                  <EmptyState
                    title="Select a route"
                    detail="Each route is estimated independently by Time Product Dummy, then aggregated into the national index with DGCA passenger weights."
                  />
                </Panel>
              </motion.div>
            ) : (
              <motion.div
                key={route.id}
                layoutId={reduce ? undefined : `route-${route.id}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                className="flex flex-col gap-3 sm:gap-4"
              >
                {error ? (
                  <Panel>
                    <ErrorState message={error} />
                  </Panel>
                ) : (
                  <>
                    <Panel>
                      <PanelHeader
                        title="Route index and forecast"
                        subtitle="Six months ahead, with split-conformal intervals"
                        info="The point forecast is an STL trend extrapolation plus last year's seasonal factor. The bands are the empirical quantiles of this route's own past h-step-ahead errors, not a model standard error - which is the honest choice when the point model is deliberately simple."
                        actions={
                          detail && detail.events.length > 0 ? (
                            <Badge tone="warning">{detail.events.length} events</Badge>
                          ) : null
                        }
                      />
                      {detailLoading || !detail ? (
                        <ChartSkeleton height={300} />
                      ) : (
                        <>
                          <div className="p-1.5 sm:p-2">
                            <EChart
                              ariaLabel={`Index and six-month forecast for ${route.id}`}
                              option={seriesOption}
                              height={300}
                              mobileHeight={240}
                              notMerge
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3 border-t border-line px-3 py-2.5 sm:grid-cols-4 sm:px-4">
                            <Readout
                              label="Latest index"
                              value={
                                <ProvValue
                                  provenance={{
                                    label: `${route.id} index`,
                                    value: detail.index[detail.index.length - 1] ?? NaN,
                                    method: 'Route index, Time Product Dummy',
                                    unit: 'index',
                                    periodIdx: detail.periods.length - 1,
                                    routeId: route.id,
                                  }}
                                >
                                  {fmtIndex(detail.index[detail.index.length - 1] ?? NaN)}
                                </ProvValue>
                              }
                            />
                            <Readout
                              label="6-month central"
                              value={fmtIndex(detail.forecast[5]?.median ?? NaN)}
                              tone="accent"
                            />
                            <Readout
                              label="80% band"
                              value={
                                detail.forecast[5]
                                  ? `${fmtIndex(detail.forecast[5].lower80)} - ${fmtIndex(detail.forecast[5].upper80)}`
                                  : '--'
                              }
                            />
                            <Readout
                              label="Weight in national"
                              value={`${((route.paxPerMonth / ROUTES.reduce((s, r) => s + r.paxPerMonth, 0)) * 100).toFixed(2)}%`}
                            />
                          </div>
                        </>
                      )}
                    </Panel>

                    <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                      <Panel>
                        <PanelHeader
                          title="Fare distribution by horizon"
                          subtitle="Kernel density, log scale; bar is the median, spine is p10 to p90"
                          info="A box plot would render a right-skewed and a bimodal distribution identically. At short horizons these are frequently bimodal - a cheap remaining bucket and an expensive one - and that is precisely what an average hides."
                        />
                        {detailLoading || !detail ? (
                          <ChartSkeleton height={260} />
                        ) : (
                          <div className="p-2 sm:p-3">
                            <Violin
                              ariaLabel={`Fare distribution by booking horizon for ${route.id}`}
                              height={260}
                              series={detail.fareByHorizon
                                .filter((f) => f.values.length > 10)
                                .map((f) => ({
                                  key: `T-${f.horizon}`,
                                  label: `T-${f.horizon}`,
                                  values: f.values,
                                  median: f.median,
                                  p10: f.p10,
                                  p90: f.p90,
                                }))}
                            />
                          </div>
                        )}
                      </Panel>

                      <div className="flex flex-col gap-3 sm:gap-4">
                        <Panel>
                          <PanelHeader
                            title="Capacity"
                            subtitle="Seats offered per day, weekly samples"
                            info="Capacity is the mechanism behind most disruption effects: withdrawn seats raise the fares that remain sellable while simultaneously thinning the sample."
                          />
                          {detailLoading || !detail ? (
                            <ChartSkeleton height={160} />
                          ) : (
                            <div className="p-1.5 sm:p-2">
                              <EChart
                                ariaLabel={`Seats offered per day on ${route.id}`}
                                option={capacityOption}
                                height={160}
                                mobileHeight={150}
                              />
                            </div>
                          )}
                        </Panel>

                        <Panel>
                          <PanelHeader
                            title={route.hasRailSubstitute ? 'Rail substitute' : 'No rail substitute'}
                            subtitle={
                              route.hasRailSubstitute
                                ? 'Air fare is not the whole price of travel between two cities'
                                : 'No competitive rail corridor on this pair'
                            }
                          />
                          <div className="p-3 sm:p-4">
                            {route.hasRailSubstitute && detail?.railComparison ? (
                              <div className="flex flex-col gap-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <Readout
                                    label="Mean air fare"
                                    value={fmtINR(detail.railComparison.airMeanFare)}
                                  />
                                  <Readout
                                    label="AC 2-tier rail"
                                    value={fmtINR(detail.railComparison.railFareEstimate)}
                                    tone="accent"
                                  />
                                  <Readout
                                    label="Air door to door"
                                    value={`${detail.railComparison.airHours.toFixed(1)} h`}
                                  />
                                  <Readout
                                    label="Rail journey"
                                    value={`${route.railHours?.toFixed(1)} h`}
                                  />
                                </div>
                                <p className="flex items-start gap-2 text-2xs leading-relaxed text-faint">
                                  <TrainFront className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                  <span>
                                    Where rail is competitive on time, air fares face a
                                    ceiling that has nothing to do with the cost of flying.
                                    A price index for transport that ignores the substitute
                                    will misread a capacity-driven fare move as inflation.
                                  </span>
                                </p>
                              </div>
                            ) : (
                              <p className="text-2xs leading-relaxed text-faint">
                                At {fmtNumber(route.distanceKm)} km there is no rail service
                                competitive enough to constrain the fare, so the full price
                                movement is aviation-specific.
                              </p>
                            )}
                          </div>
                        </Panel>
                      </div>
                    </div>

                    {detail && detail.events.length > 0 ? (
                      <Panel>
                        <PanelHeader
                          title="Disruptions affecting this route"
                          subtitle={`${detail.events.length} in the window`}
                        />
                        <ul className="divide-y divide-line">
                          {detail.events.slice(0, 8).map((e) => (
                            <li
                              key={e.id}
                              className="flex items-center gap-3 px-3 py-2 sm:px-4"
                            >
                              <span className="num w-20 shrink-0 text-2xs text-faint">
                                {fmtDate(e.startDate)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                                {e.label}
                              </span>
                              <Tip content={`Severity ${e.severity} of 5`}>
                                <span className="shrink-0">
                                  <Badge
                                    tone={
                                      e.severity >= 4
                                        ? 'negative'
                                        : e.severity >= 3
                                          ? 'warning'
                                          : 'neutral'
                                    }
                                  >
                                    {e.severity}/5
                                  </Badge>
                                </span>
                              </Tip>
                            </li>
                          ))}
                        </ul>
                      </Panel>
                    ) : null}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
