import * as React from 'react'
import { Minus, Plus, Search, X } from 'lucide-react'
import type { EChartsOption } from 'echarts'
import { EChart, type ChartTokens } from '@/components/charts/EChart'
import { alpha, categoryAxis, valueAxis } from '@/components/charts/theme'
import {
  Badge,
  Button,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Segmented,
} from '@/components/ui/primitives'
import { AnimatedNumber, Readout, StatTile } from '@/components/ui/numbers'
import { useBudget, useFilter } from '@/data/hooks'
import { ROUTES } from '@/data/master/routes'
import { fmtINR, fmtINRCompact, fmtNumber, fmtPct } from '@/lib/format'

import type { BudgetRequest } from '@/data/worker/protocol'

/**
 * Travel Budget.
 *
 * A corporate travel programme is a portfolio of route exposures, and the question a
 * finance function actually asks is not "what will this cost" but "what should I
 * provision so that I am short less than one year in five".
 *
 * The simulation draws correlated route returns from the estimated covariance rather
 * than treating each leg as independent. That distinction is the whole reason to run a
 * simulation at all: independent legs would let the law of large numbers flatter the
 * tail, and the budget would be set too low precisely in the years it matters.
 *
 * The screen reports the mean and the percentiles together and never reports the mean
 * alone. A right-skewed cost distribution has a mean below its own 80th percentile,
 * and a budget set at the mean is under water most years.
 */

const PRESETS: { id: string; label: string; detail: string; legs: BudgetRequest['legs'] }[] = [
  {
    id: 'metro',
    label: 'Metro shuttle',
    detail: 'Weekly Delhi-Mumbai plus a monthly Bengaluru leg',
    legs: [
      { routeId: 'DEL-BOM', trips: 48 },
      { routeId: 'BOM-BLR', trips: 12 },
      { routeId: 'DEL-BLR', trips: 12 },
    ],
  },
  {
    id: 'audit',
    label: 'Regional audit programme',
    detail: 'Quarterly visits to six regional offices',
    legs: [
      { routeId: 'DEL-LKO', trips: 8 },
      { routeId: 'BOM-AMD', trips: 8 },
      { routeId: 'BLR-HYD', trips: 8 },
      { routeId: 'CCU-BBI', trips: 8 },
      { routeId: 'DEL-JAI', trips: 8 },
    ],
  },
  {
    id: 'field',
    label: 'Field survey round',
    detail: 'A statistical office running a national round',
    legs: [
      { routeId: 'DEL-GAU', trips: 6 },
      { routeId: 'CCU-IXB', trips: 6 },
      { routeId: 'BOM-GOI', trips: 6 },
      { routeId: 'MAA-COK', trips: 6 },
    ],
  },
]

