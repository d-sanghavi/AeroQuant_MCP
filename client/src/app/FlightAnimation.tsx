import * as React from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'

/**
 * The takeoff animation on the landing screen.
 *
 * An aircraft climbing from the bottom-left to the top-right of the frame, drawing its
 * own contrail behind it. The whole thing lives inside one `viewBox`, so it scales from
 * a 320px phone to a 4K display without a single media query and without measuring the
 * container - which matters, because this renders before anything else has laid out.
 *
 * The flight path is a cubic Bezier rather than a straight line for two reasons: a
 * straight diagonal reads as a chart line, not a flight; and a curve lets the aircraft
 * bank, because the rotation is taken from the analytic derivative of the curve rather
 * than guessed. Position and heading therefore cannot disagree.
 */

// Control points, in viewBox units. A shallow roll-out, then a climb. The frame is a
// wide banner rather than a square: this sits above body copy, and a square would push
// the text it introduces below the fold on a phone.
const P0 = { x: 16, y: 138 }
const P1 = { x: 126, y: 134 }
const P2 = { x: 246, y: 46 }
const P3 = { x: 384, y: 14 }

function bezier(t: number): { x: number; y: number } {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * P0.x + b * P1.x + c * P2.x + d * P3.x,
    y: a * P0.y + b * P1.y + c * P2.y + d * P3.y,
  }
}

