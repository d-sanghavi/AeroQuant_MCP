import * as React from 'react'
import type { EChartsOption } from 'echarts'
import { EChart, type ChartTokens } from '@/components/charts/EChart'
import { categoryAxis, categoryAxisY, valueAxis, valueAxisX } from '@/components/charts/theme'
import {
  Badge,
  ChartSkeleton,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Segmented,
  Tip,
} from '@/components/ui/primitives'
import { FadeIn, ProvValue, Readout, StatTile } from '@/components/ui/numbers'
import { useCarriers, useFilter } from '@/data/hooks'
import { useApp } from '@/data/store'
import {
  fmtCompact,
  fmtINR,
  fmtIndex,
  fmtMonthShort,
  fmtNumber,
  fmtP,
  fmtPct,
  fmtPP,
  fmtShare,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CarrierDto } from '@/data/worker/protocol'

/**
 * Carrier breakdown.
 *
 * SIH26056 asks for airfare data compiled from airline and travel websites, and the
 * Indian domestic market is six carriers. Cutting the panel by carrier is therefore
 * not a convenience filter - it is one of the compilation's reporting dimensions, and
 * the CPI's airfare item is built from exactly these operators.
 *
 * The screen makes one argument, in the same shape as the Method Lab's: **the carrier
 * mix moves, and an unadjusted average moves with it.** Three panels carry it:
 *
 *   1. what each carrier costs, with the network held fixed  (matched premium)
 *   2. how much of the sample each carrier is                (share over time)
 *   3. what happens to each carrier's own index either way   (adjusted vs naive)
 *
 * The matched premium is the load-bearing statistic. A raw comparison of mean fares
 * across carriers is dominated by which routes each one flies and how far ahead it is
 * typically booked; comparing only inside cells where two carriers sold the same
 * route, cabin, fare family and booking horizon in the same month removes that.
 */

type Series = 'adjusted' | 'naive'

const MODEL_TONE: Record<string, 'accent' | 'warning' | 'neutral'> = {
  LCC: 'accent',
  FSC: 'warning',
  Regional: 'neutral',
}

const MODEL_NOTE: Record<string, string> = {
  LCC: 'Low-cost carrier: single cabin class or a light premium, unbundled fares.',
  FSC: 'Full-service carrier: full cabin ladder, bundled baggage, higher base fare.',
  Regional: 'Regional operator: short sectors, small aircraft, thin networks.',
}

/** Herfindahl-Hirschman index of the observed quote shares, on the 0-10,000 scale. */
function hhi(shares: readonly number[]): number {
  let s = 0
  for (const x of shares) if (Number.isFinite(x)) s += (x * 100) ** 2
  return s
}

