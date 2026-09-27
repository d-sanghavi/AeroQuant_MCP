import * as React from 'react'
import { Check, X } from 'lucide-react'
import type { EChartsOption } from 'echarts'
import { EChart, type ChartTokens } from '@/components/charts/EChart'
import { valueAxis, valueAxisX } from '@/components/charts/theme'
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
  Switch,
} from '@/components/ui/primitives'
import { FadeIn, ProvValue, Readout, StatTile } from '@/components/ui/numbers'
import { useAnomalies, useFilter } from '@/data/hooks'
import { fmtMonth, fmtNumber, fmtP, fmtPct, fmtPP } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AnomalyDto } from '@/data/worker/protocol'

/**
 * Anomaly Console.
 *
 * Every route-month in the window is tested, which is several hundred tests. At a 5%
 * threshold, several hundred tests produce a dozen or more "significant" results from
 * noise alone - and a monitoring screen that reports those as anomalies will be
 * ignored within a week, which is the worst outcome for a monitoring screen.
 *
 * So the multiplicity correction is not an advanced option hidden in a menu. It is a
 * toggle at the top of the screen, it is on by default, and turning it off visibly
 * inflates the list. The Benjamini-Hochberg staircase is drawn next to the list so the
 * mechanism is inspectable rather than asserted: the reader can see which p-values fall
 * under the line and which do not.
 */

type Label = 'accepted' | 'rejected'

const SEVERITY_TONE: Record<AnomalyDto['severity'], 'negative' | 'warning' | 'neutral'> = {
  high: 'negative',
  medium: 'warning',
  low: 'neutral',
}

