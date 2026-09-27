import * as React from 'react'
import type { EChartsOption } from 'echarts'
import { EChart, type ChartTokens } from '@/components/charts/EChart'
import { alpha, categoryAxis, categoryAxisY, valueAxis, valueAxisX } from '@/components/charts/theme'
import {
  ChartSkeleton,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Segmented,
  Tip,
} from '@/components/ui/primitives'
import { AnimatedNumber, Readout, StatTile } from '@/components/ui/numbers'
import { usePortfolio, useFilter } from '@/data/hooks'
import { fmtPct, fmtShare } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Portfolio Analytics.
 *
 * Routes are treated as correlated assets. The framing is not a gimmick: an airline
 * planner, a corporate travel desk and a central bank watching pass-through all face
 * the same question, which is how much of the movement in one route is common to all
 * of them and how much is specific. That is a covariance problem, and the standard
 * machinery answers it.
 *
 * Three things on this screen are easy to get wrong and are handled explicitly:
 *
 *  - The sample covariance of sixty routes over twenty-four months is rank-deficient.
 *    Optimising on it produces confident nonsense. Ledoit-Wolf shrinkage is applied and
 *    the intensity is displayed, because a shrinkage intensity near one is the matrix
 *    telling you it has almost no information in it.
 *  - Value at risk from a normal assumption understates a skewed, fat-tailed series.
 *    Cornish-Fisher, Gaussian and historical are all shown side by side rather than one
 *    being presented as the answer.
 *  - The correlation heatmap is ordered by hierarchical clustering, not alphabetically.
 *    An alphabetical heatmap of correlated assets shows nothing; the block structure
 *    only appears once like moves with like.
 */

type Order = 'cluster' | 'alpha'

