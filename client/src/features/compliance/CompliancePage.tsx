import * as React from 'react'
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import type { EChartsOption } from 'echarts'
import { EChart, type ChartTokens } from '@/components/charts/EChart'
import { alpha, categoryAxis, valueAxis } from '@/components/charts/theme'
import {
  Badge,
  ChartSkeleton,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Switch,
  Tip,
} from '@/components/ui/primitives'
import { AnimatedNumber, Readout, StatTile } from '@/components/ui/numbers'
import { useFilter, useIndices } from '@/data/hooks'
import { useApp } from '@/data/store'
import { SOURCES, type Source } from '@/data/master/sources'
import { fmtCompact, fmtDate, fmtIndex, fmtMonthShort, fmtNumber, fmtShare } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Source Registry and compliance.
 *
 * The claim this screen has to survive is the one a judge will actually press on: that
 * the compilation would still publish if the scraped sources were withdrawn tomorrow.
 * Asserting that is worthless. So the master switch at the top of this screen really
 * does drop those sources out of the panel, and every number on every other screen
 * recomputes from the smaller sample.
 *
 * What the switch reveals is more interesting than "the error bars get bigger", and
 * the screen says so rather than claiming the tidier story. The confidence band barely
 * moves, because the bootstrap is clustered on ROUTE: its width is governed by how
 * many routes there are and how differently they behave, not by how many quotes sit
 * inside each one. Losing a fifth of the quotes while keeping all sixty routes is
 * therefore cheap in interval terms. What it does cost is coverage - more cells have
 * no observation at all and have to be imputed - and that is the number to watch.
 *
 * The other half of the screen is the registry itself. Two of the twelve sources are
 * disabled because their terms of service prohibit automated collection, and they are
 * listed anyway, with the clause quoted and the review dated. A registry that only
 * shows the sources you decided to use is a marketing page.
 */

const TOS_TONE: Record<Source['tos'], 'positive' | 'warning' | 'negative' | 'accent'> = {
  permitted: 'positive',
  'permitted-with-conditions': 'warning',
  prohibited: 'negative',
  'public-data': 'accent',
}

const TOS_LABEL: Record<Source['tos'], string> = {
  permitted: 'Permitted',
  'permitted-with-conditions': 'Conditional',
  prohibited: 'Prohibited',
  'public-data': 'Public data',
}

const ROBOTS_TONE: Record<Source['robots'], 'positive' | 'negative' | 'neutral'> = {
  allowed: 'positive',
  disallowed: 'negative',
  'not-applicable': 'neutral',
}

const KIND_LABEL: Record<Source['kind'], string> = {
  'aggregator-api': 'Aggregator API',
  'airline-direct': 'Airline direct',
  ota: 'Online travel agent',
  government: 'Government',
}

