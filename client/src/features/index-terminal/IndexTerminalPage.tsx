import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import { EChart, type ChartTokens } from '@/components/charts/EChart'
import type { EChartsOption } from 'echarts'
import { alpha, categoryAxis, valueAxis } from '@/components/charts/theme'
import {
  Badge,
  ChartSkeleton,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Segmented,
  TileGrid,
  Tip,
} from '@/components/ui/primitives'
import { ProvValue, Readout, StatTile } from '@/components/ui/numbers'
import { useFilter, useIndices } from '@/data/hooks'
import { useApp } from '@/data/store'
import { fmtIndex, fmtMonth, fmtMonthShort, fmtNumber, fmtPct, fmtPP, fmtShare } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { IndexDto } from '@/data/worker/protocol'

/**
 * The Index Terminal.
 *
 * Reads top to bottom as a published statistic would: the headline rate, the series
 * with its interval, what moved this month, and the data-quality position. The
 * confidence ribbon and the imputation figure are given the same visual weight as the
 * index itself, because a number published without them is not a statistic.
 */

type SeriesMode = 'published' | 'adjusted' | 'both'

function yoy(values: readonly number[], t: number): number {
  if (t < 12) return NaN
  const a = values[t - 12]
  const b = values[t]
  if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b) || a === 0) {
    return NaN
  }
  return (b / a - 1) * 100
}

function mom(values: readonly number[], t: number): number {
  if (t < 1) return NaN
  const a = values[t - 1]
  const b = values[t]
  if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b) || a === 0) {
    return NaN
  }
  return (b / a - 1) * 100
}