export default function PortfolioPage(): React.ReactElement {
  const filter = useFilter()
  const { data, loading, error, refresh } = usePortfolio(filter)
  const [order, setOrder] = React.useState<Order>('cluster')
  const [point, setPoint] = React.useState(0)

  const frontier = React.useMemo(() => data?.frontier ?? [], [data])
  const selected = frontier[Math.min(point, Math.max(0, frontier.length - 1))]

  // Default to the middle of the frontier rather than an endpoint - the endpoints are
  // the degenerate solutions and they make the allocation bar look broken.
  React.useEffect(() => {
    if (frontier.length > 0) setPoint((p) => (p === 0 ? Math.floor(frontier.length / 2) : p))
  }, [frontier.length])

  const orderIdx = React.useMemo(() => {
    if (!data) return []
    return order === 'cluster'
      ? data.clusterOrder
      : data.routeLabels
          .map((l, i) => [l, i] as const)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([, i]) => i)
  }, [data, order])

  const heatOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const labels = orderIdx.map((i) => data.routeLabels[i]!)
      const cells: [number, number, number][] = []
      for (let x = 0; x < orderIdx.length; x++) {
        for (let y = 0; y < orderIdx.length; y++) {
          cells.push([x, y, data.correlation[orderIdx[x]!]![orderIdx[y]!]!])
        }
      }
      return {
        grid: { left: 4, right: 8, top: 6, bottom: 34, containLabel: true },
        legend: { show: false },
        xAxis: categoryAxis(tok, {
          data: labels,
          boundaryGap: true,
          axisLabel: { show: false },
          splitLine: { show: false },
        }),
        yAxis: categoryAxisY(tok, {
          data: labels,
          boundaryGap: true,
          axisLabel: { show: false },
        }),
        visualMap: {
          min: -1,
          max: 1,
          calculable: false,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          // ECharts swaps these two for a horizontal continuous visualMap, so they are
          // given in the vertical orientation's terms: thickness, then length.
          itemWidth: 11,
          itemHeight: 120,
          textStyle: { color: tok.faint, fontSize: 10 },
          inRange: { color: [tok.positive, tok.surface, tok.negative] },
        },
        tooltip: {
          trigger: 'item',
          formatter: (p: unknown) => {
            const q = p as { data: [number, number, number] }
            return `${labels[q.data[0]]} × ${labels[q.data[1]]}<br/><b>${q.data[2].toFixed(3)}</b>`
          },
        },
        series: [
          {
            type: 'heatmap',
            data: cells,
            progressive: 4000,
            itemStyle: { borderWidth: 0 },
            emphasis: { itemStyle: { borderColor: tok.text, borderWidth: 1 } },
          },
        ],
      }
    },
    [data, orderIdx],
  )

  const frontierOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data || frontier.length === 0) return {} as EChartsOption
      const pts = frontier.map((f) => [f.volatility * 100, f.expectedReturn * 100])
      const sel = selected ? [[selected.volatility * 100, selected.expectedReturn * 100]] : []
      return {
        grid: { left: 4, right: 12, top: 10, bottom: 4, containLabel: true },
        legend: { show: false },
        xAxis: valueAxisX(tok, {
          scale: true,
          axisLabel: { color: tok.faint, fontSize: 10, formatter: '{value}%' },
        }),
        yAxis: valueAxis(tok, {
          scale: true,
          axisLabel: { color: tok.faint, fontSize: 10, formatter: '{value}%' },
        }),
        tooltip: {
          trigger: 'item',
          formatter: (p: unknown) => {
            const q = p as { data: [number, number] }
            return `volatility ${q.data[0].toFixed(2)}%<br/>expected ${q.data[1].toFixed(2)}%`
          },
        },
        series: [
          {
            name: 'Frontier',
            type: 'line',
            symbol: 'circle',
            symbolSize: 5,
            smooth: true,
            lineStyle: { width: 1.6, color: tok.accent },
            itemStyle: { color: tok.accent },
            areaStyle: { color: alpha(tok.accent, 0.06) },
            data: pts,
          },
          {
            name: 'Selected',
            type: 'scatter',
            symbolSize: 13,
            itemStyle: { color: tok.warning, borderColor: tok.surface, borderWidth: 2 },
            data: sel,
            z: 9,
          },
        ],
      }
    },
    [data, frontier, selected],
  )

  const allocation = React.useMemo(() => {
    if (!data || !selected) return []
    return selected.weights
      .map((w, i) => ({ w, label: data.routeLabels[i]!, id: data.routeIds[i]! }))
      .filter((a) => a.w > 0.004)
      .sort((a, b) => b.w - a.w)
  }, [data, selected])

  const factorOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      return {
        grid: { left: 4, right: 12, top: 10, bottom: 4, containLabel: true },
        legend: { show: false },
        xAxis: valueAxisX(tok, {
          scale: true,
          axisLabel: { color: tok.faint, fontSize: 10 },
        }),
        yAxis: valueAxis(tok, {
          scale: true,
          axisLabel: { color: tok.faint, fontSize: 10 },
        }),
        tooltip: {
          trigger: 'item',
          formatter: (p: unknown) => {
            const q = p as { dataIndex: number }
            const f = data.factors[q.dataIndex]!
            return `${f.routeLabel}<br/>market beta ${f.marketBeta.toFixed(2)}<br/>fuel beta ${f.fuelBeta.toFixed(2)}<br/>R² ${f.r2.toFixed(2)}`
          },
        },
        series: [
          {
            type: 'scatter',
            symbolSize: (v: unknown) => 4 + (v as number[])[2]! * 60,
            itemStyle: { color: tok.accent, opacity: 0.75 },
            data: data.factors.map((f) => [f.marketBeta, f.fuelBeta, f.idioVol]),
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: tok.faint, type: 'dashed', width: 1 },
              data: [{ xAxis: 1 }, { yAxis: 0 }],
              label: { show: false },
            },
          },
        ],
      }
    },
    [data],
  )

  if (error) {
    return (
      <Panel>
        <ErrorState message={error} onRetry={refresh} />
      </Panel>
    )
  }

  const v = data?.varResult

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        kicker="Analysis"
        title="Portfolio Analytics"
        description="Sixty routes as correlated assets. How much of a route's movement is the market, how much is fuel, and how much is nobody else's problem but that route's."
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile
          label="Value at risk, 95%"
          value={v ? v.var * 100 : NaN}
          format={(x) => fmtPct(x, 2, false)}
          secondary="Cornish-Fisher, monthly"
          info="The monthly loss the equally weighted route basket exceeds one month in twenty. Cornish-Fisher adjusts the normal quantile for skewness and excess kurtosis rather than assuming them away."
        />
        <StatTile
          label="Conditional VaR"
          value={v ? v.cvar * 100 : NaN}
          format={(x) => fmtPct(x, 2, false)}
          secondary="mean loss beyond the 95th"
          info="The average loss in the months that do breach the VaR. VaR says where the cliff is; CVaR says how far down it goes."
        />
        <StatTile
          label="Shrinkage intensity"
          value={data ? data.shrinkageIntensity : NaN}
          format={(x) => x.toFixed(3)}
          secondary={data && data.shrinkageIntensity > 0.5 ? 'sample matrix is weak' : 'sample matrix is usable'}
          info="Ledoit-Wolf. Zero means the sample covariance was trusted as-is; one means it was discarded entirely in favour of the structured target. With sixty assets and twenty-four months, a high number is the honest answer."
        />
        <StatTile
          label="Excess kurtosis"
          value={v ? v.excessKurtosis : NaN}
          format={(x) => x.toFixed(2)}
          secondary={v && v.excessKurtosis > 0.5 ? 'fatter tails than normal' : 'near normal'}
          info="Zero is the normal distribution. Positive means the extreme months are more frequent than a normal model expects, which is exactly when a Gaussian VaR misleads."
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Route correlation"
            subtitle={
              order === 'cluster'
                ? 'Ordered by average-linkage hierarchical clustering'
                : 'Ordered alphabetically'
            }
            info="Switch the ordering to see why it matters. Alphabetical order scatters correlated routes across the matrix and the structure disappears; clustering brings the blocks to the diagonal."
            actions={
              <Segmented
                ariaLabel="Heatmap ordering"
                size="sm"
                value={order}
                onChange={setOrder}
                options={[
                  { value: 'cluster', label: 'Clustered' },
                  { value: 'alpha', label: 'A-Z' },
                ]}
              />
            }
          />
          {loading || !data ? (
            <ChartSkeleton height={360} />
          ) : (
            <>
              <EChart
                option={heatOption}
                height={380}
                mobileHeight={300}
                ariaLabel="Correlation matrix of route index returns"
              />
              <p className="px-3 pb-3 text-2xs leading-relaxed text-faint sm:px-4">
                {data.shrinkageNote}
              </p>
            </>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Efficient frontier"
            subtitle="Long-only, fully invested, monthly index returns"
            info="Solved by projected gradient onto the simplex, so weights are non-negative and sum to one without a quadratic programming dependency. The objective sign convention treats a rising fare index as a cost, not a gain."
          />
          {loading || !data || frontier.length === 0 ? (
            <ChartSkeleton height={280} />
          ) : (
            <>
              <EChart
                option={frontierOption}
                height={260}
                mobileHeight={210}
                ariaLabel="Efficient frontier of route allocations"
              />
              <div className="border-t border-line p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="risk" className="label-caps">
                    Risk aversion
                  </label>
                  <span className="num text-2xs text-muted">
                    {selected ? selected.riskAversion.toFixed(2) : '--'}
                  </span>
                </div>
                <input
                  id="risk"
                  type="range"
                  min={0}
                  max={frontier.length - 1}
                  step={1}
                  value={Math.min(point, frontier.length - 1)}
                  onChange={(e) => setPoint(Number(e.target.value))}
                  className="tap mt-2 w-full accent-[rgb(var(--aq-accent))]"
                />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Readout
                    label="Expected"
                    value={
                      <AnimatedNumber
                        value={selected ? selected.expectedReturn * 100 : NaN}
                        format={(x) => fmtPct(x, 2)}
                      />
                    }
                  />
                  <Readout
                    label="Volatility"
                    value={
                      <AnimatedNumber
                        value={selected ? selected.volatility * 100 : NaN}
                        format={(x) => fmtPct(x, 2, false)}
                      />
                    }
                  />
                  <Readout
                    label="Effective N"
                    value={
                      <AnimatedNumber
                        value={selected ? selected.effectiveN : NaN}
                        format={(x) => x.toFixed(1)}
                      />
                    }
                    info="The inverse Herfindahl of the weights: how many routes the allocation is really spread across, as opposed to how many carry a non-zero weight."
                  />
                </div>

                {/* The allocation re-animates as the slider moves, which is the point -
                    a frontier is a family of portfolios, not a single answer. */}
                <div className="mt-3">
                  <p className="label-caps mb-1.5">Allocation</p>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-elevated">
                    {allocation.map((a, i) => (
                      <div
                        key={a.id}
                        title={`${a.label}: ${fmtShare(a.w)}`}
                        className="transition-[width] duration-500 ease-out"
                        style={{
                          width: `${a.w * 100}%`,
                          backgroundColor: `hsl(${(i * 47) % 360} 55% 58%)`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {allocation.slice(0, 6).map((a) => (
                      <span key={a.id} className="text-2xs text-faint">
                        {a.label} <span className="num text-muted">{fmtShare(a.w)}</span>
                      </span>
                    ))}
                    {allocation.length > 6 ? (
                      <span className="text-2xs text-faint">
                        +{allocation.length - 6} more
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Three views of the same tail"
            subtitle="Monthly loss at the 95th percentile"
            info="If these three numbers agree, the return distribution is close to normal and the choice does not matter. Where they disagree, the Gaussian figure is the one that is wrong."
          />
          {loading || !v ? (
            <ChartSkeleton height={220} />
          ) : (
            <div className="flex flex-col gap-3 p-3 sm:p-4">
              {[
                ['Cornish-Fisher', v.var, 'adjusts for skew and kurtosis'],
                ['Gaussian', v.gaussianVar, 'assumes normality'],
                ['Historical', v.historicalVar, 'empirical quantile, no model'],
              ].map(([label, value, note]) => (
                <div key={label as string}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink">{label as string}</span>
                    <span className="num text-xs font-medium text-neg">
                      {fmtPct((value as number) * 100, 2, false)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-elevated">
                    <div
                      className="h-full rounded-full bg-neg transition-[width] duration-500"
                      style={{
                        width: `${Math.min(100, (Math.abs(value as number) / Math.max(Math.abs(v.var), Math.abs(v.historicalVar), 1e-6)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-2xs text-faint">{note as string}</p>
                </div>
              ))}
              <div className="flex flex-wrap gap-3 border-t border-line pt-2.5">
                <Readout label="Skewness" value={v.skewness.toFixed(3)} />
                <Readout label="Excess kurtosis" value={v.excessKurtosis.toFixed(3)} />
                <Readout label="Alpha" value={fmtShare(v.alpha, 0)} />
              </div>
              <p className="text-2xs leading-relaxed text-muted">{v.note}</p>
            </div>
          )}
        </Panel>

        <Panel className="xl:col-span-3">
          <PanelHeader
            title="Factor exposures"
            subtitle="Market beta against fuel beta; bubble size is idiosyncratic volatility"
            info="Each route's monthly index return regressed on the national index, the ATF price and capacity. A route above the dashed line responds to fuel more than the market does."
          />
          {loading || !data ? (
            <ChartSkeleton height={260} />
          ) : (
            <EChart
              option={factorOption}
              height={280}
              mobileHeight={220}
              ariaLabel="Factor exposures by route"
            />
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Factor regressions"
          subtitle={data ? `${data.factors.length} routes` : undefined}
          info="R-squared is the share of a route's monthly variation the three factors explain. What is left is idiosyncratic volatility, and it is the part diversification can remove."
        />
        <div className="max-h-[26rem] overflow-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-line">
                {['Route', 'Market beta', 'Fuel beta', 'Capacity beta', 'R²', 'Idio vol'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={cn('label-caps whitespace-nowrap px-2.5 py-2', i > 0 && 'text-right')}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {(data?.factors ?? [])
                .slice()
                .sort((a, b) => b.r2 - a.r2)
                .map((f) => (
                  <tr key={f.routeId} className="border-b border-line/60 text-xs last:border-0">
                    <td className="num whitespace-nowrap px-2.5 py-1.5 text-ink">
                      {f.routeLabel}
                    </td>
                    <td className="num px-2.5 py-1.5 text-right text-muted">
                      {f.marketBeta.toFixed(2)}
                    </td>
                    <td
                      className={cn(
                        'num px-2.5 py-1.5 text-right',
                        Math.abs(f.fuelBeta) > 0.5 ? 'text-warn' : 'text-muted',
                      )}
                    >
                      {f.fuelBeta.toFixed(2)}
                    </td>
                    <td className="num px-2.5 py-1.5 text-right text-muted">
                      {f.capacityBeta.toFixed(2)}
                    </td>
                    <td className="num px-2.5 py-1.5 text-right text-ink">{f.r2.toFixed(3)}</td>
                    <td className="num px-2.5 py-1.5 text-right text-muted">
                      {fmtPct(f.idioVol * 100, 2, false)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="What a portfolio view is for" />
        <div className="grid gap-3 p-3 text-xs leading-relaxed text-muted sm:grid-cols-3 sm:p-4">
          <p>
            <span className="text-ink">For a statistical office:</span> the correlation
            blocks show which routes carry independent information. A sample that
            over-covers one block buys less precision than its observation count
            suggests, because those routes are largely telling you the same thing.
          </p>
          <p>
            <span className="text-ink">For a central bank:</span> the fuel betas are the
            pass-through distribution. A single national elasticity hides that some
            routes move almost one-for-one with ATF while others barely respond, and the
            aggregate response depends on which of them the basket weights.
          </p>
          <p>
            <span className="text-ink">For a travel programme:</span> the frontier is a
            routing question. Two city pairs that serve the same trip with a low
            correlation are a hedge; two with a correlation near one are the same
            exposure bought twice.{' '}
            <Tip content="The Travel Budget screen turns this into a Monte Carlo on an actual itinerary.">
              <span className="cursor-help text-accent">See Travel Budget.</span>
            </Tip>
          </p>
        </div>
      </Panel>
    </div>
  )
}
