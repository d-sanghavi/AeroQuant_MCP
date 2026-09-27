import * as React from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { EChart, type ChartTokens } from '@/components/charts/EChart'
import type { EChartsOption } from 'echarts'
import { categoryAxis, SERIES_COLOURS, valueAxis } from '@/components/charts/theme'
import {
  Badge,
  Button,
  ChartSkeleton,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Switch,
  Tip,
} from '@/components/ui/primitives'
import { ProvValue, Readout } from '@/components/ui/numbers'
import { useFilter, useIndices } from '@/data/hooks'
import { useApp } from '@/data/store'
import { fmtIndex, fmtMonth, fmtMonthShort, fmtPct, fmtPP, fmtShare } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The Method Lab.
 *
 * Six formulae, one dataset, and a visible disagreement. The argument runs in three
 * beats and the layout follows it exactly:
 *
 *   1. The series diverge.                      (the chart)
 *   2. Here is why - the sample composition moved. (the drift toggle)
 *   3. And here is the formal test each one fails. (the drift table)
 *
 * The composition overlay is the load-bearing element. Without it the chart is just
 * six lines that disagree, which invites the reply "so which one is right?". With it
 * the reader can see that the naive line is tracking the share of short-horizon
 * quotes rather than tracking prices.
 */

const METHOD_COLOUR: Record<string, string> = {
  'naive-mean': SERIES_COLOURS[5],
  median: SERIES_COLOURS[4],
  carli: SERIES_COLOURS[2],
  dutot: SERIES_COLOURS[3],
  'jevons-fixed': SERIES_COLOURS[1],
  'rygeks-fews': SERIES_COLOURS[0],
}