function TopMovers({ data, t }: { data: IndexDto; t: number }): React.ReactElement {
  const movers = React.useMemo(() => {
    return data.routeStrata
      .map((s) => ({ ...s, change: mom(s.values, t) }))
      .filter((s) => Number.isFinite(s.change))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 8)
  }, [data, t])

  if (movers.length === 0) {
    return <p className="p-3 text-2xs text-faint">No route moved measurably this month.</p>
  }

  return (
    <ul className="divide-y divide-line">
      {movers.map((m) => (
        <li key={m.key} className="flex items-center gap-2.5 px-3 py-2 sm:px-4">
          <Link
            to={`/routes?route=${m.key}`}
            className="num w-[4.5rem] shrink-0 text-xs text-ink transition-colors hover:text-accent"
          >
            {m.label}
          </Link>
          <span className="hidden flex-1 text-2xs text-faint sm:block">
            weight {fmtShare(m.weight, 2)}
          </span>
          <div className="flex flex-1 items-center gap-2 sm:flex-none">
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-elevated sm:w-24 sm:flex-none">
              <div
                className={cn(
                  'absolute top-0 h-full rounded-full',
                  m.change > 0 ? 'bg-neg' : 'bg-pos',
                )}
                style={{
                  width: `${Math.min(100, (Math.abs(m.change) / 12) * 100)}%`,
                  left: m.change > 0 ? '50%' : undefined,
                  right: m.change <= 0 ? '50%' : undefined,
                }}
              />
              <div className="absolute left-1/2 top-0 h-full w-px bg-line-strong" />
            </div>
            <ProvValue
              provenance={{
                label: `${m.label} month-on-month`,
                value: m.change,
                method: 'Route index, Time Product Dummy',
                unit: 'percent',
                periodIdx: t,
                routeId: m.key,
              }}
              className={cn(
                'w-14 shrink-0 text-right text-xs',
                m.change > 0 ? 'text-neg' : 'text-pos',
              )}
            >
              {fmtPct(m.change, 1)}
            </ProvValue>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function IndexTerminalPage(): React.ReactElement {
  const filter = useFilter()
  const { data, loading, error, refresh } = useIndices(filter)
  const periodFrom = useApp((s) => s.periodFrom)
  const [mode, setMode] = React.useState<SeriesMode>('published')

  const t = data ? data.periods.length - 1 : 0
  const headline = data?.national[t] ?? NaN
  const yoyRate = data ? yoy(data.national, t) : NaN
  const momRate = data ? mom(data.national, t) : NaN
  const totalObs = data?.nObservations ?? 0

  const chartOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const months = data.periods.map(fmtMonthShort)
      const lower = data.confidence.lower
      const upper = data.confidence.upper

      const series: Record<string, unknown>[] = [
        // The ribbon is drawn as a transparent base plus a stacked band, which is the
        // standard ECharts way to get a filled interval without a custom series.
        {
          name: 'ci-lower',
          type: 'line',
          stack: 'ci',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0 },
          silent: true,
          tooltip: { show: false },
          data: lower,
          z: 1,
        },
        {
          name: '95% interval',
          type: 'line',
          stack: 'ci',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          itemStyle: { color: alpha(tok.accent, 0.35) },
          areaStyle: { color: alpha(tok.accent, 0.13) },
          silent: true,
          data: upper.map((u, i) =>
            Number.isFinite(u) && Number.isFinite(lower[i]!) ? u - lower[i]! : 0,
          ),
          z: 1,
        },
      ]

      // Prior vintages as ghost lines. They are drawn under everything and are not
      // interactive - they are context, not a series the reader should compare tick by
      // tick.
      for (const v of data.vintages) {
        series.push({
          name: v.label,
          type: 'line',
          symbol: 'none',
          smooth: false,
          silent: true,
          lineStyle: { width: 1, color: tok.faint, opacity: 0.45, type: 'solid' },
          itemStyle: { color: tok.faint },
          data: v.values,
          z: 2,
        })
      }

      if (mode !== 'adjusted') {
        series.push({
          name: 'APIx (published)',
          type: 'line',
          symbol: 'none',
          smooth: false,
          lineStyle: { width: 2, color: tok.accent },
          itemStyle: { color: tok.accent },
          data: data.national,
          z: 5,
          markLine:
            data.periods.length > 12
              ? {
                  silent: true,
                  symbol: 'none',
                  label: { show: false },
                  lineStyle: { color: tok.grid, type: 'dashed' },
                  data: [{ yAxis: 100 }],
                }
              : undefined,
        })
      }
      if (mode !== 'published') {
        series.push({
          name: 'Seasonally adjusted',
          type: 'line',
          symbol: 'none',
          smooth: false,
          lineStyle: { width: 1.75, color: '#7AA5E8', type: mode === 'both' ? 'dashed' : 'solid' },
          itemStyle: { color: '#7AA5E8' },
          data: data.seasonallyAdjusted,
          z: 4,
        })
      }

      return {
        grid: { left: 4, right: 8, top: 26, bottom: 4, containLabel: true },
        legend: {
          top: 0,
          left: 0,
          data: [
            ...(mode !== 'adjusted' ? ['APIx (published)'] : []),
            ...(mode !== 'published' ? ['Seasonally adjusted'] : []),
            '95% interval',
            ...data.vintages.map((v) => v.label),
          ],
        },
        xAxis: categoryAxis(tok, { data: months }),
        // The axis name is deliberately not set: with the legend pinned to the top of
        // the grid it collides at narrow widths, and the base period is already stated
        // in the panel subtitle where it reads better anyway.
        yAxis: valueAxis(tok, { scale: true }),
        tooltip: {
          valueFormatter: (v: unknown) =>
            typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '--',
        },
        series,
      }
    },
    [data, mode],
  )

  if (error) {
    return (
      <Panel>
        <ErrorState message={error} onRetry={refresh} />
      </Panel>
    )
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        kicker="Airfare Price Index"
        title="APIx national index"
        description={
          <>
            A constant-quality price index for Indian domestic airfares, aggregated from
            route level with DGCA passenger weights. The interval is a block bootstrap
            clustered on route. Every figure on this page opens its own provenance.
          </>
        }
        actions={
          data ? (
            <Badge tone={data.sourcesUsed.length < 7 ? 'warning' : 'neutral'}>
              {data.sourcesUsed.length} sources &middot; {fmtNumber(totalObs)} observations
            </Badge>
          ) : null
        }
      />

      <TileGrid>
        {loading || !data ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="panel p-3">
              <ChartSkeleton height={68} />
            </div>
          ))
        ) : (
          <>
            <StatTile
              label="Index level"
              value={headline}
              format={(v) => fmtIndex(v)}
              secondary={`${fmtMonth(data.periods[t]!)} · base ${fmtMonth(data.periods[0]!)} = 100`}
              provenance={{
                label: 'APIx national index',
                value: headline,
                method: 'Route-level TPD, DGCA-weighted aggregation',
                unit: 'index',
                periodIdx: t,
              }}
              info="Route indices estimated by Time Product Dummy, then aggregated with DGCA passenger weights. The base is the first month in the selected window."
            />
            <StatTile
              label="Year on year"
              value={yoyRate}
              format={(v) => fmtPct(v, 2)}
              delta={yoyRate}
              goodDirection="down"
              secondary="vs the same month last year"
              provenance={{
                label: 'APIx year-on-year rate',
                value: yoyRate,
                method: 'Year-on-year change in the national index',
                unit: 'percent',
                periodIdx: t,
              }}
              info="Comparing a month with the same month a year earlier cancels the seasonal factor. Airfare seasonality is large enough that an endpoint-to-endpoint comparison would be dominated by it."
            />
            <StatTile
              label="Month on month"
              value={momRate}
              format={(v) => fmtPct(v, 2)}
              delta={momRate}
              goodDirection="down"
              secondary="not seasonally adjusted"
              provenance={{
                label: 'APIx month-on-month change',
                value: momRate,
                method: 'Month-on-month change in the national index',
                unit: 'percent',
                periodIdx: t,
              }}
              info="Unadjusted. For a month-on-month read that is comparable across the year, use the seasonally adjusted series on the chart."
            />
            <StatTile
              label="Observations"
              value={totalObs}
              format={(v) => fmtNumber(Math.round(v))}
              secondary={`${fmtShare(data.imputation.imputedRate, 1)} of cells imputed`}
              info="Quotes contributing to this window after filters. The imputation rate is the share of product-period cells that had to be filled by interpolation inside a product's observed life."
            />
          </>
        )}
      </TileGrid>

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="National index"
            subtitle={
              data
                ? `Index, ${fmtMonth(data.periods[0]!)} = 100 · ${data.confidence.method}, ${data.confidence.replicates} replicates`
                : undefined
            }
            info={data?.confidence.caveat}
            actions={
              <Segmented<SeriesMode>
                ariaLabel="Series shown"
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'published', label: 'Published' },
                  { value: 'adjusted', label: 'SA' },
                  { value: 'both', label: 'Both' },
                ]}
              />
            }
          />
          {loading || !data ? (
            <ChartSkeleton height={330} />
          ) : (
            <div className="p-1.5 sm:p-2">
              <EChart
                ariaLabel="National airfare price index over time with a 95 percent confidence ribbon"
                option={chartOption}
                height={340}
                mobileHeight={260}
              />
            </div>
          )}
          {data ? (
            <div className="grid grid-cols-2 gap-3 border-t border-line px-3 py-2.5 sm:grid-cols-4 sm:px-4">
              <Readout
                label="Interval width"
                value={
                  Number.isFinite(data.confidence.upper[t]!)
                    ? `${(data.confidence.upper[t]! - data.confidence.lower[t]!).toFixed(2)} pts`
                    : '--'
                }
                info="Width of the 95% block-bootstrap interval in the latest month."
              />
              <Readout
                label="Weight covered"
                value={fmtShare(data.coverage[t] ?? 0, 1)}
                tone={(data.coverage[t] ?? 0) < 0.9 ? 'warning' : 'default'}
                info="Share of DGCA passenger weight represented by routes with an index in this month."
              />
              <Readout
                label="Matched products"
                value={fmtNumber(
                  data.methods.find((m) => m.method === 'rygeks-fews')?.matched[t] ?? 0,
                )}
              />
              <Readout
                label="Compute"
                value={`${Math.round(data.computeMs)} ms`}
                info="Time to recompute every series on this page from the raw panel, in a Web Worker."
              />
            </div>
          ) : null}
        </Panel>

        <div className="flex flex-col gap-3 sm:gap-4">
          <Panel>
            <PanelHeader
              title="Top movers"
              subtitle={data ? `Month-on-month, ${fmtMonth(data.periods[t]!)}` : undefined}
              info="Largest absolute month-on-month moves among route-level indices. Red is a price increase - for a price index, up is not good news."
            />
            {loading || !data ? <ChartSkeleton height={260} /> : <TopMovers data={data} t={t} />}
          </Panel>

          <Panel>
            <PanelHeader
              title="Why this is not an average"
              subtitle="The case the Method Lab makes in full"
            />
            <div className="flex flex-col gap-3 p-3 sm:p-4">
              {loading || !data ? (
                <ChartSkeleton height={120} />
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {data.divergencePP > 0 ? (
                        <TrendingUp className="h-4 w-4 text-neg" aria-hidden />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-pos" aria-hidden />
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted">
                      A naive average of the same collected fares implies an annual rate
                      of{' '}
                      <Tip content="Arithmetic mean of every fare collected in the month, with no matching and no quality adjustment.">
                        <span className="num cursor-help text-neg">
                          {fmtPct(data.avgYoyByMethod['naive-mean'] ?? NaN, 2)}
                        </span>
                      </Tip>
                      . The constant-quality index reports{' '}
                      <Tip content="RYGEKS with a fixed-effects window splice: transitive, uses every product, never revises.">
                        <span className="num cursor-help text-accent">
                          {fmtPct(data.avgYoyByMethod['rygeks-fews'] ?? NaN, 2)}
                        </span>
                      </Tip>
                      .
                    </p>
                  </div>
                  <div className="rounded border border-line bg-elevated/40 p-3">
                    <p className="label-caps">Overstatement</p>
                    <p className="num mt-1 text-2xl font-semibold text-neg">
                      {fmtPP(data.divergencePP, 2)}
                    </p>
                    <p className="mt-1.5 text-2xs leading-relaxed text-faint">
                      The gap is composition, not price. Over this window the collected
                      sample shifted toward short booking horizons, full-service carriers
                      and premium cabins.
                    </p>
                  </div>
                  <Link
                    to="/methods"
                    className="tap flex items-center justify-between gap-2 rounded border border-line px-3 py-2 text-xs text-ink transition-colors hover:border-accent/50 hover:text-accent"
                  >
                    Open the Method Lab
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {data ? (
        <p className="px-1 text-[0.625rem] leading-relaxed text-faint">
          Window {fmtMonth(data.periods[0]!)} to {fmtMonth(data.periods[data.periods.length - 1]!)}
          {periodFrom > 0 ? ' (narrowed)' : ''}. Synthetic data generated in-browser for
          demonstration; not an official statistic.
        </p>
      ) : null}
    </div>
  )
}
