import * as React from 'react'
import { Badge, Tip } from './primitives'
import { Readout } from './numbers'
import { fmtNumber, fmtP } from '@/lib/format'
import type { TestResult } from '@/lib/quant/tests'
import { cn } from '@/lib/utils'

/**
 * How a hypothesis test is reported.
 *
 * A bare p-value is not a result. The audience for this terminal will be asked to
 * defend whatever it prints, so every test carries the four things that make it
 * defensible: the null it tested, the alpha it tested at, the decision that follows,
 * and the assumptions that were actually checked rather than assumed. A test whose
 * assumptions failed is still shown - it is shown with its failures visible, because
 * suppressing it would be the worse error.
 */

export function TestCard({ result }: { result: TestResult }): React.ReactElement {
  const rejected = result.decision === 'reject'
  const failed = Object.entries(result.assumptionsChecked).filter(([, ok]) => !ok)

  return (
    <div className="rounded border border-line bg-elevated/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium text-ink">{result.test}</p>
        <Badge tone={rejected ? 'accent' : 'neutral'}>
          {rejected ? 'Reject H₀' : 'Fail to reject H₀'}
        </Badge>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Readout label="Statistic" value={result.statistic.toFixed(3)} />
        <Readout
          label="p-value"
          value={fmtP(result.pValue)}
          tone={result.pValue < result.alpha ? 'accent' : 'default'}
        />
        <Readout label="n" value={fmtNumber(result.n)} />
        <Readout
          label={result.effectSize !== undefined ? 'Effect size' : 'Alpha'}
          value={
            result.effectSize !== undefined
              ? result.effectSize.toFixed(3)
              : result.alpha.toFixed(2)
          }
        />
      </div>

      {result.criticalValues ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(result.criticalValues).map(([k, v]) => (
            <span key={k} className="text-2xs text-faint">
              {k} <span className="num text-muted">{v.toFixed(3)}</span>
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-2.5 text-2xs leading-relaxed text-muted">
        <span className="text-faint">H₀: </span>
        {result.nullHypothesis}
      </p>
      <p className="mt-1 text-2xs leading-relaxed text-muted">{result.interpretation}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(result.assumptionsChecked).map(([k, ok]) => (
          <Badge key={k} tone={ok ? 'positive' : 'warning'}>
            {ok ? '✓' : '⚠'} {k}
          </Badge>
        ))}
      </div>
      {failed.length > 0 ? (
        <p className="mt-2 text-2xs leading-relaxed text-warn">
          {failed.length === 1 ? 'One assumption is' : `${failed.length} assumptions are`} not
          satisfied, so the p-value above is approximate. It is shown rather than hidden
          so the reader can discount it themselves.
        </p>
      ) : null}
    </div>
  )
}

/** A dense table of several tests, for screens that run a battery of them. */
export function TestTable({
  results,
  className,
}: {
  results: readonly TestResult[]
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[40rem] text-left">
        <thead>
          <tr className="border-b border-line">
            {['Test', 'Statistic', 'p', 'n', 'Decision', 'Assumptions'].map((h, i) => (
              <th
                key={h}
                className={cn('label-caps whitespace-nowrap px-2.5 py-2', i > 0 && i < 4 && 'text-right')}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const failed = Object.entries(r.assumptionsChecked).filter(([, ok]) => !ok)
            return (
              <tr key={r.test} className="border-b border-line/60 text-xs last:border-0">
                <td className="px-2.5 py-2">
                  <Tip content={r.nullHypothesis}>
                    <span className="cursor-help text-ink">{r.test}</span>
                  </Tip>
                  <p className="mt-0.5 max-w-md text-2xs leading-relaxed text-faint">
                    {r.interpretation}
                  </p>
                </td>
                <td className="num px-2.5 py-2 text-right text-muted">
                  {r.statistic.toFixed(3)}
                </td>
                <td
                  className={cn(
                    'num px-2.5 py-2 text-right',
                    r.pValue < r.alpha ? 'text-accent' : 'text-muted',
                  )}
                >
                  {fmtP(r.pValue)}
                </td>
                <td className="num px-2.5 py-2 text-right text-faint">{fmtNumber(r.n)}</td>
                <td className="whitespace-nowrap px-2.5 py-2">
                  <Badge tone={r.decision === 'reject' ? 'accent' : 'neutral'}>
                    {r.decision === 'reject' ? 'Reject' : 'Fail to reject'}
                  </Badge>
                </td>
                <td className="px-2.5 py-2">
                  {failed.length === 0 ? (
                    <Badge tone="positive">✓ all checked</Badge>
                  ) : (
                    <Tip content={failed.map(([k]) => k).join(', ')}>
                      <span>
                        <Badge tone="warning">⚠ {failed.length} unmet</Badge>
                      </span>
                    </Tip>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
