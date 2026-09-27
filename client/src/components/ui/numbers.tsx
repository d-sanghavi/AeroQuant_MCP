import * as React from 'react'
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useApp } from '@/data/store'
import type { LineageUnit } from '@/data/worker/protocol'
import { Tip } from './primitives'

/**
 * Numbers.
 *
 * Every number in this product is a doorway. Clicking it opens the Lineage drawer and
 * resolves the figure back to the raw payloads it was computed from - that is the
 * signature interaction, and it is what turns "trust us" into "check it".
 *
 * The count-up is deliberately restrained: 700ms, ease-out-expo, no bounce, and
 * tabular figures throughout so the digits do not jitter as they tween. Under
 * prefers-reduced-motion the value simply appears.
 */

function useCountUp(value: number, enabled: boolean): number {
  const reduce = useReducedMotion()
  const active = enabled && !reduce
  const mv = useMotionValue(active ? 0 : value)
  const spring = useSpring(mv, { duration: 0.7, bounce: 0 })
  const [display, setDisplay] = React.useState(active ? 0 : value)

  React.useEffect(() => {
    if (!active) {
      setDisplay(value)
      return
    }
    mv.set(value)
  }, [value, active, mv])

  React.useEffect(() => {
    if (!active) return undefined
    return spring.on('change', (v) => setDisplay(v))
  }, [spring, active])

  return active ? display : value
}

export function AnimatedNumber({
  value,
  format,
  animate = true,
  className,
}: {
  value: number
  format: (v: number) => string
  animate?: boolean
  className?: string
}): React.ReactElement {
  const shown = useCountUp(value, animate)
  return (
    <span className={cn('num', className)}>
      {Number.isFinite(value) ? format(shown) : '--'}
    </span>
  )
}

// ---------------------------------------------------------------------------

export interface ProvenanceRef {
  readonly label: string
  readonly value: number
  readonly method: string
  readonly unit: LineageUnit
  readonly periodIdx: number
  readonly routeId?: string
  readonly airlineCode?: string
  readonly productId?: number
}

/**
 * A number that can be traced. Renders as a button so it is reachable by keyboard and
 * announced correctly; the visual affordance is a 1px accent underline on hover.
 */
export function ProvValue({
  children,
  provenance,
  className,
  title,
}: {
  children: React.ReactNode
  provenance: ProvenanceRef
  className?: string
  title?: string
}): React.ReactElement {
  const openLineage = useApp((s) => s.openLineage)
  const ready = useApp((s) => s.status === 'ready')

  if (!ready) {
    return <span className={cn('num', className)}>{children}</span>
  }

  return (
    <button
      type="button"
      onClick={() => void openLineage(provenance)}
      title={title ?? `Trace ${provenance.label} to its source observations`}
      className={cn('prov num text-left', className)}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------

export type Trend = 'up' | 'down' | 'flat'

export function trendOf(delta: number, threshold = 0.05): Trend {
  if (!Number.isFinite(delta) || Math.abs(delta) < threshold) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

/**
 * A headline figure.
 *
 * `goodDirection` exists because for a price index "up" is not good news. A tile
 * showing rising airfares in green would be an editorial error, and colour is the
 * first thing a reader takes in.
 */
export function StatTile({
  label,
  value,
  format,
  secondary,
  delta,
  deltaFormat,
  goodDirection = 'none',
  provenance,
  info,
  animate = true,
  className,
}: {
  label: string
  value: number
  format: (v: number) => string
  secondary?: React.ReactNode
  delta?: number
  deltaFormat?: (v: number) => string
  goodDirection?: 'up' | 'down' | 'none'
  provenance?: ProvenanceRef
  info?: React.ReactNode
  animate?: boolean
  className?: string
}): React.ReactElement {
  const t = delta === undefined ? 'flat' : trendOf(delta)
  const toneClass =
    goodDirection === 'none' || t === 'flat'
      ? 'text-muted'
      : (goodDirection === 'up') === (t === 'up')
        ? 'text-pos'
        : 'text-neg'

  // When the tile's value IS the change, colouring the figure says everything the
  // delta line would, without printing the same number twice.
  const valueIsDelta = delta !== undefined && Object.is(delta, value)
  const number = (
    <AnimatedNumber
      value={value}
      format={format}
      animate={animate}
      className={cn(
        'text-xl font-semibold leading-none tracking-tight sm:text-2xl',
        valueIsDelta && goodDirection !== 'none' ? toneClass : 'text-ink',
      )}
    />
  )

  return (
    <div className={cn('panel p-3 sm:p-3.5', className)}>
      <div className="flex items-center gap-1">
        <p className="label-caps truncate">{label}</p>
        {info ? (
          <Tip content={info}>
            <span className="cursor-help text-faint" aria-hidden>
              &#9432;
            </span>
          </Tip>
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        {provenance ? (
          <ProvValue provenance={provenance} className="text-ink">
            {number}
          </ProvValue>
        ) : (
          number
        )}
      </div>
      <div className="mt-1.5 flex min-h-[1rem] flex-wrap items-center gap-x-2 gap-y-0.5">
        {delta !== undefined && Number.isFinite(delta) && !valueIsDelta ? (
          <span className={cn('num text-2xs font-medium', toneClass)}>
            {deltaFormat ? deltaFormat(delta) : delta.toFixed(2)}
          </span>
        ) : null}
        {secondary ? <span className="text-2xs text-faint">{secondary}</span> : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** A compact labelled figure for dense readouts inside panels. */
export function Readout({
  label,
  value,
  tone = 'default',
  mono = true,
  info,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  tone?: 'default' | 'positive' | 'negative' | 'warning' | 'accent'
  mono?: boolean
  info?: React.ReactNode
  className?: string
}): React.ReactElement {
  const toneClass = {
    default: 'text-ink',
    positive: 'text-pos',
    negative: 'text-neg',
    warning: 'text-warn',
    accent: 'text-accent',
  }[tone]

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1">
        <p className="label-caps truncate">{label}</p>
        {info ? (
          <Tip content={info}>
            <span className="cursor-help text-faint" aria-hidden>
              &#9432;
            </span>
          </Tip>
        ) : null}
      </div>
      <p className={cn('mt-1 text-sm font-semibold tabular-nums', mono && 'num', toneClass)}>
        {value}
      </p>
    </div>
  )
}

/** Framer-motion-aware fade+rise, disabled under reduced motion. */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}): React.ReactElement {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.24, delay, ease: [0, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}

export { useTransform }
