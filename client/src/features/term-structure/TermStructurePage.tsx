import * as React from 'react'
import { Pause, Play, SkipBack } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import { EChart, type ChartTokens } from '@/components/charts/EChart'
import type { EChartsOption } from 'echarts'
import { alpha, categoryAxis, SERIES_COLOURS, valueAxis } from '@/components/charts/theme'
import {
  Badge,
  Button,
  ChartSkeleton,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Segmented,
  Tip,
} from '@/components/ui/primitives'
import { AnimatedNumber, FadeIn, Readout } from '@/components/ui/numbers'
import { useFilter, useTermStructure } from '@/data/hooks'
import { fitNelsonSiegel } from '@/lib/quant/nelsonSiegel'
import { fmtDate, fmtMonthShort } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The Term Structure Lab.
 *
 * A fare curve is the price of the SAME departure quoted at different lead times. Two
 * facts make it worth a screen of its own:
 *
 *  - It is the single largest source of price variation in the data, which is why an
 *    index that ignores booking horizon is not measuring price at all.
 *  - Its movements decompose almost perfectly into three factors - level, slope and
 *    curvature - exactly as a yield curve does. That is not an analogy imposed on the
 *    data; it is what the eigendecomposition returns, and the shape classifier states
 *    its reasoning so the labels can be checked rather than believed.
 */

type View = 'curve' | 'surface'

