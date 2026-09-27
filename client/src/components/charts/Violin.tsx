import * as React from 'react'
import { ParentSize } from '@visx/responsive'
import { scaleLinear, scaleBand } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { LinePath } from '@visx/shape'
import { curveBasis } from '@visx/curve'
import { useApp } from '@/data/store'
import { readTokens } from './theme'
import { fmtINRCompact } from '@/lib/format'

/**
 * Violin plot.
 *
 * Built on visx rather than ECharts because this is a bespoke shape - ECharts offers a
 * box plot, and a box plot is the wrong tool here. Fare distributions at short booking
 * horizons are strongly right-skewed and frequently bimodal (a cheap remaining bucket
 * and an expensive one), and a box plot renders both of those as the same picture. The
 * whole point of putting the distribution on screen is to show that the median is not
 * a sufficient summary of it.
 *
 * Density is a Gaussian kernel estimate with Silverman's bandwidth, computed on the
 * thinned sample the worker returns.
 */

export interface ViolinSeries {
  readonly key: string
  readonly label: string
  readonly values: number[]
  readonly median: number
  readonly p10: number
  readonly p90: number
}

function silverman(values: readonly number[], sd: number, iqr: number): number {
  const n = values.length
  const a = Math.min(sd, iqr / 1.349) || sd || 1
  return 0.9 * a * Math.pow(n, -0.2)
}

function kde(values: readonly number[], grid: readonly number[]): number[] {
  const n = values.length
  if (n < 3) return grid.map(() => 0)
  const mean = values.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1))
  const sorted = [...values].sort((a, b) => a - b)
  const q = (p: number): number => sorted[Math.min(n - 1, Math.floor(p * n))]!
  const h = silverman(values, sd, q(0.75) - q(0.25))
  if (!(h > 0)) return grid.map(() => 0)

  const norm = 1 / (n * h * Math.sqrt(2 * Math.PI))
  return grid.map((x) => {
    let s = 0
    for (let i = 0; i < n; i++) {
      const z = (x - values[i]!) / h
      s += Math.exp(-0.5 * z * z)
    }
    return s * norm
  })
}

interface ViolinInnerProps {
  width: number
  height: number
  series: readonly ViolinSeries[]
  logScale: boolean
}

function ViolinInner({ width, height, series, logScale }: ViolinInnerProps): React.ReactElement {
  const theme = useApp((s) => s.theme)
  // `theme` is intentionally the dependency even though the callback does not read it.
  // readTokens() pulls live CSS custom properties off the document element, and a theme
  // flip is the only event that changes them - so `theme` is the invalidation signal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tok = React.useMemo(() => readTokens(), [theme])

  const margin = { top: 8, right: 10, bottom: 26, left: 48 }
  const innerW = Math.max(10, width - margin.left - margin.right)
  const innerH = Math.max(10, height - margin.top - margin.bottom)

  const tx = React.useCallback((v: number) => (logScale ? Math.log(Math.max(1, v)) : v), [logScale])

  const { shapes, yDomain } = React.useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const s of series) {
      for (const v of s.values) {
        const t = tx(v)
        if (t < lo) lo = t
        if (t > hi) hi = t
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
      return { shapes: [], yDomain: [0, 1] as [number, number] }
    }
    const pad = (hi - lo) * 0.06
    lo -= pad
    hi += pad

    const STEPS = 56
    const grid = Array.from({ length: STEPS }, (_, i) => lo + ((hi - lo) * i) / (STEPS - 1))

    const shapes = series.map((s) => {
      const density = kde(s.values.map(tx), grid)
      const peak = Math.max(...density) || 1
      return { key: s.key, grid, density: density.map((d) => d / peak), source: s }
    })
    return { shapes, yDomain: [lo, hi] as [number, number] }
  }, [series, tx])

  const xScale = scaleBand<string>({
    domain: series.map((s) => s.key),
    range: [0, innerW],
    padding: 0.25,
  })
  const yScale = scaleLinear<number>({ domain: yDomain, range: [innerH, 0] })
  const halfWidth = xScale.bandwidth() / 2

  return (
    <svg width={width} height={height} role="presentation">
      <Group left={margin.left} top={margin.top}>
        <AxisLeft
          scale={yScale}
          numTicks={5}
          stroke="transparent"
          tickStroke="transparent"
          tickFormat={(v) => fmtINRCompact(logScale ? Math.exp(Number(v)) : Number(v))}
          tickLabelProps={() => ({
            fill: tok.faint,
            fontSize: 10,
            fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
            textAnchor: 'end',
            dx: -4,
            dy: 3,
          })}
        />
        {yScale.ticks(5).map((v) => (
          <line
            key={v}
            x1={0}
            x2={innerW}
            y1={yScale(v)}
            y2={yScale(v)}
            stroke={tok.grid}
            strokeWidth={1}
          />
        ))}

        {shapes.map((sh) => {
          const cx = (xScale(sh.key) ?? 0) + halfWidth
          const points = sh.grid.map((g, i) => ({ g, d: sh.density[i]! }))
          return (
            <Group key={sh.key}>
              <LinePath
                data={points}
                x={(p) => cx + p.d * halfWidth}
                y={(p) => yScale(p.g)}
                curve={curveBasis}
                stroke={tok.accent}
                strokeWidth={1.25}
                fill="none"
              />
              <LinePath
                data={points}
                x={(p) => cx - p.d * halfWidth}
                y={(p) => yScale(p.g)}
                curve={curveBasis}
                stroke={tok.accent}
                strokeWidth={1.25}
                fill="none"
              />
              <path
                d={
                  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${cx + p.d * halfWidth},${yScale(p.g)}`).join(' ') +
                  ' ' +
                  [...points]
                    .reverse()
                    .map((p) => `L${cx - p.d * halfWidth},${yScale(p.g)}`)
                    .join(' ') +
                  ' Z'
                }
                fill={tok.accent}
                opacity={0.14}
              />
              {/* p10-p90 spine and the median, so the summary statistics are on the
                  same picture as the shape they summarise. */}
              <line
                x1={cx}
                x2={cx}
                y1={yScale(tx(sh.source.p10))}
                y2={yScale(tx(sh.source.p90))}
                stroke={tok.text}
                strokeWidth={1}
                opacity={0.55}
              />
              <line
                x1={cx - halfWidth * 0.55}
                x2={cx + halfWidth * 0.55}
                y1={yScale(tx(sh.source.median))}
                y2={yScale(tx(sh.source.median))}
                stroke={tok.text}
                strokeWidth={1.75}
              />
            </Group>
          )
        })}

        <AxisBottom
          top={innerH}
          scale={xScale}
          stroke={tok.border}
          tickStroke="transparent"
          tickLabelProps={() => ({
            fill: tok.faint,
            fontSize: 10,
            fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
            textAnchor: 'middle',
            dy: 2,
          })}
        />
      </Group>
    </svg>
  )
}

export function Violin({
  series,
  height = 260,
  logScale = true,
  ariaLabel,
}: {
  series: readonly ViolinSeries[]
  height?: number
  logScale?: boolean
  ariaLabel: string
}): React.ReactElement {
  return (
    <div className="w-full min-w-0" role="img" aria-label={ariaLabel} style={{ height }}>
      <ParentSize debounceTime={16}>
        {({ width, height: h }) =>
          width > 0 ? (
            <ViolinInner width={width} height={h || height} series={series} logScale={logScale} />
          ) : null
        }
      </ParentSize>
    </div>
  )
}
