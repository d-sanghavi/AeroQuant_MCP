import * as React from 'react'
import { Check, X } from 'lucide-react'
import {
  Badge,
  ChartSkeleton,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Tip,
} from '@/components/ui/primitives'
import { Readout } from '@/components/ui/numbers'
import { useFilter, useIndices } from '@/data/hooks'
import { useApp } from '@/data/store'
import { checkAxioms, type AxiomOutcome } from '@/lib/quant/axiomCheck'
import { HORIZONS, ROUTES } from '@/data/master/routes'
import { AIRLINES } from '@/data/master/airlines'
import { AIRPORTS } from '@/data/master/airports'
import { SOURCES } from '@/data/master/sources'
import { fmtCompact, fmtIndex, fmtMonth, fmtNumber, fmtPct, fmtShare } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Methodology.
 *
 * The screen a reviewer opens second. Everything here is either a statement about how
 * the terminal computes, or a number the terminal has just computed - there is no
 * third category, and in particular there are no illustrative figures. The axiom table
 * is evaluated in the browser when this page mounts rather than transcribed from a
 * textbook, because a methodology page that asserts its own correctness is doing the
 * opposite of what a methodology page is for.
 */

const SECTIONS = [
  { id: 'sample', label: 'The sample' },
  { id: 'products', label: 'Matched products' },
  { id: 'elementary', label: 'Elementary formulae' },
  { id: 'axioms', label: 'Axioms' },
  { id: 'multilateral', label: 'The published estimator' },
  { id: 'quality', label: 'Quality adjustment' },
  { id: 'aggregation', label: 'Aggregation' },
  { id: 'uncertainty', label: 'Uncertainty' },
  { id: 'limits', label: 'Known limitations' },
] as const