export default function MethodLabPage(): React.ReactElement {
  const filter = useFilter()
  const { data, loading, error, refresh } = useIndices(filter)
  const periodFrom = useApp((s) => s.periodFrom)
  const periodTo = useApp((s) => s.periodTo)
  const [showComposition, setShowComposition] = React.useState(false)
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())

  const t = data ? data.periods.length - 1 : 0
  const shortWindow = periodTo - periodFrom + 1 < 13

  const toggle = (method: string): void => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(method)) next.delete(method)
      else next.add(method)
      return next
    })
  }

  const option = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const months = data.periods.map(fmtMonthShort)

      const series: Record<string, unknown>[] = data.methods
        .filter((m) => !hidden.has(m.method))
        .map((m) => ({
          name: m.label,
          type: 'line',
          symbol: 'none',
          smooth: false,
          lineStyle: {
            width: m.method === 'rygeks-fews' ? 2.4 : m.isComparator ? 1.5 : 1.9,
            color: METHOD_COLOUR[m.method],
            type: m.isComparator ? 'dashed' : 'solid',
          },
          itemStyle: { color: METHOD_COLOUR[m.method] },
          emphasis: { focus: 'series' },
          data: m.values,
          z: m.method === 'rygeks-fews' ? 6 : 3,
        }))

      if (showComposition) {
        series.push(
          {
            name: 'Share of quotes at T-7 or sooner',
            type: 'line',
            yAxisIndex: 1,
            symbol: 'none',
            smooth: true,
            lineStyle: { width: 1.25, color: tok.warning, type: 'dotted' },
            itemStyle: { color: tok.warning },
            areaStyle: { color: tok.warning, opacity: 0.07 },
            data: data.periodStats.map((s) => s.shortHorizonShare * 100),
            z: 1,
          },
          {
            name: 'Share of full-service carrier quotes',
            type: 'line',
            yAxisIndex: 1,
            symbol: 'none',
            smooth: true,
            lineStyle: { width: 1.25, color: tok.negative, type: 'dotted' },
            itemStyle: { color: tok.negative },
            data: data.periodStats.map((s) => s.fscShare * 100),
            z: 1,
          },
        )
      }

      return {
        grid: { left: 4, right: showComposition ? 4 : 8, top: 34, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0, type: 'scroll' },
        xAxis: categoryAxis(tok, { data: months }),
        yAxis: [
          valueAxis(tok, { scale: true }),
          valueAxis(tok, {
            show: showComposition,
            scale: true,
            splitLine: { show: false },
            axisLabel: { color: tok.warning, fontSize: 10, formatter: '{value}%' },
          }),
        ],
        tooltip: {
          valueFormatter: (v: unknown) =>
            typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '--',
        },
        series,
      }
    },
    [data, showComposition, hidden],
  )

  if (error) {
    return (
      <Panel>
        <ErrorState message={error} onRetry={refresh} />
      </Panel>
    )
  }

  const naiveYoy = data?.avgYoyByMethod['naive-mean'] ?? NaN
  const rygeksYoy = data?.avgYoyByMethod['rygeks-fews'] ?? NaN
  const first = data?.periodStats[0]
  const lastStat = data?.periodStats[data.periodStats.length - 1]

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        kicker="Method comparison"
        title="An average of scraped fares is not a price index"
        description={
          <>
            All six series below are computed from the same observations, over the same
            window, with the same filters. They disagree because the formula matters, and
            because the composition of what was collected changed. Narrow the window and
            every number here recomputes.
          </>
        }
      />

      {/* --- the headline --------------------------------------------------- */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel className="justify-center p-4 sm:p-5">
          <p className="label-caps">
            {shortWindow ? 'Annualised divergence' : 'Divergence in the annual rate'}
          </p>
          {loading || !data ? (
            <ChartSkeleton height={120} />
          ) : (
            <>
              <p className="num mt-2 text-4xl font-semibold leading-none text-neg sm:text-5xl">
                {fmtPP(data.divergencePP, 2)}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Over this window a naive mean of collected fares implies an annual rate
                of <span className="num text-neg">{fmtPct(naiveYoy, 2)}</span>. The
                constant-quality index says{' '}
                <span className="num text-accent">{fmtPct(rygeksYoy, 2)}</span>. The
                difference is{' '}
                <span className="text-ink">composition, not price</span>.
              </p>
              <p className="mt-2 text-2xs leading-relaxed text-faint">
                {shortWindow
                  ? 'This window is shorter than 13 months, so there is no matching month a year earlier. Rates are annualised from the window instead.'
                  : 'Rates are the average across every 12-month pair in the window, which covers each calendar month once and so is seasonally balanced without adjustment. The point year-on-year for a single month is far noisier - festivals move by weeks between years.'}
              </p>
              <div className="mt-4 border-t border-line pt-3">
                <Switch
                  checked={showComposition}
                  onChange={setShowComposition}
                  label="Show composition drift"
                  description="Overlay the share of short-horizon and full-service-carrier quotes on a second axis."
                />
              </div>
              {showComposition && first && lastStat ? (
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <Readout
                    label="Quotes at T-7 or sooner"
                    value={`${fmtShare(first.shortHorizonShare, 1)} → ${fmtShare(lastStat.shortHorizonShare, 1)}`}
                    tone="warning"
                  />
                  <Readout
                    label="Full-service carrier share"
                    value={`${fmtShare(first.fscShare, 1)} → ${fmtShare(lastStat.fscShare, 1)}`}
                    tone="warning"
                  />
                  <Readout
                    label="Premium cabin share"
                    value={`${fmtShare(first.premiumShare, 1)} → ${fmtShare(lastStat.premiumShare, 1)}`}
                    tone="warning"
                  />
                  <Readout
                    label="Mean booking horizon"
                    value={`${first.meanHorizonDays.toFixed(1)}d → ${lastStat.meanHorizonDays.toFixed(1)}d`}
                    tone="warning"
                  />
                </dl>
              ) : null}
            </>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Six methods, identical data"
            subtitle={
              data
                ? `Index, ${fmtMonth(data.periods[0]!)} = 100 · dashed lines are comparators, not candidates${showComposition ? ' · right axis: share of quotes' : ''}`
                : undefined
            }
            info="Every series is computed from the same product-by-period matrix produced by the same filter. Nothing is filtered differently per method - that is what makes the comparison meaningful."
          />
          {loading || !data ? (
            <ChartSkeleton height={360} />
          ) : (
            <div className="p-1.5 sm:p-2">
              <EChart
                ariaLabel="Six airfare index methods computed on identical data, showing divergence over the window"
                option={option}
                height={370}
                mobileHeight={280}
              />
            </div>
          )}
        </Panel>
      </div>

      {/* --- per-method table ------------------------------------------------ */}
      <Panel>
        <PanelHeader
          title="Method by method"
          subtitle="Select a row to hide or show that series on the chart"
        />
        {loading || !data ? (
          <ChartSkeleton height={260} />
        ) : (
          <>
            {/* Table from the tablet band up. */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[46rem] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-4 py-2 font-medium text-faint">Method</th>
                    <th className="px-3 py-2 text-right font-medium text-faint">Level</th>
                    <th className="px-3 py-2 text-right font-medium text-faint">
                      <Tip content="Average across every 12-month pair in the window. Seasonally balanced by construction.">
                        <span className="cursor-help">
                          {shortWindow ? 'Annualised' : 'Annual rate'}
                        </span>
                      </Tip>
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-faint">
                      Items matched
                    </th>
                    <th className="px-4 py-2 font-medium text-faint">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.methods.map((m) => {
                    const off = hidden.has(m.method)
                    return (
                      <tr
                        key={m.method}
                        className={cn(
                          'border-b border-line/70 transition-colors last:border-0 hover:bg-elevated/40',
                          off && 'opacity-40',
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggle(m.method)}
                            className="flex items-center gap-2 text-left"
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{ background: METHOD_COLOUR[m.method] }}
                              aria-hidden
                            />
                            <span className="font-medium text-ink">{m.label}</span>
                          </button>
                          <p className="mt-1 max-w-xl text-2xs leading-relaxed text-faint">
                            {m.note}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <ProvValue
                            provenance={{
                              label: m.label,
                              value: m.values[t]!,
                              method: m.label,
                              unit: 'index',
                              periodIdx: t,
                            }}
                            className="text-ink"
                          >
                            {fmtIndex(m.values[t]!)}
                          </ProvValue>
                        </td>
                        <td
                          className={cn(
                            'num px-3 py-2.5 text-right',
                            m.isComparator ? 'text-neg' : 'text-accent',
                          )}
                        >
                          {fmtPct(data.avgYoyByMethod[m.method] ?? NaN, 2)}
                        </td>
                        <td className="num px-3 py-2.5 text-right text-muted">
                          {m.matched[t]?.toLocaleString('en-IN') ?? '--'}
                        </td>
                        <td className="px-4 py-2.5">
                          {m.isComparator ? (
                            <Badge tone="negative">Comparator</Badge>
                          ) : (
                            <Badge tone="accent">Candidate</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Stacked cards on phones - a five-column table at 375px is unreadable. */}
            <ul className="divide-y divide-line sm:hidden">
              {data.methods.map((m) => (
                <li key={m.method} className={cn('p-3', hidden.has(m.method) && 'opacity-40')}>
                  <button
                    type="button"
                    onClick={() => toggle(m.method)}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: METHOD_COLOUR[m.method] }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-ink">{m.label}</span>
                      <span className="mt-1 block text-2xs leading-relaxed text-faint">
                        {m.note}
                      </span>
                    </span>
                  </button>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Readout label="Level" value={fmtIndex(m.values[t]!)} />
                    <Readout
                      label={shortWindow ? 'Annualised' : 'Annual rate'}
                      value={fmtPct(data.avgYoyByMethod[m.method] ?? NaN, 2)}
                      tone={m.isComparator ? 'negative' : 'accent'}
                    />
                    <Readout
                      label="Matched"
                      value={m.matched[t]?.toLocaleString('en-IN') ?? '--'}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {/* --- drift diagnostics ---------------------------------------------- */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="Drift diagnostics"
            subtitle="Two different faults, tested separately"
            info="Time reversal is a property of the formula: P(0,1) x P(1,0) must equal 1. Chain drift is a property of the formula applied to a changing sample: the chained product must equal the direct comparison."
          />
          {loading || !data ? (
            <ChartSkeleton height={200} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-4 py-2 font-medium text-faint">Formula</th>
                    <th className="px-3 py-2 text-right font-medium text-faint">
                      <Tip content="Forward chain times reverse chain, minus one. Zero means the formula satisfies time reversal.">
                        <span className="cursor-help">Time reversal</span>
                      </Tip>
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-faint">
                      <Tip content="Chained level divided by the direct first-to-last comparison, minus one. Non-zero means the matched sample churned between links.">
                        <span className="cursor-help">Chain vs direct</span>
                      </Tip>
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-faint">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {data.drift.map((d) => (
                    <tr key={d.method} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-2.5 text-ink">{d.method}</td>
                      <td
                        className={cn(
                          'num px-3 py-2.5 text-right',
                          Math.abs(d.timeReversalDrift) > 0.002 ? 'text-neg' : 'text-muted',
                        )}
                      >
                        {fmtPct(d.timeReversalDrift * 100, 3, false)}
                      </td>
                      <td
                        className={cn(
                          'num px-3 py-2.5 text-right',
                          Math.abs(d.chainVsDirect) > 0.002 ? 'text-neg' : 'text-muted',
                        )}
                      >
                        {fmtPct(d.chainVsDirect * 100, 3, false)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {d.passes ? (
                          <Badge tone="positive">
                            <Check className="h-3 w-3" aria-hidden /> passes
                          </Badge>
                        ) : (
                          <Badge tone="negative">
                            <AlertTriangle className="h-3 w-3" aria-hidden /> fails
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-4 py-2.5 text-ink">RYGEKS-FEWS (published)</td>
                    <td className="num px-3 py-2.5 text-right text-muted">0.000%</td>
                    <td className="num px-3 py-2.5 text-right text-muted">0.000%</td>
                    <td className="px-4 py-2.5 text-right">
                      <Badge tone="accent">transitive by construction</Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="What a non-specialist needs to know" />
          <div className="flex flex-col gap-3 p-4 text-xs leading-relaxed text-muted">
            <p>
              Airline seats are not one product. The same flight is a different product at
              two days&rsquo; notice than at ninety, in business than in economy, on a
              full-service carrier than a low-cost one &mdash; and those differences
              account for most of the variation in what people pay.
            </p>
            <p>
              A collector that gathers whatever it can will gather a different{' '}
              <span className="text-ink">mix</span> of those products each month. When the
              mix shifts toward the expensive end, the average of what was collected rises
              even if no airline changed a single fare. That is what the dotted overlay
              shows.
            </p>
            <p>
              A price index is built to avoid that. It compares{' '}
              <span className="text-ink">like with like</span> &mdash; the same product
              this month against itself last month &mdash; and where a product appears or
              disappears, it adjusts for the characteristics that changed rather than
              letting the change leak into the price.
            </p>
            <p className="rounded border border-accent/30 bg-accent/5 p-2.5 text-accent">
              On this window the two answers differ by {data ? fmtPP(data.divergencePP, 1) : '--'}.
              On a published consumer price statistic that is not a rounding difference;
              it is the difference between a correct number and a wrong one.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={showComposition ? 'primary' : 'default'}
                onClick={() => setShowComposition((v) => !v)}
              >
                {showComposition ? 'Hide' : 'Show'} composition drift
              </Button>
              {hidden.size > 0 ? (
                <Button size="sm" onClick={() => setHidden(new Set())}>
                  Show all series
                </Button>
              ) : null}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