export default function AnomaliesPage(): React.ReactElement {
  const filter = useFilter()
  const [q, setQ] = React.useState(0.05)
  const { data, loading, error, refresh } = useAnomalies(filter, q)
  const [useFdr, setUseFdr] = React.useState(true)
  const [labels, setLabels] = React.useState<Record<string, Label>>({})

  const shown = React.useMemo(() => {
    if (!data) return []
    return data.anomalies
      .filter((a) => (useFdr ? a.flaggedFdr : a.flaggedRaw))
      .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
  }, [data, useFdr])

  const label = (id: string, value: Label): void =>
    setLabels((prev) => ({ ...prev, [id]: prev[id] === value ? undefined : value }) as Record<string, Label>)

  const accepted = Object.values(labels).filter((v) => v === 'accepted').length
  const rejected = Object.values(labels).filter((v) => v === 'rejected').length
  const expectedFalse = data ? data.nTested * q : 0

  /**
   * The Benjamini-Hochberg staircase.
   *
   * Sorted p-values against their rank, with the line i*q/m over the top. BH rejects
   * everything up to the largest rank whose p-value is still under that line - which is
   * why one borderline p-value can pull several others in with it, and why the
   * procedure is not the same as simply using a smaller alpha.
   */
  const bhOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const ps = data.anomalies.map((a) => a.pValue).sort((a, b) => a - b)
      const m = data.nTested
      // Only the head of the distribution is informative; the tail is a flat line at 1.
      const cut = Math.min(ps.length, Math.max(40, data.nFdrFlagged * 6))
      const points = ps.slice(0, cut).map((p, i) => [i + 1, p])
      const line = points.map(([i]) => [i, ((i as number) * q) / m])
      const threshold = data.anomalies
        .filter((a) => a.flaggedFdr)
        .reduce((mx, a) => Math.max(mx, a.pValue), 0)

      return {
        grid: { left: 4, right: 12, top: 28, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0, data: ['Sorted p-values', 'BH threshold i·q/m'] },
        xAxis: valueAxisX(tok, {
          min: 1,
          max: cut,
          axisLabel: { color: tok.faint, fontSize: 10 },
        }),
        yAxis: valueAxis(tok, { scale: true, axisLabel: { color: tok.faint, fontSize: 10 } }),
        tooltip: {
          trigger: 'axis',
          valueFormatter: (v: unknown) =>
            typeof v === 'number' ? (v < 1 ? v.toFixed(5) : String(v)) : '--',
        },
        series: [
          {
            name: 'Sorted p-values',
            type: 'scatter',
            symbolSize: 5,
            itemStyle: { color: tok.accent },
            data: points,
          },
          {
            name: 'BH threshold i·q/m',
            type: 'line',
            symbol: 'none',
            lineStyle: { color: tok.warning, width: 1.4, type: 'dashed' },
            itemStyle: { color: tok.warning },
            data: line,
            markLine: threshold > 0
              ? {
                  silent: true,
                  symbol: 'none',
                  data: [{ yAxis: threshold }],
                  lineStyle: { color: tok.negative, width: 1, type: 'dotted' },
                  label: {
                    formatter: `rejected below p = ${threshold.toExponential(1)}`,
                    color: tok.faint,
                    fontSize: 9,
                    position: 'insideEndTop',
                  },
                }
              : undefined,
          },
        ],
      }
    },
    [data, q],
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
        title="Anomaly Console"
        description="Every route-month in the window is tested against that route’s own return distribution, with the month under test excluded from the scale. With that many tests, the interesting question is not which ones are significant but how many of the significant ones are real."
        actions={
          <Segmented
            ariaLabel="False discovery rate"
            value={String(q)}
            onChange={(v) => setQ(Number(v))}
            options={[
              { value: '0.01', label: 'q = 1%' },
              { value: '0.05', label: 'q = 5%' },
              { value: '0.1', label: 'q = 10%' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile
          label="Tests run"
          value={data ? data.nTested : NaN}
          format={(v) => fmtNumber(v)}
          secondary="route-months in the window"
          info="One test per route per month: that month’s log change in the route’s constant-quality index, standardised against the route’s own history with the month itself left out."
        />
        <StatTile
          label="Flagged, uncorrected"
          value={data ? data.nRawFlagged : NaN}
          format={(v) => fmtNumber(v)}
          secondary={`at p < ${q}`}
          info="What a naive threshold reports. Most of a monitoring team's wasted effort lives in this number."
        />
        <StatTile
          label="Flagged after BH"
          value={data ? data.nFdrFlagged : NaN}
          format={(v) => fmtNumber(v)}
          secondary={`FDR controlled at ${(q * 100).toFixed(0)}%`}
          info="Benjamini-Hochberg controls the expected proportion of false positives among the flags, rather than the chance of any false positive at all. For monitoring, that is the quantity a team actually cares about."
        />
        <StatTile
          label="Expected by chance"
          value={expectedFalse}
          format={(v) => fmtNumber(v, 1)}
          secondary={
            data && data.nRawFlagged > 0
              ? `${((expectedFalse / data.nRawFlagged) * 100).toFixed(0)}% of the raw flags`
              : undefined
          }
          info="Tests times alpha. If the uncorrected count is close to this, the uncorrected list is mostly noise."
        />
      </div>

      <Panel>
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <Switch
            checked={useFdr}
            onChange={setUseFdr}
            label="Correct for multiple testing (Benjamini-Hochberg)"
            description={
              data
                ? `${data.nRawFlagged} routes flagged without the correction, ${data.nFdrFlagged} with it. The difference is the number of alerts a team would have chased for nothing.`
                : undefined
            }
          />
          <div className="flex shrink-0 gap-4">
            <Readout label="Accepted" value={fmtNumber(accepted)} tone="accent" />
            <Readout label="Rejected" value={fmtNumber(rejected)} />
            <Readout
              label="Labelled"
              value={`${fmtNumber(accepted + rejected)} / ${fmtNumber(shown.length)}`}
            />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Panel className="xl:col-span-3">
          <PanelHeader
            title={useFdr ? 'Flagged movements, FDR controlled' : 'Flagged movements, uncorrected'}
            subtitle={`${shown.length} ${shown.length === 1 ? 'route-month' : 'route-months'} · sorted by absolute z`}
            info="Accepting or rejecting a flag builds the labelled set a supervised detector would later be trained on. Nothing is sent anywhere; the counter is local to this session."
          />
          <div className="flex max-h-[38rem] flex-col gap-2 overflow-y-auto p-3 sm:p-4">
            {loading || !data ? (
              <ChartSkeleton height={280} />
            ) : shown.length === 0 ? (
              <EmptyState
                title="Nothing survives the correction"
                detail={
                  useFdr
                    ? `At q = ${q}, none of the ${data.nRawFlagged} raw flags hold up. That is a result, not an empty screen - it says this window contains no movement distinguishable from the noise across ${fmtNumber(data.nTested)} tests.`
                    : 'No route-month crosses the threshold in this window.'
                }
                action={
                  useFdr ? (
                    <Button size="sm" onClick={() => setUseFdr(false)}>
                      Show the uncorrected list
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              shown.map((a, i) => (
                <FadeIn key={a.id} delay={Math.min(i * 0.02, 0.2)}>
                  <AnomalyRow
                    anomaly={a}
                    label={labels[a.id]}
                    onLabel={(v) => label(a.id, v)}
                    showAdjusted={useFdr}
                  />
                </FadeIn>
              ))
            )}
          </div>
        </Panel>

        <Panel className="xl:col-span-2">
          <PanelHeader
            title="The Benjamini-Hochberg staircase"
            subtitle="Sorted p-values against the rank-dependent threshold"
            info="Each point is one test. The dashed line is i times q over m. BH rejects every test up to the largest rank still under the line, which is why the cutoff is not a fixed p-value."
          />
          {loading || !data ? (
            <ChartSkeleton height={300} />
          ) : (
            <>
              <EChart
                option={bhOption}
                height={320}
                mobileHeight={240}
                ariaLabel="Benjamini-Hochberg threshold against sorted p-values"
              />
              <p className="px-3 pb-3 text-2xs leading-relaxed text-faint sm:px-4">
                A fixed threshold of {q} would reject every point below a horizontal line
                at {q}. The rank-dependent line is far lower at the left and rises, so a
                test only survives if it is extreme <em>relative to how many tests were
                run</em>. That is the whole correction.
              </p>
            </>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Why the list is shorter than you expect" />
        <div className="grid gap-3 p-3 text-xs leading-relaxed text-muted sm:grid-cols-3 sm:p-4">
          <p>
            <span className="text-ink">The scale is estimated without the outlier in
            it.</span> Each route-month&rsquo;s log return is standardised against that
            route&rsquo;s own return distribution with the month under test removed. A
            single large move is therefore not allowed to inflate the yardstick it is
            being judged by &mdash; which is how a naive z-score quietly hides the very
            movement it was built to find.
          </p>
          <p>
            <span className="text-ink">The correction changes what is controlled.</span>{' '}
            A 5% per-test threshold controls the chance of one false positive in one
            test. Across {data ? fmtNumber(data.nTested) : 'several hundred'} tests that
            guarantees roughly {data ? fmtNumber(expectedFalse, 0) : 'a dozen'} false
            positives. BH instead controls the share of the flagged list that is false.
          </p>
          <p>
            <span className="text-ink">A short list is the point.</span> An operations
            team acts on this screen. The cost of a false flag is a wasted investigation
            and, eventually, a screen nobody opens &mdash; which is a larger failure than
            missing a marginal anomaly that next month will show again.
          </p>
        </div>
      </Panel>
    </div>
  )
}

function AnomalyRow({
  anomaly: a,
  label,
  onLabel,
  showAdjusted,
}: {
  anomaly: AnomalyDto
  label: Label | undefined
  onLabel: (value: Label) => void
  showAdjusted: boolean
}): React.ReactElement {
  // `observed` and `expected` are already month-on-month PERCENT changes, not index
  // levels, so the gap between them is a difference of two rates - percentage points.
  // Dividing one by the other would be comparing a rate against a rate and reporting
  // the answer as a percent, which is the error this codebase names in `fmtPP`.
  const deviation = a.observed - a.expected
  return (
    <div
      className={cn(
        'rounded border border-line bg-elevated/40 p-3 transition-colors',
        label === 'accepted' && 'border-accent/45',
        label === 'rejected' && 'opacity-55',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-xs font-medium text-ink">{a.routeLabel}</span>
            <span className="text-2xs text-faint">{fmtMonth(a.period)}</span>
            <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
            {label ? (
              <Badge tone={label === 'accepted' ? 'accent' : 'neutral'}>
                {label === 'accepted' ? 'accepted' : 'rejected'}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1.5 max-w-2xl text-2xs leading-relaxed text-muted">{a.explanation}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button
            size="sm"
            variant={label === 'accepted' ? 'primary' : 'default'}
            onClick={() => onLabel('accepted')}
            aria-label={`Accept the flag on ${a.routeLabel}`}
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> Real
          </Button>
          <Button
            size="sm"
            variant={label === 'rejected' ? 'danger' : 'default'}
            onClick={() => onLabel('rejected')}
            aria-label={`Reject the flag on ${a.routeLabel}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Not
          </Button>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Readout
          label="Observed move"
          value={
            <ProvValue
              provenance={{
                label: `${a.routeLabel} month-on-month move`,
                value: a.observed,
                method: 'Constant-quality route index, RYGEKS-FEWS',
                unit: 'percent',
                periodIdx: 0,
                routeId: a.routeId,
              }}
            >
              {fmtPct(a.observed, 1)}
            </ProvValue>
          }
        />
        <Readout
          label="Typical move"
          value={fmtPct(a.expected, 1)}
          info="The mean month-on-month move for this route, computed with the month under test excluded."
        />
        <Readout
          label="Gap"
          value={fmtPP(deviation, 1)}
          tone={deviation > 0 ? 'negative' : 'positive'}
        />
        <Readout label="z" value={a.zScore.toFixed(2)} />
        <Readout
          label={showAdjusted ? 'Adjusted p' : 'p'}
          value={fmtP(showAdjusted ? a.adjustedP : a.pValue)}
          tone="accent"
        />
      </div>
    </div>
  )
}