function useScrubber(length: number, enabled: boolean): {
  index: number
  playing: boolean
  setIndex: (i: number) => void
  toggle: () => void
  reset: () => void
} {
  const [index, setIndex] = React.useState(Math.max(0, length - 1))
  const [playing, setPlaying] = React.useState(false)
  const raf = React.useRef<number | null>(null)
  const last = React.useRef(0)

  // On the first render there are no buckets yet, so the initial state lands on 0.
  // Once the data arrives the scrubber belongs at the LATEST week - that is the one
  // the reader came to see; the rest is history they scrub back into.
  const seen = React.useRef(0)
  React.useEffect(() => {
    if (length === 0) return
    if (seen.current === 0) setIndex(length - 1)
    else setIndex((i) => Math.min(i, length - 1))
    seen.current = length
  }, [length])

  React.useEffect(() => {
    if (!playing || !enabled) return undefined
    const step = (now: number): void => {
      // ~12 buckets a second: fast enough to read as motion, slow enough that the
      // curve's shape change is legible rather than a blur.
      if (now - last.current > 83) {
        last.current = now
        setIndex((i) => (i + 1) % Math.max(1, length))
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [playing, length, enabled])

  return {
    index,
    playing,
    setIndex,
    toggle: () => setPlaying((p) => !p),
    reset: () => {
      setPlaying(false)
      setIndex(Math.max(0, length - 1))
    },
  }
}

export default function TermStructurePage(): React.ReactElement {
  const filter = useFilter()
  const { data, loading, error, refresh } = useTermStructure(filter)
  const reduce = useReducedMotion()
  const [view, setView] = React.useState<View>('curve')

  const nBuckets = data?.curves.length ?? 0
  const scrub = useScrubber(nBuckets, reduce !== true)
  const selected = data?.curves[scrub.index]

  // The same function the worker used, run on the selected week. Fitting nine points
  // costs microseconds, and it guarantees the curve drawn is the curve described.
  const fit = React.useMemo(
    () => (data && selected ? fitNelsonSiegel(data.horizons, selected) : null),
    [data, selected],
  )

  const curveOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data || !selected || !fit) return {} as EChartsOption
      // Days-to-departure runs right to left: the departure date is the destination,
      // so time flows toward the right-hand edge as it does on every other chart here.
      const cats = [...data.horizons].reverse().map((h) => `T-${h}`)
      const rev = <T,>(xs: T[]): T[] => [...xs].reverse()
      const toMultiple = (v: number): number => Math.exp(v)

      return {
        grid: { left: 4, right: 10, top: 30, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0 },
        xAxis: categoryAxis(tok, { data: cats, boundaryGap: false }),
        yAxis: valueAxis(tok, {
          scale: true,
          axisLabel: { formatter: (v: number) => `${v.toFixed(2)}x` },
        }),
        tooltip: {
          valueFormatter: (v: unknown) =>
            typeof v === 'number' ? `${v.toFixed(3)}x route mean` : '--',
        },
        series: [
          {
            name: 'Window mean curve',
            type: 'line',
            symbol: 'none',
            smooth: true,
            silent: true,
            lineStyle: { width: 1.25, color: tok.faint, type: 'dashed' },
            itemStyle: { color: tok.faint },
            data: rev(data.meanCurve.map(toMultiple)),
            z: 2,
          },
          {
            name: 'Nelson-Siegel fit',
            type: 'line',
            symbol: 'none',
            smooth: true,
            silent: true,
            lineStyle: { width: 3, color: alpha(SERIES_COLOURS[3], 0.55) },
            itemStyle: { color: SERIES_COLOURS[3] },
            data: rev(fit.fitted.map(toMultiple)),
            z: 3,
          },
          {
            name: 'Observed curve',
            type: 'line',
            symbol: 'circle',
            symbolSize: 5,
            smooth: false,
            lineStyle: { width: 2, color: tok.accent },
            itemStyle: { color: tok.accent },
            areaStyle: { color: alpha(tok.accent, 0.07) },
            data: rev(selected.map(toMultiple)),
            z: 5,
          },
        ],
      }
    },
    [data, selected, fit],
  )

  const surfaceOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const cells: [number, number, number][] = []
      let lo = Infinity
      let hi = -Infinity
      for (let b = 0; b < data.curves.length; b++) {
        for (let h = 0; h < data.horizons.length; h++) {
          const v = Math.exp(data.curves[b]![h]!)
          cells.push([b, data.horizons.length - 1 - h, v])
          lo = Math.min(lo, v)
          hi = Math.max(hi, v)
        }
      }
      return {
        grid: { left: 4, right: 14, top: 8, bottom: 40, containLabel: true },
        legend: { show: false },
        tooltip: {
          trigger: 'item',
          formatter: (p: unknown) => {
            const d = (p as { data: [number, number, number] }).data
            const h = data.horizons[data.horizons.length - 1 - d[1]]
            return `${fmtDate(data.bucketStartDates[d[0]] ?? '')}<br/>T-${h} &middot; ${d[2].toFixed(3)}x`
          },
        },
        xAxis: categoryAxis(tok, {
          data: data.bucketStartDates.map((d) => fmtMonthShort(d.slice(0, 7))),
          boundaryGap: true,
          axisLabel: { color: tok.faint, fontSize: 9, hideOverlap: true },
        }),
        yAxis: {
          type: 'category',
          data: [...data.horizons].reverse().map((h) => `T-${h}`),
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: tok.faint, fontSize: 10 },
        },
        visualMap: {
          min: lo,
          max: hi,
          calculable: false,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          itemWidth: 10,
          itemHeight: 90,
          textStyle: { color: tok.faint, fontSize: 10 },
          inRange: { color: ['#15181D', '#1F4A52', '#2F8C8C', '#4ECDB4', '#E0A45E', '#E06A5E'] },
        },
        series: [
          {
            type: 'heatmap',
            data: cells,
            progressive: 2000,
            itemStyle: { borderWidth: 0 },
            emphasis: { itemStyle: { borderColor: tok.text, borderWidth: 1 } },
          },
        ],
      }
    },
    [data],
  )

  const loadingsOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      return {
        grid: { left: 4, right: 10, top: 30, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0 },
        xAxis: categoryAxis(tok, {
          data: data.horizons.map((h) => `T-${h}`),
          boundaryGap: false,
        }),
        yAxis: valueAxis(tok, { scale: true }),
        tooltip: {
          valueFormatter: (v: unknown) => (typeof v === 'number' ? v.toFixed(3) : '--'),
        },
        series: data.components.map((c, i) => ({
          name: c.label,
          type: 'line',
          symbol: 'circle',
          symbolSize: 5,
          smooth: true,
          lineStyle: { width: 2, color: SERIES_COLOURS[i] },
          itemStyle: { color: SERIES_COLOURS[i] },
          data: c.loadings,
          markLine:
            i === 0
              ? {
                  silent: true,
                  symbol: 'none',
                  label: { show: false },
                  lineStyle: { color: tok.grid },
                  data: [{ yAxis: 0 }],
                }
              : undefined,
        })),
      }
    },
    [data],
  )

  const paramPathOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const months = data.parameterPath.map((p) => fmtMonthShort(p.date.slice(0, 7)))
      const mk = (
        name: string,
        key: 'beta0' | 'beta1' | 'beta2',
        colour: string,
      ): Record<string, unknown> => ({
        name,
        type: 'line',
        symbol: 'none',
        smooth: true,
        lineStyle: { width: 1.6, color: colour },
        itemStyle: { color: colour },
        data: data.parameterPath.map((p) => p[key]),
      })
      return {
        grid: { left: 4, right: 10, top: 30, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0 },
        xAxis: categoryAxis(tok, { data: months }),
        yAxis: valueAxis(tok, { scale: true }),
        tooltip: {
          valueFormatter: (v: unknown) => (typeof v === 'number' ? v.toFixed(3) : '--'),
        },
        series: [
          mk('b0 level', 'beta0', SERIES_COLOURS[0]),
          mk('b1 short-end premium', 'beta1', SERIES_COLOURS[1]),
          mk('b2 curvature', 'beta2', SERIES_COLOURS[2]),
          {
            type: 'line',
            name: 'selected week',
            symbol: 'none',
            silent: true,
            lineStyle: { opacity: 0 },
            data: [],
            markLine: {
              silent: true,
              symbol: 'none',
              label: { show: false },
              lineStyle: { color: tok.accent, type: 'dashed', width: 1 },
              data: [{ xAxis: scrub.index }],
            },
          },
        ],
      }
    },
    [data, scrub.index],
  )

  if (error) {
    return (
      <Panel>
        <ErrorState message={error} onRetry={refresh} />
      </Panel>
    )
  }

  const bucketLabel = data ? fmtDate(data.bucketStartDates[scrub.index] ?? '') : ''

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        kicker="Term structure"
        title="Fare against days to departure"
        description={
          <>
            Each curve is one week of departures, priced at nine booking horizons, with
            every observation expressed relative to its own route so the shape is not an
            artefact of which routes happened to be sampled. Scrub through the window and
            watch the short end move.
          </>
        }
        actions={
          data ? (
            <Badge tone="neutral">
              {data.curves.length} weekly curves &middot; {data.bucketDays}-day buckets
            </Badge>
          ) : null
        }
      />

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel>
          <PanelHeader
            title={view === 'curve' ? 'Fare curve' : 'Horizon by departure week'}
            subtitle={
              view === 'curve'
                ? `Multiple of the route's own mean fare · week of ${bucketLabel}`
                : 'Every curve in the window at once'
            }
            info="Values are exp(mean log fare minus the route mean), so 2.0 means twice what that route charges on average. Expressing it per route removes the level differences between DEL-BOM and MAA-IXZ and leaves only the shape."
            actions={
              <Segmented<View>
                ariaLabel="Term structure view"
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  { value: 'curve', label: 'Curve' },
                  { value: 'surface', label: 'Surface' },
                ]}
              />
            }
          />
          {loading || !data ? (
            <ChartSkeleton height={340} />
          ) : (
            <>
              <div className="p-1.5 sm:p-2">
                {view === 'curve' ? (
                  <EChart
                    ariaLabel="Fare as a multiple of the route mean, by booking horizon, for the selected week"
                    option={curveOption}
                    height={330}
                    mobileHeight={250}
                  />
                ) : (
                  <EChart
                    ariaLabel="Heatmap of fare multiple by booking horizon and departure week"
                    option={surfaceOption}
                    height={330}
                    mobileHeight={280}
                    notMerge
                  />
                )}
              </div>

              {view === 'curve' ? (
                <div className="flex items-center gap-2.5 border-t border-line px-3 py-2.5 sm:px-4">
                  <Button
                    size="sm"
                    variant={scrub.playing ? 'primary' : 'default'}
                    onClick={scrub.toggle}
                    aria-label={scrub.playing ? 'Pause playback' : 'Play through the window'}
                    disabled={reduce === true}
                  >
                    {scrub.playing ? (
                      <Pause className="h-3 w-3" aria-hidden />
                    ) : (
                      <Play className="h-3 w-3" aria-hidden />
                    )}
                    <span className="hidden sm:inline">
                      {scrub.playing ? 'Pause' : 'Play'}
                    </span>
                  </Button>
                  <Button size="sm" onClick={scrub.reset} aria-label="Back to the latest week">
                    <SkipBack className="h-3 w-3" aria-hidden />
                  </Button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, nBuckets - 1)}
                    value={scrub.index}
                    onChange={(e) => scrub.setIndex(Number(e.target.value))}
                    aria-label="Departure week"
                    className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-elevated accent-[rgb(var(--aq-accent))]"
                  />
                  <span className="num w-24 shrink-0 text-right text-2xs text-faint">
                    {bucketLabel}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Nelson-Siegel parameters"
            subtitle={`Fitted to the week of ${bucketLabel}`}
            info="Tau is profiled over a grid and refined by golden section, with the three betas solved in closed form at each candidate. That is exact where a simplex search on this surface can settle in a local minimum."
          />
          {loading || !data || !fit ? (
            <ChartSkeleton height={320} />
          ) : (
            <div className="flex flex-col gap-3 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['b0', fit.beta0, 'Level', fit.interpretation.level],
                    ['b1', fit.beta1, 'Short-end premium', fit.interpretation.slope],
                    ['b2', fit.beta2, 'Curvature', fit.interpretation.curvature],
                    ['tau', fit.tau, 'Decay (days)', fit.interpretation.tau],
                  ] as const
                ).map(([sym, value, label, note], i) => (
                  <FadeIn key={sym} delay={i * 0.04}>
                    <Tip content={note}>
                      <div className="cursor-help rounded border border-line bg-elevated/40 p-2.5">
                        <p className="label-caps">
                          {sym} &middot; {label}
                        </p>
                        <AnimatedNumber
                          value={value}
                          format={(v) => (sym === 'tau' ? v.toFixed(1) : v.toFixed(3))}
                          className="mt-1 block text-xl font-semibold text-ink"
                        />
                      </div>
                    </Tip>
                  </FadeIn>
                ))}
              </div>

              <div className="rounded border border-line bg-elevated/30 p-2.5">
                <p className="text-2xs leading-relaxed text-muted">
                  {fit.interpretation.slope}
                </p>
                <p className="mt-1.5 text-2xs leading-relaxed text-muted">
                  {fit.interpretation.curvature}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-line pt-2.5">
                <Readout label="Fit R-squared" value={fit.r2.toFixed(4)} tone="accent" />
                <Readout label="Points fitted" value={String(fit.n)} />
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Principal components of the curve"
            subtitle={
              data
                ? `${(data.components[2]!.cumulativeVariance * 100).toFixed(1)}% of variance in three factors`
                : undefined
            }
            info="Covariance eigendecomposition by cyclic Jacobi. Shape labels are assigned by inspecting the loading pattern, and each component reports the rule that classified it - a component that matches nothing is reported as unclassified rather than forced into a label."
          />
          {loading || !data ? (
            <ChartSkeleton height={260} />
          ) : (
            <>
              <div className="p-1.5 sm:p-2">
                <EChart
                  ariaLabel="Principal component loadings across booking horizons"
                  option={loadingsOption}
                  height={250}
                  mobileHeight={220}
                />
              </div>
              <ul className="divide-y divide-line border-t border-line">
                {data.components.map((c, i) => (
                  <li key={c.index} className="flex items-start gap-3 px-3 py-2.5 sm:px-4">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: SERIES_COLOURS[i] }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-medium text-ink">{c.label}</p>
                        <p className="num shrink-0 text-xs text-accent">
                          {(c.varianceExplained * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-elevated">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${c.varianceExplained * 100}%`,
                            background: SERIES_COLOURS[i],
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-2xs leading-relaxed text-faint">
                        {c.rationale}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Parameters through the window"
            subtitle="Where the short-end premium and the mid-horizon fence moved"
            info="The dashed marker follows the scrubber on the curve chart."
          />
          {loading || !data ? (
            <ChartSkeleton height={260} />
          ) : (
            <>
              <div className="p-1.5 sm:p-2">
                <EChart
                  ariaLabel="Nelson-Siegel parameters over the window"
                  option={paramPathOption}
                  height={250}
                  mobileHeight={220}
                />
              </div>
              <div className="border-t border-line p-3 text-2xs leading-relaxed text-muted sm:p-4">
                <p>
                  The short-end premium{' '}
                  <span className="num text-ink">b1</span> is the loading a passenger pays
                  for booking late. It is not constant: it tightens when the aircraft is
                  already filling, which in this data means it moves with the season. An
                  index built on a fixed booking horizon prices that movement correctly; an
                  average of whatever was collected mistakes it for inflation.
                </p>
              </div>
            </>
          )}
        </Panel>
      </div>

      <div
        className={cn(
          'rounded border border-line bg-elevated/30 px-3 py-2.5 text-2xs leading-relaxed text-faint',
        )}
      >
        Curves are bucketed weekly before decomposition. A single departure date carries
        only a few dozen quotes per horizon, and that sampling noise is independent across
        horizons, so it spreads evenly over all nine components and buries the third
        factor under measurement error. Averaging a week cuts it by roughly the square
        root of seven while leaving the term structure, which moves far more slowly,
        untouched.
      </div>
    </div>
  )
}
