import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import type { EChartsOption } from 'echarts'
import { EChart, type ChartTokens } from '@/components/charts/EChart'
import { alpha, categoryAxis, SERIES_COLOURS, valueAxis } from '@/components/charts/theme'
import {
  Badge,
  ChartSkeleton,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Segmented,
} from '@/components/ui/primitives'
import { Readout, StatTile } from '@/components/ui/numbers'
import { TestCard } from '@/components/ui/TestTable'
import { useAttribution, useFilter } from '@/data/hooks'
import { fmtMonth, fmtMonthShort, fmtPct, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Attribution Studio.
 *
 * This is the screen where the product is most tempted to overclaim, so it is the
 * screen with the most restraint built into it. The decomposition is real - the
 * generator's own components, aggregated the way the index aggregates them - but a
 * decomposition is an accounting identity, not a causal claim, and the two are
 * routinely confused in press coverage of price statistics.
 *
 * So: the banner is not dismissible, the word "driver" does not appear as a heading,
 * and the identification assumption is stated in full at the bottom rather than
 * gestured at. The Granger tests are run in BOTH directions for the same reason - a
 * one-directional Granger result presented alone reads as causation to almost every
 * audience, and running the reverse is the cheapest available corrective.
 */

/** Axis-length names. The full label is in the readout grid beneath the chart. */
const SHORT_LABEL: Record<string, string> = {
  fuel: 'Fuel',
  capacity: 'Capacity',
  demand: 'Demand',
  seasonal: 'Seasonal',
  termStructure: 'Horizon',
  event: 'Events',
  trend: 'Trend',
  residual: 'Residual',
}

const COMPONENT_COLOUR: Record<string, number> = {
  fuel: 2,
  capacity: 1,
  demand: 0,
  seasonal: 3,
  termStructure: 4,
  event: 5,
  trend: 0,
  residual: 4,
}

type View = 'waterfall' | 'time'

export default function AttributionPage(): React.ReactElement {
  const filter = useFilter()
  const [period, setPeriod] = React.useState<string | undefined>(undefined)
  const { data, loading, error, refresh } = useAttribution(filter, period)
  const [view, setView] = React.useState<View>('waterfall')
  const [exoId, setExoId] = React.useState('atf')

  // When the window moves, a period chosen inside the old window may no longer exist.
  React.useEffect(() => {
    if (data && period && !data.periods.includes(period)) setPeriod(undefined)
  }, [data, period])

  const net = data ? data.waterfall.reduce((s, w) => s + w.value, 0) : 0
  const largest = data
    ? data.waterfall.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a))
    : null
  const residual = data?.waterfall.find((w) => w.key === 'residual')

  const waterfallOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      // A waterfall in ECharts is two stacked bar series: an invisible riser that
      // carries each bar up to where the running total has reached, and the visible
      // bar on top of it.
      const base: number[] = []
      const rise: number[] = []
      const fall: number[] = []
      let running = 0
      for (const w of data.waterfall) {
        if (w.value >= 0) {
          base.push(running)
          rise.push(w.value)
          fall.push(0)
        } else {
          base.push(running + w.value)
          rise.push(0)
          fall.push(-w.value)
        }
        running += w.value
      }

      const labels = [...data.waterfall.map((w) => SHORT_LABEL[w.key] ?? w.label), 'Net']

      return {
        grid: { left: 4, right: 8, top: 10, bottom: 8, containLabel: true },
        legend: { show: false },
        xAxis: categoryAxis(tok, {
          data: labels,
          boundaryGap: true,
          axisLabel: {
            color: tok.faint,
            fontSize: 9,
            interval: 0,
            rotate: 34,
            hideOverlap: false,
          },
        }),
        yAxis: valueAxis(tok, {
          scale: true,
          axisLabel: { color: tok.faint, fontSize: 10, formatter: '{value}%' },
        }),
        tooltip: {
          trigger: 'axis',
          formatter: (p: unknown) => {
            const arr = p as { dataIndex: number }[]
            const i = arr[0]!.dataIndex
            if (i === data.waterfall.length) {
              return `Net change<br/><b>${fmtPct(net, 3)}</b>`
            }
            const w = data.waterfall[i]!
            return `${w.label}<br/><b>${fmtPct(w.value, 3)}</b>`
          },
        },
        series: [
          {
            name: 'base',
            type: 'bar',
            stack: 'w',
            itemStyle: { color: 'transparent' },
            emphasis: { itemStyle: { color: 'transparent' } },
            tooltip: { show: false },
            silent: true,
            data: [...base, 0],
          },
          {
            name: 'increase',
            type: 'bar',
            stack: 'w',
            barWidth: '58%',
            itemStyle: { color: tok.negative },
            data: [...rise, 0],
          },
          {
            name: 'decrease',
            type: 'bar',
            stack: 'w',
            barWidth: '58%',
            itemStyle: { color: tok.positive },
            data: [...fall, 0],
          },
          {
            name: 'net',
            type: 'bar',
            stack: 'w',
            barWidth: '58%',
            itemStyle: { color: tok.accent },
            data: [...data.waterfall.map(() => 0), net],
          },
        ],
      }
    },
    [data, net],
  )

  const timeOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      return {
        grid: { left: 4, right: 8, top: 34, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0, type: 'scroll', data: data.components.map((c) => c.label) },
        xAxis: categoryAxis(tok, { data: data.periods.map(fmtMonthShort) }),
        yAxis: valueAxis(tok, {
          scale: true,
          axisLabel: { color: tok.faint, fontSize: 10, formatter: '{value}%' },
        }),
        tooltip: {
          valueFormatter: (v: unknown) =>
            typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)}%` : '--',
        },
        series: data.components.map((c) => {
          const colour = SERIES_COLOURS[COMPONENT_COLOUR[c.key] ?? 4]!
          return {
            name: c.label,
            type: 'line',
            symbol: 'none',
            lineStyle: {
              width: c.key === 'residual' ? 1.2 : 1.8,
              color: colour,
              type: c.key === 'residual' ? 'dashed' : 'solid',
            },
            itemStyle: { color: colour },
            emphasis: { focus: 'series' },
            data: c.values,
          }
        }),
      }
    },
    [data],
  )

  const exoOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const exo = data.exogenous.find((e) => e.id === exoId) ?? data.exogenous[0]
      if (!exo) return {} as EChartsOption
      return {
        grid: { left: 4, right: 8, top: 10, bottom: 4, containLabel: true },
        legend: { show: false },
        xAxis: categoryAxis(tok, { data: exo.periods.map(fmtMonthShort) }),
        yAxis: valueAxis(tok, { scale: true }),
        tooltip: {
          valueFormatter: (v: unknown) =>
            typeof v === 'number' && Number.isFinite(v)
              ? `${v.toFixed(2)} ${exo.unit}`
              : '--',
        },
        series: [
          {
            name: exo.label,
            type: 'line',
            symbol: 'none',
            smooth: true,
            lineStyle: { width: 1.9, color: tok.warning },
            itemStyle: { color: tok.warning },
            areaStyle: { color: alpha(tok.warning, 0.08) },
            data: exo.values,
          },
        ],
      }
    },
    [data, exoId],
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
        kicker="Analysis"
        title="Attribution Studio"
        description="What moved with the index, decomposed into the channels the compilation tracks separately. A decomposition is an accounting identity; read the note at the foot of this screen before treating any line here as a cause."
      />

      {/* Not dismissible, and placed above the charts rather than below them. */}
      <div
        role="note"
        className="flex items-start gap-2.5 rounded border border-warn/40 bg-warn/10 p-3"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
        <p className="text-xs leading-relaxed text-ink">
          <span className="font-medium">Estimated statistical association.</span> Causal
          interpretation requires the identification assumption stated below.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile
          label="Net move"
          value={net}
          format={(v) => fmtPct(v, 2)}
          delta={net}
          goodDirection="down"
          secondary={data ? fmtMonth(data.selectedPeriod) : undefined}
          info="The month-on-month change in the constant-quality index for the selected month, rebuilt from its components. It is the sum of the bars to the right, by construction."
        />
        <StatTile
          label="Largest channel"
          value={largest ? largest.value : NaN}
          format={(v) => fmtPct(v, 2)}
          delta={largest ? largest.value : undefined}
          goodDirection="down"
          secondary={largest?.label}
          info="The component contributing the most to this month's move in absolute terms. Largest does not mean responsible."
        />
        <StatTile
          label="Unexplained"
          value={residual ? residual.value : NaN}
          format={(v) => fmtPct(v, 2)}
          secondary={
            residual && Math.abs(residual.value) > Math.abs(net) * 0.5
              ? 'larger than half the move'
              : 'within the modelled channels'
          }
          info="The part of the move that none of the tracked channels accounts for. A small residual is not evidence the model is right; a large one is evidence it is incomplete."
        />
        <StatTile
          label="Channels tracked"
          value={data ? data.components.length : NaN}
          format={(v) => fmtNumber(v)}
          secondary="including the residual"
          info="Fuel pass-through, capacity, demand, seasonality, booking-horizon structure, disruption events, the underlying trend, and whatever is left."
        />
      </div>

      <Panel>
        <PanelHeader
          title={view === 'waterfall' ? 'Decomposition of the selected month' : 'Contribution through time'}
          subtitle={
            view === 'waterfall'
              ? 'Percent contribution to the month-on-month change'
              : 'Percent change in each channel relative to the first month in view'
          }
          info="Red bars push the index up, green bars pull it down. The colour convention is deliberate: for a price index, up is not good news."
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              {data ? (
                <select
                  value={data.selectedPeriod}
                  onChange={(e) => setPeriod(e.target.value)}
                  aria-label="Month to decompose"
                  className="tap h-7 rounded border border-line bg-surface px-2 text-2xs text-ink"
                >
                  {data.periods.map((p) => (
                    <option key={p} value={p}>
                      {fmtMonth(p)}
                    </option>
                  ))}
                </select>
              ) : null}
              <Segmented
                ariaLabel="Attribution view"
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  { value: 'waterfall', label: 'Waterfall' },
                  { value: 'time', label: 'Through time' },
                ]}
              />
            </div>
          }
        />
        {loading || !data ? (
          <ChartSkeleton height={330} />
        ) : view === 'waterfall' ? (
          <EChart
            option={waterfallOption}
            height={340}
            mobileHeight={300}
            ariaLabel="Waterfall decomposition of the selected month"
          />
        ) : (
          <EChart
            option={timeOption}
            height={340}
            mobileHeight={260}
            ariaLabel="Component contributions through time"
          />
        )}

        {data ? (
          <div className="grid grid-cols-2 gap-2 border-t border-line p-3 sm:grid-cols-4 sm:p-4">
            {data.waterfall.map((w) => (
              <Readout
                key={w.key}
                label={w.label}
                value={fmtPct(w.value, 2)}
                tone={
                  Math.abs(w.value) < 0.005 ? 'default' : w.value > 0 ? 'negative' : 'positive'
                }
              />
            ))}
          </div>
        ) : null}
      </Panel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Exogenous series"
            subtitle="Inputs the index is compared against, in their own units"
            info="These are not inputs to the index. They are independently generated series that the fare process responds to, so that a test of association between them has something to find."
            actions={
              data ? (
                <Segmented
                  ariaLabel="Exogenous series"
                  size="sm"
                  value={exoId}
                  onChange={setExoId}
                  options={data.exogenous.map((e) => ({
                    value: e.id,
                    label: e.id.toUpperCase(),
                    title: e.label,
                  }))}
                />
              ) : null
            }
          />
          {loading || !data ? (
            <ChartSkeleton height={240} />
          ) : (
            <>
              <EChart
                option={exoOption}
                height={250}
                mobileHeight={200}
                ariaLabel="Selected exogenous series"
              />
              <p className="px-3 pb-3 text-2xs text-faint sm:px-4">
                {data.exogenous.find((e) => e.id === exoId)?.label} in{' '}
                {data.exogenous.find((e) => e.id === exoId)?.unit}. Fuel enters the fare
                process asymmetrically: a rise passes through faster than a fall.
              </p>
            </>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Stationarity"
            subtitle="Augmented Dickey-Fuller, one lag, with drift"
            info="Regressing one non-stationary series on another produces a high R-squared and a meaningless relationship. The tests run before the Granger tests for that reason, and their criticals come from MacKinnon's response surface rather than a t table."
          />
          <div className="flex flex-col gap-2 p-3 sm:p-4">
            {loading || !data ? (
              <ChartSkeleton height={200} />
            ) : data.adf.length === 0 ? (
              <p className="text-2xs text-faint">
                The selected window is too short to test. Widen it to at least twelve
                months.
              </p>
            ) : (
              data.adf.map((r) => <TestCard key={r.test} result={r} />)
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Granger tests, both directions"
          subtitle="Does one series help forecast the other, beyond the other's own past?"
          info="Granger causality is a statement about forecast improvement, not about mechanism. Running it in only one direction is how a correlation gets published as a cause, so both directions are always shown."
        />
        <div className="grid gap-2 p-3 sm:p-4 lg:grid-cols-2">
          {loading || !data ? (
            <ChartSkeleton height={200} />
          ) : data.granger.length === 0 ? (
            <p className="text-2xs text-faint">
              At least fourteen monthly observations are needed after differencing. Widen
              the window.
            </p>
          ) : (
            data.granger.map((r) => <TestCard key={r.test} result={r} />)
          )}
        </div>
        {data && data.granger.length === 2 ? (
          <div className="border-t border-line px-3 py-2.5 sm:px-4">
            <p className="text-2xs leading-relaxed text-muted">
              {data.granger[0]!.decision === 'reject' && data.granger[1]!.decision === 'reject'
                ? 'Both directions reject. That is feedback, not a one-way relationship, and neither series can be treated as exogenous to the other on this evidence.'
                : data.granger[0]!.decision === 'reject'
                  ? 'The forward direction rejects and the reverse does not. That is consistent with fuel leading fares, and it is also consistent with a third series driving both with different lags. It is not proof of either.'
                  : 'Neither direction rejects at this window length. The honest reading is that this window is too short to detect the relationship, not that no relationship exists.'}
            </p>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <PanelHeader title="Identification assumption" />
        <div className="grid gap-3 p-3 text-xs leading-relaxed text-muted sm:grid-cols-2 sm:p-4">
          <div>
            <p className="mb-1.5 font-medium text-ink">What this screen establishes</p>
            <p>
              The decomposition is exact. Each channel is a component the compilation
              tracks separately, and they sum to the index move by construction &mdash;
              which is precisely why the identity carries no causal content. The tests
              below the charts establish that certain series move together, and in what
              temporal order.
            </p>
          </div>
          <div>
            <p className="mb-1.5 font-medium text-ink">What it does not</p>
            <p>
              Reading &ldquo;fuel contributed 1.2%&rdquo; as &ldquo;fuel caused 1.2%&rdquo;
              requires assuming that ATF prices are exogenous to Indian domestic airfares
              over this window &mdash; no reverse causation, and no omitted variable moving
              both. Aviation turbine fuel is priced off international crude, which supports
              the first part. The second part is an assumption, and it is not testable
              from this panel.
            </p>
          </div>
          <div className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Badge tone="warning">Required for a causal reading</Badge>
              <span className={cn('text-2xs text-muted')}>
                ATF price is exogenous to domestic airfare formation over the window; no
                unobserved factor moves both fuel and fares within the tested lag
                structure; the relationship is stable across the window.
              </span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