export default function BudgetPage(): React.ReactElement {
  const filter = useFilter()
  const [legs, setLegs] = React.useState<BudgetRequest['legs']>(PRESETS[0]!.legs)
  const [draws, setDraws] = React.useState(20000)
  const [query, setQuery] = React.useState('')

  const request = React.useMemo<BudgetRequest | null>(
    () => (legs.length > 0 ? { legs, draws } : null),
    [legs, draws],
  )
  const { data, loading, error, refresh } = useBudget(request, filter)

  const available = React.useMemo(() => {
    const chosen = new Set(legs.map((l) => l.routeId))
    const q = query.trim().toUpperCase()
    return ROUTES.filter((r) => !chosen.has(r.id))
      .filter((r) => q.length === 0 || r.id.includes(q))
      .slice(0, query ? 12 : 8)
  }, [legs, query])

  const setTrips = (routeId: string, trips: number): void =>
    setLegs((prev) =>
      prev.map((l) => (l.routeId === routeId ? { ...l, trips: Math.max(1, trips) } : l)),
    )

  const addLeg = (routeId: string): void => {
    setLegs((prev) => [...prev, { routeId, trips: 6 }])
    setQuery('')
  }

  const removeLeg = (routeId: string): void =>
    setLegs((prev) => prev.filter((l) => l.routeId !== routeId))

  const totalTrips = legs.reduce((s, l) => s + l.trips, 0)
  const pointEstimate = data ? data.legDetail.reduce((s, l) => s + l.contribution, 0) : NaN

  const histogramOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const marks = [
        { value: data.p50, label: 'p50', colour: tok.muted },
        { value: data.p80, label: 'p80', colour: tok.warning },
        { value: data.p95, label: 'p95', colour: tok.negative },
      ]
      return {
        grid: { left: 4, right: 10, top: 18, bottom: 4, containLabel: true },
        legend: { show: false },
        xAxis: categoryAxis(tok, {
          data: data.histogram.map((h) => fmtINRCompact(h.x)),
          boundaryGap: true,
          axisLabel: { color: tok.faint, fontSize: 10, hideOverlap: true },
        }),
        yAxis: valueAxis(tok, { axisLabel: { color: tok.faint, fontSize: 10 } }),
        tooltip: {
          trigger: 'axis',
          formatter: (p: unknown) => {
            const arr = p as { dataIndex: number }[]
            const b = data.histogram[arr[0]!.dataIndex]!
            return `${fmtINR(b.x)}<br/><b>${fmtNumber(b.count)}</b> of ${fmtNumber(draws)} draws`
          },
        },
        series: [
          {
            type: 'bar',
            barCategoryGap: '8%',
            itemStyle: { color: alpha(tok.accent, 0.62) },
            data: data.histogram.map((h) => h.count),
            markLine: {
              silent: true,
              symbol: 'none',
              data: marks.map((m) => ({
                xAxis: nearestBin(data.histogram, m.value),
                lineStyle: { color: m.colour, type: 'dashed', width: 1.2 },
                label: {
                  formatter: m.label,
                  color: m.colour,
                  fontSize: 10,
                  position: 'insideEndTop',
                },
              })),
            },
          },
        ],
      }
    },
    [data, draws],
  )

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        kicker="Analysis"
        title="Travel Budget"
        description="A planned travel programme costed by simulation rather than by multiplication. Route returns are drawn together, because the routes move together."
        actions={
          <Segmented
            ariaLabel="Simulation draws"
            value={String(draws)}
            onChange={(v) => setDraws(Number(v))}
            options={[
              { value: '5000', label: '5k' },
              { value: '20000', label: '20k' },
              { value: '50000', label: '50k' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile
          label="Median outturn"
          value={data ? data.p50 : NaN}
          format={(v) => fmtINR(v)}
          secondary={`${fmtNumber(totalTrips)} trips`}
          info="The 50th percentile of simulated annual cost. Half the simulated years come in below this."
        />
        <StatTile
          label="Budget at p80"
          value={data ? data.p80 : NaN}
          format={(v) => fmtINR(v)}
          secondary={
            data ? `${fmtPct(((data.p80 - data.p50) / data.p50) * 100, 1)} over median` : undefined
          }
          info="Provision here and you are short roughly one year in five. This is the number a finance function usually wants, and it is not the mean."
        />
        <StatTile
          label="Budget at p95"
          value={data ? data.p95 : NaN}
          format={(v) => fmtINR(v)}
          secondary={
            data ? `${fmtPct(((data.p95 - data.p50) / data.p50) * 100, 1)} over median` : undefined
          }
          info="One year in twenty exceeds this. The gap between p80 and p95 is the cost of the last four percentage points of confidence."
        />
        <StatTile
          label="Shortfall"
          value={data ? data.cvar95 : NaN}
          format={(v) => fmtINR(v)}
          secondary="mean overrun in a breach year"
          info="Conditional value at risk: the average cost in the simulated years that do exceed the 95th percentile. It answers how bad a bad year is, which the percentile itself does not."
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="The programme"
            subtitle={`${legs.length} ${legs.length === 1 ? 'route' : 'routes'} · ${fmtNumber(totalTrips)} trips a year`}
            actions={
              <Segmented
                ariaLabel="Preset programme"
                size="sm"
                value=""
                onChange={(v) => {
                  const preset = PRESETS.find((p) => p.id === v)
                  if (preset) setLegs(preset.legs)
                }}
                options={PRESETS.map((p) => ({ value: p.id, label: p.label, title: p.detail }))}
              />
            }
          />

          <div className="flex flex-col gap-2 p-3 sm:p-4">
            {legs.length === 0 ? (
              <EmptyState
                title="No routes in the programme"
                detail="Add a route below, or pick one of the preset programmes above."
              />
            ) : (
              legs.map((leg) => {
                const detail = data?.legDetail.find((d) => d.routeId === leg.routeId)
                const share =
                  detail && Number.isFinite(pointEstimate) && pointEstimate > 0
                    ? detail.contribution / pointEstimate
                    : 0
                return (
                  <div
                    key={leg.routeId}
                    className="rounded border border-line bg-elevated/40 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-xs font-medium text-ink">{leg.routeId}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`One fewer trip on ${leg.routeId}`}
                          onClick={() => setTrips(leg.routeId, leg.trips - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <span className="num w-8 text-center text-xs text-ink">{leg.trips}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`One more trip on ${leg.routeId}`}
                          onClick={() => setTrips(leg.routeId, leg.trips + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${leg.routeId}`}
                          onClick={() => removeLeg(leg.routeId)}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </div>
                    {detail ? (
                      <>
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-500"
                            style={{ width: `${share * 100}%` }}
                          />
                        </div>
                        <p className="mt-1 text-2xs text-faint">
                          {fmtINR(detail.meanFare)} mean fare &middot;{' '}
                          <span className="num text-muted">{fmtINR(detail.contribution)}</span> at
                          today&rsquo;s prices &middot; {(share * 100).toFixed(0)}% of the
                          programme
                        </p>
                      </>
                    ) : null}
                  </div>
                )
              })
            )}

            <div className="mt-1 border-t border-line pt-3">
              <label htmlFor="route-search" className="label-caps mb-1.5 block">
                Add a route
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
                  aria-hidden
                />
                <input
                  id="route-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="DEL, BOM-BLR..."
                  className="tap h-8 w-full rounded border border-line bg-surface pl-7 pr-2 text-xs text-ink placeholder:text-faint"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {available.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => addLeg(r.id)}
                    className="tap num rounded border border-line px-2 py-1 text-2xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
                  >
                    + {r.id}
                  </button>
                ))}
                {available.length === 0 ? (
                  <span className="text-2xs text-faint">No matching route.</span>
                ) : null}
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="xl:col-span-3">
          <PanelHeader
            title="Simulated annual cost"
            subtitle={`${fmtNumber(draws)} correlated draws`}
            info="Each draw resamples a year of monthly route returns jointly, applies them to the current mean fare on each leg, and totals the programme. Legs on correlated routes therefore move together, which is what fattens the upper tail."
          />
          {error ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : loading || !data ? (
            <ChartSkeleton height={300} />
          ) : (
            <>
              <EChart
                option={histogramOption}
                height={300}
                mobileHeight={240}
                ariaLabel="Distribution of simulated annual travel cost"
              />
              <div className="grid grid-cols-2 gap-3 border-t border-line p-3 sm:grid-cols-4 sm:p-4">
                <Readout
                  label="At today's prices"
                  value={<AnimatedNumber value={pointEstimate} format={(v) => fmtINR(v)} />}
                  info="Mean fare times trips, with no uncertainty at all. This is the number a spreadsheet produces, and it sits well below the p80."
                />
                <Readout
                  label="Simulated mean"
                  value={<AnimatedNumber value={data.mean} format={(v) => fmtINR(v)} />}
                />
                <Readout
                  label="Skew premium"
                  value={fmtPct(((data.p80 - data.mean) / data.mean) * 100, 1)}
                  tone="warning"
                  info="How far the p80 sits above the mean. A symmetric distribution would put this near zero; fares are not symmetric."
                />
                <Readout
                  label="Value at risk"
                  value={<AnimatedNumber value={data.var95} format={(v) => fmtINR(v)} />}
                  info="The overrun against the median at the 95th percentile."
                />
              </div>
            </>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Why not just multiply" />
        <div className="grid gap-3 p-3 text-xs leading-relaxed text-muted sm:grid-cols-3 sm:p-4">
          <p>
            <span className="text-ink">The mean is the wrong number.</span> Fare
            distributions are right-skewed: a few months run far above the median and
            none run symmetrically far below, because fares are bounded below and not
            above. A budget set at the mean is therefore under water in more than half
            of the simulated years.
          </p>
          <p>
            <span className="text-ink">The legs are not independent.</span> Fuel, season
            and capacity move most Indian trunk routes together. Treating each leg as an
            independent draw would cancel the shocks against each other and produce a
            tail that is far too thin &mdash; the failure mode would only appear in the
            year the provision was needed.
          </p>
          <p>
            <span className="text-ink">The window is yours to choose.</span> Everything
            here is estimated from the date range in the bar at the top of the screen. A
            programme costed on a twelve-month window that happened to be calm will
            under-provision; widen the window and watch the upper percentiles move.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5 sm:px-4">
          <Badge tone="warning">Not advice</Badge>
          <span className="text-2xs text-faint">
            Synthetic data for demonstration. These figures describe a generated panel,
            not any actual fare.
          </span>
        </div>
      </Panel>
    </div>
  )
}

/** The bin whose centre is closest to a percentile, for placing a marker line. */
function nearestBin(histogram: readonly { x: number }[], value: number): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < histogram.length; i++) {
    const d = Math.abs(histogram[i]!.x - value)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