/** Heading in degrees, from the tangent. SVG y grows downward, hence the sign. */
function heading(t: number): number {
  const u = 1 - t
  const dx = 3 * u * u * (P1.x - P0.x) + 6 * u * t * (P2.x - P1.x) + 3 * t * t * (P3.x - P2.x)
  const dy = 3 * u * u * (P1.y - P0.y) + 6 * u * t * (P2.y - P1.y) + 3 * t * t * (P3.y - P2.y)
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

const PATH_D = 'M' + P0.x + ',' + P0.y + ' C' + P1.x + ',' + P1.y + ' ' + P2.x + ',' + P2.y +
  ' ' + P3.x + ',' + P3.y

/** Departure and arrival beacons, placed on the path ends. */
const AIRPORTS = [
  { x: P0.x, y: P0.y, label: 'BOM' },
  { x: P3.x, y: P3.y, label: 'DEL' },
] as const

/** Flight-level field marks, breathing slowly. */
const FIELD_DOTS = Array.from({ length: 24 }, (_, i) => ({
  x: 26 + ((i * 97) % 356),
  y: 12 + ((i * 53) % 112),
  r: i % 4 === 0 ? 1.15 : 0.7,
  delay: (i % 9) * 0.18,
}))

export function FlightAnimation({
  duration = 4.6,
  className,
}: {
  duration?: number
  className?: string
}): React.ReactElement {
  const reduce = useReducedMotion()
  const progress = useMotionValue(reduce === true ? 1 : 0)

  React.useEffect(() => {
    if (reduce === true) {
      progress.set(1)
      return undefined
    }
    const controls = animate(progress, 1, {
      duration,
      // Accelerate off the runway, ease into the cruise. A linear traverse looks
      // mechanical; a spring overshoots, and an aircraft does not overshoot.
      ease: [0.33, 0, 0.25, 1],
    })
    return () => controls.stop()
  }, [progress, duration, reduce])

  const x = useTransform(progress, (t) => bezier(t).x)
  const y = useTransform(progress, (t) => bezier(t).y)
  const rotate = useTransform(progress, (t) => heading(t))
  // The contrail is brightest just behind the aircraft and fades at the tail.
  const trailOpacity = useTransform(progress, [0, 0.08, 0.86, 1], [0, 0.9, 0.9, 0.55])
  const glowScale = useTransform(progress, [0, 0.5, 1], [0.75, 1.1, 0.95])

  return (
    <svg
      viewBox="0 0 400 156"
      className={className}
      role="img"
      aria-label="An aircraft climbing from the lower left to the upper right of the frame"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="aq-trail" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="35%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
        <radialGradient id="aq-glow">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="70%" stopColor="currentColor" stopOpacity="0.08" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The horizon: an arc, because the distance between two Indian metros is long
          enough that a flat baseline would be the wrong picture. */}
      <g className="text-line" stroke="currentColor">
        <path
          d="M-40,166 Q200,132 440,166"
          fill="none"
          strokeWidth="1"
          strokeDasharray="2 5"
          opacity="0.75"
        />
        <path d="M-40,178 Q200,144 440,178" fill="none" strokeWidth="1" opacity="0.4" />
      </g>

      <g className="text-faint" fill="currentColor">
        {FIELD_DOTS.map((d, i) => (
          <motion.circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.r}
            initial={{ opacity: 0 }}
            animate={{ opacity: reduce === true ? 0.3 : [0, 0.45, 0.22] }}
            transition={
              reduce === true
                ? { duration: 0.2 }
                : { duration: 2.6, delay: d.delay, repeat: Infinity, repeatType: 'reverse' }
            }
          />
        ))}
      </g>

      {/* The route, shown faintly in full so the destination is legible from frame one,
          then over-drawn by the contrail as the aircraft actually covers it. */}
      <path
        d={PATH_D}
        fill="none"
        className="text-line-strong"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="3 6"
        opacity="0.55"
      />

      <motion.path
        d={PATH_D}
        fill="none"
        stroke="url(#aq-trail)"
        className="text-accent"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ pathLength: progress, opacity: trailOpacity }}
      />

      {AIRPORTS.map((a, i) => (
        <g key={a.label} className={i === 0 ? 'text-muted' : 'text-accent'}>
          <circle cx={a.x} cy={a.y} r="3.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx={a.x} cy={a.y} r="1.2" fill="currentColor" />
          {i === 1 ? (
            <motion.circle
              cx={a.x}
              cy={a.y}
              r="3.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              initial={{ scale: 1, opacity: 0 }}
              animate={reduce === true ? { opacity: 0.6 } : { scale: [1, 2.6], opacity: [0.7, 0] }}
              transition={
                reduce === true
                  ? { duration: 0.2 }
                  : { duration: 1.8, repeat: Infinity, delay: duration * 0.75, ease: 'easeOut' }
              }
              style={{ transformOrigin: a.x + 'px ' + a.y + 'px' }}
            />
          ) : null}
          <text
            x={a.x + (i === 0 ? 8 : -8)}
            y={a.y + (i === 0 ? 10 : -8)}
            textAnchor={i === 0 ? 'start' : 'end'}
            fill="currentColor"
            fontSize="7.5"
            fontFamily='"JetBrains Mono Variable", ui-monospace, monospace'
            letterSpacing="0.08em"
          >
            {a.label}
          </text>
        </g>
      ))}

      {/* The aircraft. Position and heading both derive from `progress`, so the nose
          always points where it is going. */}
      <motion.g style={{ x, y, rotate }}>
        <motion.circle
          r="15"
          fill="url(#aq-glow)"
          className="text-accent"
          style={{ scale: glowScale }}
        />
        <g className="text-accent" fill="currentColor">
          {/* A jet silhouette drawn nose-right at the origin, so the group transform is
              pure position plus heading. */}
          <path
            d="M9.5,0 L-1.6,2.5 L-5.6,2.5 L-3.4,0.9 L-6.6,0.9 L-8.4,3.0 L-9.8,3.0 L-8.8,0 L-9.8,-3.0 L-8.4,-3.0 L-6.6,-0.9 L-3.4,-0.9 L-5.6,-2.5 L-1.6,-2.5 Z"
            strokeLinejoin="round"
          />
          <path d="M-1.0,0 L-5.4,6.6 L-2.6,6.6 L2.4,0.8 Z" opacity="0.85" />
          <path d="M-1.0,0 L-5.4,-6.6 L-2.6,-6.6 L2.4,-0.8 Z" opacity="0.85" />
        </g>
      </motion.g>
    </svg>
  )
}