export default function MethodologyPage(): React.ReactElement {
  const filter = useFilter()
  const { data, loading, error, refresh } = useIndices(filter)
  const summary = useApp((s) => s.summary)
  const axioms = React.useMemo(() => checkAxioms(), [])

  const byMethod = React.useMemo(() => {
    const groups = new Map<string, AxiomOutcome[]>()
    for (const a of axioms) {
      const list = groups.get(a.method)
      if (list) list.push(a)
      else groups.set(a.method, [a])
    }
    return [...groups.entries()]
  }, [axioms])

  const allAxioms = [...new Set(axioms.map((a) => a.axiom))]
  const failures = axioms.filter((a) => !a.satisfied)

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
        title="Methodology"
        description="How every number on this terminal is produced, and which of them you should not trust further than stated. Figures in this document are computed from the panel now in view; change the date range and they change."
      />

      {/* A contents rail rather than a sidebar: on a phone this becomes a scrollable
          chip row, which is the only pattern that works for nine anchors at 360px. */}
      <nav aria-label="Sections" className="no-scrollbar -mx-1 overflow-x-auto px-1">
        <ul className="flex gap-1.5">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="tap inline-flex items-center whitespace-nowrap rounded border border-line px-2.5 text-2xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Panel id="sample">
        <PanelHeader
          title="1. The sample"
          subtitle="What is collected, from where, and at what cadence"
        />
        <div className="grid grid-cols-2 gap-3 border-b border-line p-3 sm:grid-cols-4 sm:p-4 lg:grid-cols-6">
          <Readout label="Routes" value={fmtNumber(ROUTES.length)} />
          <Readout label="Airports" value={fmtNumber(AIRPORTS.length)} />
          <Readout label="Carriers" value={fmtNumber(AIRLINES.length)} />
          <Readout label="Horizons" value={fmtNumber(HORIZONS.length)} />
          <Readout label="Sources" value={fmtNumber(SOURCES.filter((s) => s.enabled).length)} />
          <Readout
            label="Observations"
            value={data ? fmtCompact(data.nObservations) : '--'}
          />
        </div>
        <div className="space-y-2.5 p-3 text-xs leading-relaxed text-muted sm:p-4">
          <p>
            The panel is a fixed set of {ROUTES.length} origin-destination pairs covering{' '}
            {AIRPORTS.length} Indian airports, quoted at {HORIZONS.length} booking
            horizons from T&minus;1 to T&minus;{HORIZONS[HORIZONS.length - 1]}. Quotes
            are drawn daily; the index is monthly. A route is sampled in proportion to
            its passenger volume, and within a route a carrier is sampled in proportion
            to its national share renormalised over the carriers that serve it.
          </p>
          <p>
            Collection is incomplete by design.{' '}
            {summary ? fmtShare(summary.collectionMissRate, 1) : 'A share'} of attempted
            collections return nothing &mdash; the fare is sold out, the source rate-limits,
            the parser rejects a malformed response &mdash; and{' '}
            {summary ? fmtShare(summary.cellMissingRate, 1) : 'a share'} of
            product-months end up with no observation at all. A generator that produced
            a complete rectangle would make every downstream method look better than it
            is.
          </p>
        </div>
      </Panel>

      <Panel id="products">
        <PanelHeader
          title="2. Matched products"
          subtitle="What counts as the same thing in two different months"
        />
        <div className="space-y-2.5 p-3 text-xs leading-relaxed text-muted sm:p-4">
          <p>
            A product is a{' '}
            <span className="num text-ink">
              route &times; carrier &times; booking horizon &times; cabin &times; fare family
            </span>{' '}
            tuple. Two quotes are comparable if and only if they share all five. This is
            the definition every method on the terminal uses, which is what makes the
            Method Lab a fair comparison: the six formulae differ in how they aggregate
            the cube, not in what went into it.
          </p>
          <p>
            The cube has{' '}
            <span className="num text-ink">
              {summary ? fmtNumber(summary.nProducts) : '--'}
            </span>{' '}
            products against{' '}
            <span className="num text-ink">{data ? data.periods.length : '--'}</span>{' '}
            months in the current window. It is sparse: most products are not quoted in
            most months, which is precisely why a matched-pair index run on a fixed panel
            discards so much of the sample and why a multilateral method is needed.
          </p>
        </div>
      </Panel>

      <Panel id="elementary">
        <PanelHeader
          title="3. Elementary formulae"
          subtitle="Six aggregations of one identical cube"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left">
            <thead>
              <tr className="border-b border-line">
                {['Method', 'Definition', 'Role here', 'Avg YoY'].map((h, i) => (
                  <th
                    key={h}
                    className={cn('label-caps whitespace-nowrap px-2.5 py-2', i === 3 && 'text-right')}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['naive-mean', 'Naive mean', 'Arithmetic mean of all observed fares', 'The comparator. Not an index.'],
                ['median', 'Median', 'Median of all observed fares', 'Robust to outliers, still composition-sensitive.'],
                ['carli', 'Carli', 'Arithmetic mean of price relatives', 'Upward-biased; fails time reversal.'],
                ['dutot', 'Dutot', 'Ratio of mean prices', 'Unit-dependent; fails commensurability.'],
                ['jevons-fixed', 'Jevons, fixed panel', 'Geometric mean of relatives on products present throughout', 'Sound but discards most of the sample.'],
                ['rygeks-fews', 'RYGEKS-FEWS', 'Rolling-window GEKS with a fixed-effects splice', 'Published.'],
              ].map(([key, name, def, role]) => (
                <tr key={key} className="border-b border-line/60 text-xs last:border-0">
                  <td className="whitespace-nowrap px-2.5 py-2 font-medium text-ink">
                    {name}
                    {key === 'rygeks-fews' ? (
                      <Badge tone="accent" className="ml-1.5">
                        published
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-2 text-muted">{def}</td>
                  <td className="px-2.5 py-2 text-faint">{role}</td>
                  <td className="num px-2.5 py-2 text-right text-ink">
                    {data ? fmtPct(data.avgYoyByMethod[key as string] ?? NaN, 2) : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-3 py-2.5 text-2xs leading-relaxed text-faint sm:px-4">
          Year-on-year figures are averaged over every twelve-month pair in the window,
          not taken at its endpoint. A point comparison inherits whatever happened to be
          unusual about one month at each end, and for a seasonal series that is a large
          amount of noise to build a headline on.
        </p>
      </Panel>

      <Panel id="axioms">
        <PanelHeader
          title="4. Axioms"
          subtitle="Evaluated in your browser when this page loaded"
          info="These are not looked up. Each cell is the result of running that formula on a purpose-built price vector and comparing the answer against the property. The detail behind every cell is in its tooltip."
          actions={
            <Badge tone={failures.length > 0 ? 'warning' : 'positive'}>
              {failures.length} failures across {axioms.length} checks
            </Badge>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="label-caps px-2.5 py-2">Method</th>
                {allAxioms.map((a) => (
                  <th key={a} className="label-caps whitespace-nowrap px-2.5 py-2 text-center">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byMethod.map(([method, outcomes]) => (
                <tr key={method} className="border-b border-line/60 text-xs last:border-0">
                  <td className="whitespace-nowrap px-2.5 py-2 text-ink">{method}</td>
                  {allAxioms.map((axiom) => {
                    const o = outcomes.find((x) => x.axiom === axiom)
                    if (!o) {
                      return (
                        <td key={axiom} className="px-2.5 py-2 text-center text-faint">
                          &mdash;
                        </td>
                      )
                    }
                    return (
                      <td key={axiom} className="px-2.5 py-2 text-center">
                        <Tip content={o.detail}>
                          <span
                            className={cn(
                              'inline-flex h-5 w-5 cursor-help items-center justify-center rounded',
                              o.satisfied ? 'text-pos' : 'bg-neg/15 text-neg',
                            )}
                          >
                            {o.satisfied ? (
                              <Check className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <X className="h-3.5 w-3.5" aria-hidden />
                            )}
                            <span className="sr-only">
                              {o.satisfied ? 'satisfied' : 'violated'}
                            </span>
                          </span>
                        </Tip>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 border-t border-line p-3 text-xs leading-relaxed text-muted sm:p-4">
          {failures.map((f) => (
            <p key={`${f.method}-${f.axiom}`}>
              <span className="text-ink">
                {f.method} violates {f.axiom.toLowerCase()}:
              </span>{' '}
              <span className="num text-faint">{f.detail}</span>
            </p>
          ))}
          <p className="pt-1">
            None of these are edge cases. Carli&rsquo;s time-reversal failure is an
            upward bias that compounds every time the index is chained, which is why a
            chained Carli on a churning sample drifts away from the direct comparison
            &mdash; the effect the Method Lab plots. Dutot&rsquo;s unit dependence means
            the answer changes if one fare is quoted in paise. And a bilateral
            T&ouml;rnqvist is not transitive, so the route you take through time changes
            where you arrive; that is the single reason a multilateral method is used at
            all.
          </p>
        </div>
      </Panel>

      <Panel id="multilateral">
        <PanelHeader
          title="5. The published estimator"
          subtitle="RYGEKS with a Fixed Effects Window Splice"
        />
        <div className="space-y-2.5 p-3 text-xs leading-relaxed text-muted sm:p-4">
          <p>
            Within a rolling window of{' '}
            <span className="num text-ink">13</span> months, prices are estimated by a{' '}
            <span className="text-ink">Time Product Dummy</span> regression: log price on
            a full set of product fixed effects and a full set of period effects. The
            period effects are the index. Because every product that appears anywhere in
            the window contributes to it, the estimator uses the whole sample rather than
            the intersection, which is what a fixed-panel Jevons is restricted to.
          </p>
          <p>
            The two-way fixed-effect system is solved by alternating projections rather
            than by forming and inverting the full design matrix &mdash; with{' '}
            {summary ? fmtNumber(summary.nProducts) : 'thousands of'} products the dense
            matrix would not fit in a phone&rsquo;s memory, and the responsive
            requirement is not negotiable.
          </p>
          <p>
            The window then rolls forward one month at a time and each new period is
            attached by a <span className="text-ink">mean splice</span>. This is a
            deliberate constraint, not an approximation: an official statistic that
            revises after publication is a different and worse problem than one that is
            slightly less efficient, so previously published values are never touched.
          </p>
        </div>
      </Panel>

      <Panel id="quality">
        <PanelHeader
          title="6. Quality adjustment"
          subtitle="Time-dummy hedonic regression"
        />
        {loading || !data ? (
          <ChartSkeleton height={160} />
        ) : data.hedonic ? (
          <>
            <div className="grid grid-cols-2 gap-3 border-b border-line p-3 sm:grid-cols-5 sm:p-4">
              <Readout label="Observations" value={fmtCompact(data.hedonic.nObs)} />
              <Readout label="Parameters" value={fmtNumber(data.hedonic.nParams)} />
              <Readout label="R²" value={data.hedonic.r2.toFixed(4)} />
              <Readout label="Adjusted R²" value={data.hedonic.adjR2.toFixed(4)} />
              <Readout
                label="Residual sigma"
                value={data.hedonic.sigma.toFixed(4)}
                info="In log points. Roughly the percentage spread of a fare around what its characteristics predict."
              />
            </div>
            <div className="space-y-2.5 p-3 text-xs leading-relaxed text-muted sm:p-4">
              <p>
                Log fare is regressed on a natural cubic spline in booking horizon (four
                knots), cabin, stops, refundability, checked baggage, and a full set of
                carrier, route and month dummies. The month coefficients are a
                constant-quality price series; the characteristic coefficients are the
                implicit prices of the characteristics themselves, which is what makes
                the booking-horizon curve on the Term Structure screen an estimate rather
                than a description.
              </p>
              <p>
                The normal equations are accumulated in a single streaming pass and
                solved by Cholesky with a relative ridge. The alternative &mdash; forming
                the dense design matrix &mdash; would be roughly 83MB for this panel. The
                cost of the streaming approach is a worse condition number, which the
                ridge absorbs and which is the reason the coefficient standard errors
                here are treated as indicative.
              </p>
            </div>
          </>
        ) : (
          <p className="p-3 text-xs text-faint sm:p-4">
            The hedonic model needs a wider window than the one currently selected.
          </p>
        )}
      </Panel>

      <Panel id="aggregation">
        <PanelHeader title="7. Aggregation" subtitle="From route indices to a national figure" />
        <div className="space-y-2.5 p-3 text-xs leading-relaxed text-muted sm:p-4">
          <p>
            Each route is a stratum with its own Time Product Dummy index. The national
            figure is a weighted geometric aggregation of the strata, weighted by DGCA
            passenger volumes normalised to sum to one &mdash; asserted at module load,
            because a weight vector that silently fails to sum to one produces a series
            that looks entirely reasonable and is wrong by a constant factor.
          </p>
          <p>
            Strata with no observation in a month are imputed from their geographic
            rollup rather than dropped. Dropping them would let the national index move
            because a route went missing, which is the same composition error the whole
            method exists to avoid, one level up.{' '}
            {data ? (
              <>
                In the current window{' '}
                <span className="num text-ink">
                  {fmtShare(data.imputation.imputedRate, 1)}
                </span>{' '}
                of cells are imputed.
              </>
            ) : null}
          </p>
        </div>
      </Panel>

      <Panel id="uncertainty">
        <PanelHeader
          title="8. Uncertainty"
          subtitle="Block bootstrap clustered on route"
        />
        {data ? (
          <div className="grid grid-cols-2 gap-3 border-b border-line p-3 sm:grid-cols-4 sm:p-4">
            <Readout label="Replicates" value={fmtNumber(data.confidence.replicates)} />
            <Readout
              label="Mean width"
              value={fmtIndex(
                data.periods.length > 1
                  ? data.confidence.upper
                      .map((u, i) => u - data.confidence.lower[i]!)
                      .filter(Number.isFinite)
                      .reduce((a, b, _, arr) => a + b / arr.length, 0)
                  : NaN,
                3,
              )}
            />
            <Readout label="Latest level" value={fmtIndex(data.national[data.national.length - 1] ?? NaN)} />
            <Readout
              label="Window"
              value={`${fmtMonth(data.periods[0] ?? '')} – ${fmtMonth(data.periods[data.periods.length - 1] ?? '')}`}
              mono={false}
            />
          </div>
        ) : null}
        <div className="space-y-2.5 p-3 text-xs leading-relaxed text-muted sm:p-4">
          <p>
            The interval is a block bootstrap resampling whole routes, because quotes
            within a route are not independent draws &mdash; they share a carrier mix, a
            capacity schedule and a demand shock. An observation-level bootstrap would
            treat each quote as independent information and would report an interval
            several times too narrow.
          </p>
          <p>
            One consequence is worth stating plainly, because it is counter-intuitive:
            withdrawing a data source barely widens this interval. The band is governed
            by how many routes there are and how differently they move, not by how many
            quotes sit inside each route. What a lost source actually costs is coverage,
            which shows up in the imputation rate instead.
          </p>
        </div>
      </Panel>

      <Panel id="limits">
        <PanelHeader title="9. Known limitations" />
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
          {[
            [
              'The data is synthetic',
              'Every figure on this terminal comes from a seeded generator, not from collected fares. The methods are real and the numbers are genuinely computed, but they describe a simulation. Nothing here is an official statistic.',
            ],
            [
              'The panel is trunk routes',
              `Sixty origin-destination pairs weighted to passenger volume. Regional operators flying thin sectors are under-represented: Alliance Air is under one percent of quotes against a national share several times that.`,
            ],
            [
              'Quote share is not seat share',
              'A carrier selling three cabins contributes three rows per departure where a single-cabin carrier contributes one. Carrier shares on this terminal are shares of observed quotes and are labelled as such.',
            ],
            [
              'Attribution is association',
              'The decomposition is an accounting identity and the Granger tests describe forecast improvement. Neither establishes causation, and the identification assumption a causal reading would need is stated on the Attribution screen rather than assumed.',
            ],
            [
              'Hedonic standard errors are indicative',
              'Streaming normal equations with a ridge trade condition number for memory. The point estimates are sound; the coefficient standard errors should not be used for inference at the margin.',
            ],
            [
              'The forecast is not a forecast of anything real',
              'Route forecasts use split-conformal bands on the generated series. The coverage property holds for that series and says nothing about actual future airfares.',
            ],
          ].map(([title, body]) => (
            <div key={title} className="rounded border border-line bg-elevated/40 p-3">
              <p className="text-xs font-medium text-ink">{title}</p>
              <p className="mt-1.5 text-2xs leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