export default function CompliancePage(): React.ReactElement {
  const filter = useFilter()
  const { data, loading, error, refresh } = useIndices(filter)
  const disableScraped = useApp((s) => s.disableScraped)
  const setDisableScraped = useApp((s) => s.setDisableScraped)

  const prohibited = SOURCES.filter((s) => s.tos === 'prohibited')
  const scraped = SOURCES.filter((s) => s.isScraped && s.enabled)
  const scrapedShare = scraped.reduce((t, s) => t + s.observationShare, 0)
  const active = data ? new Set(data.sourcesUsed) : new Set<string>()

  const ciWidth = React.useMemo(() => {
    if (!data) return NaN
    let sum = 0
    let n = 0
    for (let t = 1; t < data.periods.length; t++) {
      const w = data.confidence.upper[t]! - data.confidence.lower[t]!
      if (Number.isFinite(w)) {
        sum += w
        n++
      }
    }
    return n > 0 ? sum / n : NaN
  }, [data])

  const ciOption = React.useCallback(
    (tok: ChartTokens): EChartsOption => {
      if (!data) return {} as EChartsOption
      const months = data.periods.map(fmtMonthShort)
      const lower = [...data.confidence.lower]
      const band = data.confidence.upper.map((u, i) => u - lower[i]!)
      return {
        grid: { left: 4, right: 8, top: 30, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0, data: ['National index', '95% interval'] },
        xAxis: categoryAxis(tok, { data: months }),
        yAxis: valueAxis(tok, { scale: true }),
        tooltip: {
          valueFormatter: (v: unknown) =>
            typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '--',
        },
        series: [
          {
            name: 'ci-base',
            type: 'line',
            stack: 'ci',
            symbol: 'none',
            lineStyle: { opacity: 0 },
            itemStyle: { color: 'transparent' },
            tooltip: { show: false },
            silent: true,
            data: lower,
            z: 1,
          },
          {
            name: '95% interval',
            type: 'line',
            stack: 'ci',
            symbol: 'none',
            lineStyle: { opacity: 0 },
            itemStyle: { color: alpha(tok.accent, 0.3) },
            areaStyle: { color: alpha(tok.accent, 0.16) },
            data: band,
            z: 1,
          },
          {
            name: 'National index',
            type: 'line',
            symbol: 'none',
            lineStyle: { width: 2.2, color: tok.accent },
            itemStyle: { color: tok.accent },
            data: data.national,
            z: 5,
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

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        kicker="Governance"
        title="Source Registry"
        description="Twelve sources, each with its robots verdict, the terms-of-service clause the verdict rests on, who reviewed it and when. Two are disabled because their terms prohibit automated collection; they are listed anyway."
      />

      {/* The kill switch. It is the first interactive element on the screen because it
          is the claim the screen exists to demonstrate. */}
      <Panel className={cn(disableScraped && 'border-warn/45')}>
        <div className="flex flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <Switch
            checked={disableScraped}
            onChange={setDisableScraped}
            label="Disable all scraped sources"
            description={`Withdraws the ${scraped.length} browser-collected sources from the panel and recomputes every index on this terminal from what is left. This is not a preview - the range bar, the Method Lab and the Index Terminal all move with it.`}
          />
          <div className="grid shrink-0 grid-cols-3 gap-4 lg:gap-6">
            <Readout
              label="Sources in use"
              value={
                <AnimatedNumber
                  value={data ? data.sourcesUsed.length : NaN}
                  format={(v) => fmtNumber(v)}
                />
              }
            />
            <Readout
              label="Observations"
              value={
                <AnimatedNumber
                  value={data ? data.nObservations : NaN}
                  format={(v) => fmtCompact(v)}
                />
              }
            />
            <Readout
              label="Still published"
              value={
                data && data.national.every((v, i) => i === 0 || Number.isFinite(v)) ? (
                  <span className="text-pos">Yes</span>
                ) : (
                  <span className="text-neg">No</span>
                )
              }
            />
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile
          label="Observations"
          value={data ? data.nObservations : NaN}
          format={(v) => fmtCompact(v)}
          secondary={data ? `${fmtCompact(data.nExcluded)} excluded by the filter` : undefined}
          info="Quotes surviving the current source and date filter. This is the sample every statistic on the terminal is computed from."
        />
        <StatTile
          label="Mean interval width"
          value={ciWidth}
          format={(v) => fmtIndex(v, 3)}
          secondary="index points, 95% band"
          info="Averaged over the window. This barely moves when sources are withdrawn, and that is not a bug: the bootstrap resamples ROUTES, so its width depends on how many routes there are and how differently they move, not on the quote count within each one. Coverage is what degrades - see the imputation tile."
        />
        <StatTile
          label="Imputed cells"
          value={data ? data.imputation.imputedRate * 100 : NaN}
          format={(v) => `${v.toFixed(1)}%`}
          secondary="product-months with no observation"
          info="A cell with no quote at all has to be imputed from its stratum. The rate rising is the honest cost of losing a source, and it is reported rather than absorbed."
        />
        <StatTile
          label="Prohibited sources"
          value={prohibited.length}
          format={(v) => fmtNumber(v)}
          secondary="listed, never collected"
          info="Sources whose terms of service forbid automated access. They stay in the registry with the clause quoted so that the decision is auditable."
        />
      </div>

      <Panel>
        <PanelHeader
          title="The index under the current source set"
          subtitle={
            disableScraped
              ? 'Scraped sources withdrawn — fewer observations, more imputation, index still published'
              : 'All permitted sources in use'
          }
          info="The 95% band is a block bootstrap clustered on route, so it reflects the sampling variability that actually remains after the correlation within a route is accounted for."
        />
        {loading || !data ? (
          <ChartSkeleton height={280} />
        ) : (
          <EChart
            option={ciOption}
            height={290}
            mobileHeight={220}
            ariaLabel="National index with its confidence interval under the current source set"
          />
        )}
      </Panel>

      {/* Registry: table from sm upward, cards below. */}
      <Panel>
        <PanelHeader
          title="Registry"
          subtitle={`${SOURCES.length} sources · ${SOURCES.filter((s) => s.enabled).length} enabled`}
          info="Every row states the clause the verdict rests on. A verdict without a clause reference and a review date is an opinion, not a verdict."
        />

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[62rem] text-left">
            <thead>
              <tr className="border-b border-line">
                {['Source', 'Kind', 'robots.txt', 'Terms', 'Reviewed', 'Rate limit', 'Reliability', 'Share', 'State'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={cn(
                        'label-caps whitespace-nowrap px-2.5 py-2',
                        i >= 5 && i <= 7 && 'text-right',
                      )}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => {
                const inUse = active.has(s.id)
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      'border-b border-line/60 text-xs last:border-0',
                      !s.enabled && 'opacity-60',
                    )}
                  >
                    <td className="px-2.5 py-2">
                      <span className="font-medium text-ink">{s.name}</span>
                      <p className="mt-0.5 max-w-sm text-2xs leading-relaxed text-faint">
                        {s.notes}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-muted">
                      {KIND_LABEL[s.kind]}
                      {s.isScraped ? (
                        <Badge tone="warning" className="ml-1.5">
                          scraped
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-2.5 py-2">
                      <Tip content={s.robotsPath}>
                        <span>
                          <Badge tone={ROBOTS_TONE[s.robots]}>{s.robots}</Badge>
                        </span>
                      </Tip>
                    </td>
                    <td className="px-2.5 py-2">
                      <Tip content={s.tosClause}>
                        <span>
                          <Badge tone={TOS_TONE[s.tos]}>{TOS_LABEL[s.tos]}</Badge>
                        </span>
                      </Tip>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-2xs text-muted">
                      {fmtDate(s.reviewedOn)}
                      <p className="text-faint">{s.reviewedBy}</p>
                    </td>
                    <td className="num px-2.5 py-2 text-right text-muted">
                      {s.rateLimitPerMin > 0 ? `${s.rateLimitPerMin}/min` : '—'}
                    </td>
                    <td className="num px-2.5 py-2 text-right text-muted">
                      {fmtShare(s.reliability, 1)}
                    </td>
                    <td className="num px-2.5 py-2 text-right text-muted">
                      {s.observationShare > 0 ? fmtShare(s.observationShare, 0) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2">
                      {!s.enabled ? (
                        <Badge tone="negative">
                          <ShieldX className="h-3 w-3" aria-hidden /> disabled
                        </Badge>
                      ) : inUse ? (
                        <Badge tone="positive">
                          <ShieldCheck className="h-3 w-3" aria-hidden /> in use
                        </Badge>
                      ) : (
                        <Badge tone="warning">
                          <ShieldAlert className="h-3 w-3" aria-hidden /> withdrawn
                        </Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 p-3 lg:hidden">
          {SOURCES.map((s) => (
            <SourceCard key={s.id} source={s} inUse={active.has(s.id)} />
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="The two we do not collect" />
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
          {prohibited.map((s) => (
            <div key={s.id} className="rounded border border-neg/35 bg-neg/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-ink">{s.name}</p>
                <Badge tone="negative">Prohibited</Badge>
              </div>
              <p className="mt-2 border-l-2 border-neg/40 pl-2.5 text-2xs italic leading-relaxed text-muted">
                {s.tosClause}
              </p>
              <p className="mt-2 text-2xs text-faint">
                Reviewed {fmtDate(s.reviewedOn)} by {s.reviewedBy}. robots.txt:{' '}
                <span className="num">{s.robots}</span>.
              </p>
            </div>
          ))}
        </div>
        <div className="border-t border-line p-3 text-xs leading-relaxed text-muted sm:p-4">
          <p>
            Both are large online travel agents whose fare inventory would materially
            improve coverage on leisure routes. Neither is collected, and the panel
            carries the resulting gap rather than closing it by other means. The
            alternative &mdash; collecting anyway and describing it as research &mdash;
            would make every number on this terminal inadmissible in the one setting it
            is built for.
          </p>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="What the switch demonstrates" />
        <div className="grid gap-3 p-3 text-xs leading-relaxed text-muted sm:grid-cols-3 sm:p-4">
          <p>
            <span className="text-ink">Resilience is a property, not a promise.</span> A
            compilation that depends on a single collection method has an operational
            risk that no methodology note can argue away. Throwing the switch removes the{' '}
            <span className="num text-ink">{fmtShare(scrapedShare, 0)}</span> of the panel
            those sources contribute, and the series survives it.
          </p>
          <p>
            <span className="text-ink">The cost is where you would not look for it.</span>{' '}
            The confidence band hardly moves, because a route-clustered bootstrap does
            not care much how many quotes each route contributed. What rises is the
            imputation rate: more product-months have no observation at all. That is the
            real degradation, and it is on a tile above rather than buried in a note.
          </p>
          <p>
            <span className="text-ink">The state is global.</span> The switch is part of
            the same filter as the date range, so the Method Lab, the carrier breakdown
            and the anomaly console are all looking at the restricted panel until it is
            turned back off.
          </p>
        </div>
      </Panel>
    </div>
  )
}

function SourceCard({ source: s, inUse }: { source: Source; inUse: boolean }): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded border border-line bg-elevated/40 p-3',
        !s.enabled && 'opacity-65',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink">{s.name}</p>
          <p className="mt-0.5 text-2xs text-faint">{KIND_LABEL[s.kind]}</p>
        </div>
        {!s.enabled ? (
          <Badge tone="negative">disabled</Badge>
        ) : inUse ? (
          <Badge tone="positive">in use</Badge>
        ) : (
          <Badge tone="warning">withdrawn</Badge>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone={ROBOTS_TONE[s.robots]}>robots: {s.robots}</Badge>
        <Badge tone={TOS_TONE[s.tos]}>{TOS_LABEL[s.tos]}</Badge>
        {s.isScraped ? <Badge tone="warning">scraped</Badge> : null}
      </div>
      <p className="mt-2 text-2xs leading-relaxed text-muted">{s.tosClause}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Readout label="Reliability" value={fmtShare(s.reliability, 1)} />
        <Readout
          label="Rate"
          value={s.rateLimitPerMin > 0 ? `${s.rateLimitPerMin}/m` : '—'}
        />
        <Readout
          label="Share"
          value={s.observationShare > 0 ? fmtShare(s.observationShare, 0) : '—'}
        />
      </div>
      <p className="mt-2 text-2xs text-faint">
        Reviewed {fmtDate(s.reviewedOn)} &middot; {s.reviewedBy}
      </p>
    </div>
  )
}
