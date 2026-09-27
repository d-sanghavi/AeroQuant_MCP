import * as React from 'react'
import ReactECharts from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import {
  BarChart,
  BoxplotChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
} from 'echarts/charts'
import {
  DataZoomComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import type { ECharts } from 'echarts/core'
import { useApp } from '@/data/store'
import { cn } from '@/lib/utils'
import { baseOption, readTokens, type ChartTokens } from './theme'

// Only the chart types this product actually uses are registered. The full ECharts
// bundle is ~1MB; this keeps the initial JS inside the budget in PROTOTYPE_SPEC.
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  BoxplotChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  VisualMapComponent,
  GraphicComponent,
  CanvasRenderer,
])

function deepMerge<T extends Record<string, unknown>>(base: T, extra: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(extra)) {
    const existing = out[k]
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      out[k] = deepMerge(existing as Record<string, unknown>, v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out as T
}

export interface EChartProps {
  /** Builder receives the resolved theme tokens so series colours stay in sync. */
  option: (tokens: ChartTokens) => EChartsOption
  height?: number | string
  /** Height used below the `sm` breakpoint. Charts need a floor to stay readable. */
  mobileHeight?: number
  className?: string
  onEvents?: Record<string, (params: unknown, instance: ECharts) => void>
  /** Accessible description; charts are images to a screen reader without one. */
  ariaLabel: string
  notMerge?: boolean
}

/**
 * ECharts wrapper.
 *
 * A note on the one console error you will see in development. React's StrictMode
 * mounts, unmounts and remounts every component, so the first ECharts instance is
 * disposed with its initial paint frame still queued; zrender then paints into a
 * painter whose layers it has already released and throws a TypeError from inside a
 * requestAnimationFrame, where no React error boundary can see it. It is dev-only -
 * StrictMode does nothing in a production build - it appears once per chart on first
 * mount, and nothing downstream of it is affected. Do not "fix" it by removing
 * StrictMode, which is catching real problems elsewhere, and do not swallow it with a
 * global error handler, which would hide genuine chart failures too.
 *
 * Handles three things the raw library does not do for us:
 *  - resizes with its CONTAINER via ResizeObserver, so the responsive contract holds
 *    at every width rather than only on window resize;
 *  - rebuilds the option when the theme flips, reading the live CSS variables;
 *  - drops all animation under prefers-reduced-motion.
 */
export function EChart({
  option,
  height = 300,
  mobileHeight,
  className,
  onEvents,
  ariaLabel,
  notMerge = false,
}: EChartProps): React.ReactElement {
  const theme = useApp((s) => s.theme)
  const reduceMotion = useApp((s) => s.reducedMotion)
  const ref = React.useRef<ReactECharts>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isNarrow, setIsNarrow] = React.useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640,
  )

  // `theme` is intentionally the dependency even though the callback does not read it.
  // readTokens() pulls live CSS custom properties off the document element, and a theme
  // flip is the only event that changes them - so `theme` is the invalidation signal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tokens = React.useMemo(() => readTokens(), [theme])

  const resolved = React.useMemo(() => {
    const base = baseOption(tokens, reduceMotion) as Record<string, unknown>
    return deepMerge(base, option(tokens) as Record<string, unknown>) as EChartsOption
  }, [option, tokens, reduceMotion])

  React.useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => {
      // Only re-render when the band actually changes. A ResizeObserver fires on every
      // pixel of a drag, and setting identical state on each one re-runs the option
      // builder for nothing.
      setIsNarrow((prev) => {
        const next = window.innerWidth < 640
        return next === prev ? prev : next
      })
      // A route transition can dispose the instance while the observer still holds a
      // reference to it; resizing a disposed instance throws inside zrender's painter,
      // where there is no error boundary to catch it. The guard is cheaper than the
      // stack trace it prevents.
      const instance = ref.current?.getEchartsInstance()
      if (instance && !instance.isDisposed()) instance.resize()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const resolvedHeight =
    isNarrow && mobileHeight !== undefined
      ? mobileHeight
      : typeof height === 'number'
        ? height
        : height

  return (
    <div
      ref={containerRef}
      className={cn('w-full min-w-0', className)}
      role="img"
      aria-label={ariaLabel}
    >
      <ReactECharts
        ref={ref}
        echarts={echarts}
        option={resolved}
        notMerge={notMerge}
        lazyUpdate
        style={{
          height: typeof resolvedHeight === 'number' ? `${resolvedHeight}px` : resolvedHeight,
          width: '100%',
        }}
        opts={{ renderer: 'canvas' }}
        onEvents={onEvents as never}
      />
    </div>
  )
}

export type { ChartTokens }