export default function CarriersPage(): React.ReactElement {
  const filter = useFilter()
  const { data, loading, error, refresh } = useCarriers(filter)
  const periodFrom = useApp((s) => s.periodFrom)
  const [series, setSeries] = React.useState<Series>('adjusted')
  const [focus, setFocus] = React.useState<string | null>(null)

  const ranked = React.useMemo(
    () => (data ? [...data.carriers].sort((a, b) => b.nObservations - a.nObservations) : []),
    [data],
  )
  const active = ranked.filter((c) => c.nObservations > 0)
  const lastIdx = data ? data.periods.length - 1 : 0

  const lccShare = active
    .filter((c) => c.model === 'LCC')
    .reduce((s, c) => s + c.observationShare, 0)
  const concentration = hhi(active.map((c) => c.observationShare))
  const leader = active[0]
  // The widest gap between what a carrier's own constant-quality index says and what
  // its unadjusted average says. If this is large, the mix is moving inside airlines
  // as well as between them.
  const worstGap = active.reduce(
    (worst, c) => {
      const gap = c.naiveAvgYoy - c.avgYoy
      return Number.isFinite(gap) && Math.abs(gap) > Math.abs(worst.gap)
        ? { gap, name: c.name }
        : worst
    },
    { gap: 0, name: '--' },
  )

  const indexOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const months = data.periods.map(fmtMonthShort)
      return {
        grid: { left: 4, right: 8, top: 34, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0, type: 'scroll', data: active.map((c) => c.name) },
        xAxis: categoryAxis(tok, { data: months }),
        yAxis: valueAxis(tok, { scale: true }),
        tooltip: {
          valueFormatter: (v: unknown) =>
            typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '--',
        },
        series: active.map((c) => ({
          name: c.name,
          type: 'line',
          symbol: 'none',
          lineStyle: {
            width: focus === null || focus === c.code ? 2 : 1,
            color: c.colour,
            opacity: focus === null || focus === c.code ? 1 : 0.28,
          },
          itemStyle: { color: c.colour },
          emphasis: { focus: 'series' },
          data: series === 'adjusted' ? c.index : c.naiveIndex,
          z: focus === c.code ? 8 : 3,
        })),
      }
    },
    [data, active, series, focus],
  )

  const shareOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      return {
        grid: { left: 4, right: 8, top: 30, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0, type: 'scroll', data: active.map((c) => c.name) },
        xAxis: categoryAxis(tok, { data: data.periods.map(fmtMonthShort) }),
        yAxis: valueAxis(tok, {
          max: 100,
          min: 0,
          axisLabel: { color: tok.faint, fontSize: 10, formatter: '{value}%' },
        }),
        tooltip: {
          valueFormatter: (v: unknown) =>
            typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)}%` : '--',
        },
        series: active.map((c) => ({
          name: c.name,
          type: 'line',
          stack: 'mix',
          symbol: 'none',
          smooth: false,
          lineStyle: { width: 0.75, color: c.colour },
          itemStyle: { color: c.colour },
          areaStyle: { color: c.colour, opacity: focus === null || focus === c.code ? 0.5 : 0.16 },
          emphasis: { focus: 'series' },
          data: c.shareByPeriod.map((s) => s * 100),
        })),
      }
    },
    [data, active, focus],
  )

  const premiumOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const sorted = [...active].sort((a, b) => a.matchedPremiumPct - b.matchedPremiumPct)
      return {
        grid: { left: 4, right: 24, top: 6, bottom: 4, containLabel: true },
        legend: { show: false },
        // Bars run horizontally here, so value and category swap axes.
        xAxis: valueAxisX(tok, {
          axisLabel: { color: tok.faint, fontSize: 10, formatter: '{value}%' },
        }),
        yAxis: categoryAxisY(tok, {
          data: sorted.map((c) => c.code),
          boundaryGap: true,
        }),
        tooltip: {
          trigger: 'item',
          formatter: (p: unknown) => {
            const q = p as { dataIndex: number }
            const c = sorted[q.dataIndex]!
            return `${c.name}<br/>${fmtPct(c.matchedPremiumPct, 1)} vs matched competitors<br/>${fmtNumber(c.matchedCells)} matched cells`
          },
        },
        series: [
          {
            type: 'bar',
            barWidth: '58%',
            data: sorted.map((c) => ({
              value: c.matchedPremiumPct,
              itemStyle: { color: c.matchedPremiumPct >= 0 ? tok.negative : tok.positive },
            })),
            label: {
              show: true,
              position: 'right',
              color: tok.muted,
              fontSize: 10,
              formatter: (p: unknown) => fmtPct((p as { value: number }).value, 1),
            },
            markLine: {
              silent: true,
              symbol: 'none',
              data: [{ xAxis: 0 }],
              lineStyle: { color: tok.faint, type: 'dashed', width: 1 },
              label: { show: false },
            },
          },
        ],
      }
    },
    [data, active],
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
        kicker="Compilation by operator"
        title="Carrier breakdown"
        description={
          <>
            Every quote in the panel belongs to one of six Indian domestic operators.
            This screen reports what each of them charges with the route network held
            fixed, how much of the sample each of them is, and what that mix does to an
            unadjusted average.
          </>
        }
        actions={
          <Segmented
            ariaLabel="Index series"
            value={series}
            onChange={setSeries}
            options={[
              { value: 'adjusted', label: 'Constant quality', title: 'RYGEKS-FEWS per carrier' },
              { value: 'naive', label: 'Naive mean', title: 'Geometric mean of observed fares' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile
          label="Largest carrier"
          value={leader ? leader.observationShare * 100 : NaN}
          format={(v) => `${v.toFixed(1)}%`}
          secondary={leader ? `${leader.name} · ${fmtCompact(leader.nObservations)} quotes` : undefined}
          info="Share of observed QUOTES, not of seats flown. A full-service carrier is quoted in three cabins where a low-cost carrier is quoted in one, so it contributes more rows per departure than its seat share implies - Air India's quote share runs well above its capacity share for exactly that reason. The seat share is on the carrier detail panel."
        />
        <StatTile
          label="Low-cost share"
          value={lccShare * 100}
          format={(v) => `${v.toFixed(1)}%`}
          secondary="of quotes, LCC operators"
          info="A shift between low-cost and full-service carriers moves an unadjusted average with no fare having changed. That is the same composition effect the Method Lab shows for booking horizon."
        />
        <StatTile
          label="Concentration"
          value={concentration}
          format={(v) => fmtNumber(v)}
          secondary={
            concentration > 2500 ? 'HHI · highly concentrated' : 'HHI · moderately concentrated'
          }
          info="Herfindahl-Hirschman index of quote shares, on the 0-10,000 scale. Above 2,500 is conventionally read as a highly concentrated market."
        />
        <StatTile
          label="Widest mix effect"
          value={worstGap.gap}
          format={(v) => fmtPP(v, 2)}
          delta={worstGap.gap}
          goodDirection="down"
          secondary={worstGap.name}
          info="For this carrier, the gap between its own naive average and its own constant-quality index. Composition drift is not only between airlines; it happens inside one."
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title={series === 'adjusted' ? 'Constant-quality index by carrier' : 'Naive fare average by carrier'}
            subtitle={`Index, first month in view = 100${data ? ` · ${data.periods.length} months` : ''}`}
            info={
              series === 'adjusted'
                ? 'RYGEKS-FEWS with a Time Product Dummy estimator, run on each carrier’s own products from the same cube the national index uses.'
                : 'The geometric mean of each carrier’s observed fares, month by month. It carries the carrier’s internal composition drift as well as its price change.'
            }
            actions={
              focus ? (
                <button
                  type="button"
                  onClick={() => setFocus(null)}
                  className="tap text-2xs text-accent hover:underline"
                >
                  Clear focus
                </button>
              ) : null
            }
          />
          {loading || !data ? (
            <ChartSkeleton height={300} />
          ) : (
            <EChart
              option={indexOption}
              height={320}
              mobileHeight={240}
              ariaLabel="Index by carrier over the selected window"
            />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Fare premium, network held fixed"
            subtitle="Mean log gap against carriers in the same cell"
            info="Computed only where two or more carriers sold the same route, cabin, fare family and booking horizon in the same month. Comparing raw means instead would mostly be comparing route networks."
          />
          {loading || !data ? (
            <ChartSkeleton height={300} />
          ) : (
            <EChart
              option={premiumOption}
              height={320}
              mobileHeight={260}
              ariaLabel="Matched fare premium by carrier"
            />
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Share of quotes by carrier"
          subtitle="Stacked to 100% of observations in each month"
          info="If these bands are not flat, the sample composition is moving. An unadjusted national average inherits that movement and reports it as a price change."
        />
        {loading || !data ? (
          <ChartSkeleton height={240} />
        ) : (
          <EChart
            option={shareOption}
            height={250}
            mobileHeight={200}
            ariaLabel="Share of observed quotes by carrier over time"
          />
        )}
      </Panel>

      {/* The detail. A table from `sm` upward; cards below it, because six carriers
          times eleven columns cannot be made legible at 360px by scrolling alone. */}
      <Panel>
        <PanelHeader
          title="Carriers"
          subtitle="Click a row to focus it in the charts above"
          info="Constant quality is each carrier’s own RYGEKS-FEWS series; naive is its geometric mean. The mix column is the difference, in percentage points."
        />

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[54rem] text-left">
            <thead>
              <tr className="border-b border-line">
                {[
                  'Carrier',
                  'Model',
                  'Quotes',
                  'Share',
                  'Routes',
                  'Median fare',
                  'Matched premium',
                  'Constant quality',
                  'Naive',
                  'Mix effect',
                ].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      'label-caps whitespace-nowrap px-2.5 py-2',
                      i >= 2 && 'text-right',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((c) => {
                const gap = c.naiveAvgYoy - c.avgYoy
                return (
                  <tr
                    key={c.code}
                    onClick={() => setFocus(focus === c.code ? null : c.code)}
                    className={cn(
                      'cursor-pointer border-b border-line/60 text-xs transition-colors last:border-0 hover:bg-elevated',
                      focus === c.code && 'bg-elevated',
                    )}
                  >
                    <td className="whitespace-nowrap px-2.5 py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: c.colour }}
                          aria-hidden
                        />
                        <span className="font-medium text-ink">{c.name}</span>
                        <span className="num text-2xs text-faint">{c.code}</span>
                      </span>
                    </td>
                    <td className="px-2.5 py-2">
                      <Tip content={MODEL_NOTE[c.model] ?? ''}>
                        <span>
                          <Badge tone={MODEL_TONE[c.model] ?? 'neutral'}>{c.model}</Badge>
                        </span>
                      </Tip>
                    </td>
                    <td className="num px-2.5 py-2 text-right text-muted">
                      <ProvValue
                        provenance={{
                          label: `${c.name} quotes`,
                          value: c.nObservations,
                          method: 'Count of observations in the current window',
                          unit: 'count',
                          periodIdx: lastIdx,
                          airlineCode: c.code,
                        }}
                      >
                        {fmtCompact(c.nObservations)}
                      </ProvValue>
                    </td>
                    <td className="num px-2.5 py-2 text-right text-muted">
                      {fmtShare(c.observationShare)}
                    </td>
                    <td className="num px-2.5 py-2 text-right text-muted">{c.routesServed}</td>
                    <td className="num px-2.5 py-2 text-right text-ink">
                      <ProvValue
                        provenance={{
                          label: `${c.name} median fare`,
                          value: c.medianFare,
                          method: 'Median of observed fares, current window',
                          unit: 'inr',
                          periodIdx: lastIdx,
                          airlineCode: c.code,
                        }}
                      >
                        {fmtINR(c.medianFare)}
                      </ProvValue>
                    </td>
                    <td
                      className={cn(
                        'num px-2.5 py-2 text-right font-medium',
                        c.matchedPremiumPct >= 0 ? 'text-neg' : 'text-pos',
                      )}
                    >
                      {fmtPct(c.matchedPremiumPct, 1)}
                      {c.matchedTest && c.matchedTest.decision === 'reject' ? (
                        <span className="ml-1 text-2xs text-faint">*</span>
                      ) : null}
                    </td>
                    <td className="num px-2.5 py-2 text-right text-ink">
                      {fmtPct(c.avgYoy, 2)}
                    </td>
                    <td className="num px-2.5 py-2 text-right text-muted">
                      {fmtPct(c.naiveAvgYoy, 2)}
                    </td>
                    <td
                      className={cn(
                        'num px-2.5 py-2 text-right font-medium',
                        Math.abs(gap) > 1 ? 'text-warn' : 'text-muted',
                      )}
                    >
                      {fmtPP(gap, 2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-2.5 py-2 text-2xs text-faint">
            * matched-pairs difference significant at the 5% level. Year-on-year figures
            are the average over every twelve-month pair in view, not a single point
            comparison.
          </p>
        </div>

        <div className="flex flex-col gap-2 p-3 sm:hidden">
          {ranked.map((c) => (
            <CarrierCard
              key={c.code}
              carrier={c}
              focused={focus === c.code}
              onSelect={() => setFocus(focus === c.code ? null : c.code)}
              lastIdx={lastIdx}
            />
          ))}
        </div>
      </Panel>

      {focus ? (
        <FadeIn>
          <CarrierDetail
            carrier={ranked.find((c) => c.code === focus)!}
            periodFrom={periodFrom}
            lastIdx={lastIdx}
          />
        </FadeIn>
      ) : null}

      <Panel>
        <PanelHeader title="Reading this screen" />
        <div className="grid gap-3 p-3 text-xs leading-relaxed text-muted sm:grid-cols-2 sm:p-4">
          <p>
            A carrier&rsquo;s mean fare is not its price level. IndiGo flies the densest
            trunk routes at the shortest booking horizons; Air India carries a business
            cabin. Averaging their quotes together and then comparing produces a number
            that mostly describes two different networks. The{' '}
            <span className="text-ink">matched premium</span> column avoids that by
            comparing only inside a single route, cabin, fare family, booking horizon and
            month &mdash; the cells where the carriers genuinely competed.
          </p>
          <p>
            Two coverage limits are worth stating plainly. The panel is sixty trunk
            origin-destination pairs, so <span className="text-ink">Alliance Air</span>
            &mdash; a regional operator flying thin sectors this panel barely touches
            &mdash; appears at well under one percent, far below its national share. And
            quote share is not seat share: a carrier selling three cabins is quoted three
            times where a single-cabin carrier is quoted once.
          </p>
          <p>
            The <span className="text-ink">mix effect</span> column is the same argument
            one level down. Each carrier has its own constant-quality index and its own
            naive average, computed on its own quotes. Where the two disagree, that
            carrier&rsquo;s own sample composition moved within the window &mdash; more
            last-minute quotes, or more premium cabin &mdash; and the naive figure has
            reported that shift as a price change.
          </p>
        </div>
      </Panel>
    </div>
  )
}

function CarrierCard({
  carrier: c,
  focused,
  onSelect,
  lastIdx,
}: {
  carrier: CarrierDto
  focused: boolean
  onSelect: () => void
  lastIdx: number
}): React.ReactElement {
  const gap = c.naiveAvgYoy - c.avgYoy
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'rounded border border-line bg-elevated/40 p-3 text-left transition-colors',
        focused && 'border-accent/50 bg-elevated',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: c.colour }}
            aria-hidden
          />
          <span className="truncate text-xs font-medium text-ink">{c.name}</span>
        </span>
        <Badge tone={MODEL_TONE[c.model] ?? 'neutral'}>{c.model}</Badge>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Readout label="Share" value={fmtShare(c.observationShare)} />
        <Readout label="Median" value={fmtINR(c.medianFare)} />
        <Readout
          label="Premium"
          value={fmtPct(c.matchedPremiumPct, 1)}
          tone={c.matchedPremiumPct >= 0 ? 'negative' : 'positive'}
        />
        <Readout label="Adjusted" value={fmtPct(c.avgYoy, 1)} />
        <Readout label="Naive" value={fmtPct(c.naiveAvgYoy, 1)} />
        <Readout
          label="Mix"
          value={fmtPP(gap, 1)}
          tone={Math.abs(gap) > 1 ? 'warning' : 'default'}
        />
      </div>
      <p className="mt-2 text-2xs text-faint">
        {fmtCompact(c.nObservations)} quotes on {c.routesServed} routes, booked{' '}
        {fmtNumber(c.meanHorizonDays, 0)} days ahead on average
        {lastIdx >= 0 ? '' : ''}
      </p>
    </button>
  )
}

function CarrierDetail({
  carrier: c,
  periodFrom,
  lastIdx,
}: {
  carrier: CarrierDto
  periodFrom: number
  lastIdx: number
}): React.ReactElement {
  const t = c.matchedTest
  return (
    <Panel>
      <PanelHeader
        title={`${c.name} (${c.code})`}
        subtitle={MODEL_NOTE[c.model] ?? ''}
        actions={<Badge tone={MODEL_TONE[c.model] ?? 'neutral'}>{c.model}</Badge>}
      />
      <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4 sm:p-4 lg:grid-cols-6">
        <Readout
          label="Mean fare"
          value={
            <ProvValue
              provenance={{
                label: `${c.name} mean fare`,
                value: c.meanFare,
                method: 'Arithmetic mean of observed fares',
                unit: 'inr',
                periodIdx: lastIdx,
                airlineCode: c.code,
              }}
            >
              {fmtINR(c.meanFare)}
            </ProvValue>
          }
        />
        <Readout label="P10–P90" value={`${fmtINR(c.p10)} – ${fmtINR(c.p90)}`} />
        <Readout label="Index, latest" value={fmtIndex(c.index[c.index.length - 1] ?? NaN)} />
        <Readout label="Seat share" value={fmtShare(c.seatShare)} />
        <Readout label="Matched cells" value={fmtNumber(c.matchedCells)} />
        <Readout
          label="Mean horizon"
          value={`${fmtNumber(c.meanHorizonDays, 1)} d`}
          info="Average days between the quote and departure. A carrier quoted closer to departure will look more expensive before any adjustment."
        />
      </div>

      <div className="border-t border-line p-3 sm:p-4">
        <p className="label-caps mb-2">Cabin mix</p>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-elevated">
          {c.cabinMix.map((m) => (
            <div
              key={m.cabin}
              style={{ width: `${m.share * 100}%`, backgroundColor: c.colour }}
              className={cn(
                m.cabin === 'economy' && 'opacity-100',
                m.cabin === 'premium' && 'opacity-60',
                m.cabin === 'business' && 'opacity-30',
              )}
              title={`${m.cabin}: ${fmtShare(m.share)}`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {c.cabinMix
            .filter((m) => m.share > 0)
            .map((m) => (
              <span key={m.cabin} className="text-2xs capitalize text-faint">
                {m.cabin} <span className="num text-muted">{fmtShare(m.share)}</span>
              </span>
            ))}
        </div>
      </div>

      {t ? (
        <div className="border-t border-line p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="label-caps">{t.test}</p>
            <Badge tone={t.decision === 'reject' ? 'accent' : 'neutral'}>
              {t.decision === 'reject' ? 'Reject H0' : 'Fail to reject H0'}
            </Badge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Readout label="t" value={t.statistic.toFixed(2)} />
            <Readout label="p" value={fmtP(t.pValue)} />
            <Readout label="df" value={fmtNumber(t.df ?? 0)} />
            <Readout label="Cohen's d" value={(t.effectSize ?? 0).toFixed(3)} />
          </div>
          <p className="mt-2.5 text-2xs leading-relaxed text-muted">
            <span className="text-faint">H0: </span>
            {t.nullHypothesis}
          </p>
          <p className="mt-1 text-2xs leading-relaxed text-muted">{t.interpretation}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(t.assumptionsChecked).map(([k, v]) => (
              <Badge key={k} tone={v ? 'positive' : 'warning'}>
                {v ? '✓' : '!'} {k}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <p className="border-t border-line px-3 py-2 text-2xs text-faint sm:px-4">
        Window starts at period index {periodFrom}. Change it in the range bar above and
        every figure on this screen recomputes.
      </p>
    </Panel>
  )
}
