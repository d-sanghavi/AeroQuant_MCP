import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useApp } from '@/data/store'
import { Button, ProgressBar } from '@/components/ui/primitives'
import { FlightAnimation } from './FlightAnimation'

/**
 * The landing screen.
 *
 * It states what is being generated and why, because the honest answer to "where does
 * this data come from" is on screen before anything else is. A prototype that opens
 * with a spinner and then shows confident national statistics invites exactly the
 * wrong assumption.
 *
 * It also holds. The dataset generates in about a second, which is too fast for a
 * reader to take in what they are being told about its provenance - so the screen is
 * kept for a fixed dwell (see `LANDING_DWELL_MS`) and the aircraft flies for most of
 * it. The progress bar continues to report the real generation state underneath; the
 * dwell is never dressed up as work.
 */

/** How long the landing screen is held, regardless of how fast generation finishes. */
export const LANDING_DWELL_MS = 5000

const FACTS: readonly (readonly [string, string])[] = [
  ['Routes', '60'],
  ['Airports', '40'],
  ['Carriers', '6'],
  ['Window', '24 months'],
]

export function BootScreen(): React.ReactElement {
  const status = useApp((s) => s.status)
  const progress = useApp((s) => s.progress)
  const label = useApp((s) => s.progressLabel)
  const error = useApp((s) => s.error)
  const generate = useApp((s) => s.generate)
  const reduce = useReducedMotion()

  const ready = status === 'ready'

  return (
    <div className="flex min-h-full items-center justify-center px-5 py-8 sm:py-10">
      <motion.div
        initial={reduce === true ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
        className="w-full max-w-lg"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded bg-accent/15 text-xs font-bold text-accent"
            aria-hidden
          >
            AQ
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-ink">
              AeroQuant Terminal
            </h1>
            <p className="text-2xs text-faint">
              Airfare price index (APIx) for the Indian Statistical System
            </p>
          </div>
        </div>

        {/* The aircraft. Aspect-locked so it keeps its proportions from 320px upward,
            and capped in height so it never crowds the text it introduces. */}
        <FlightAnimation
          duration={(LANDING_DWELL_MS / 1000) * 0.92}
          className="mt-4 h-auto w-full"
        />

        <p className="mt-2 text-xs leading-relaxed text-muted">
          This prototype runs entirely in your browser. There is no backend and no
          network call. The panel below is generated from a seeded data-generating
          process at load time, and every statistic on the terminal &mdash; index
          numbers, hedonic adjustments, principal components, value at risk &mdash; is
          computed from it at runtime rather than stored.
        </p>

        {error ? (
          <div className="mt-6 rounded border border-neg/40 bg-neg/10 p-3">
            <p className="text-xs font-medium text-neg">Generation failed</p>
            <p className="mt-1 text-2xs leading-relaxed text-muted">{error}</p>
            <Button className="mt-3" size="sm" onClick={() => void generate()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="mt-6">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="truncate text-2xs text-muted">
                {ready ? 'Dataset ready — opening the terminal' : label || 'Preparing'}
              </p>
              <p className="num shrink-0 text-2xs text-faint">
                {Math.round(progress * 100)}%
              </p>
            </div>
            <ProgressBar value={progress} />
            {status === 'idle' ? (
              <Button className="mt-4" variant="primary" onClick={() => void generate()}>
                Generate the dataset
              </Button>
            ) : null}
          </div>
        )}

        <dl className="mt-7 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-5 sm:grid-cols-4">
          {FACTS.map(([k, v]) => (
            <div key={k}>
              <dt className="label-caps">{k}</dt>
              <dd className="num mt-0.5 text-xs text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 text-[0.625rem] leading-relaxed text-faint">
          Smart India Hackathon 2026 &middot; problem statement SIH26056 &middot; Ministry
          of Statistics and Programme Implementation. Synthetic data for demonstration.
          Not an official statistic.
        </p>
      </motion.div>
    </div>
  )
}
