import type { EChartsOption, XAXisComponentOption, YAXisComponentOption } from 'echarts'

/**
 * Chart defaults.
 *
 * ECharts' out-of-the-box styling is built for consumer dashboards: heavy grid lines,
 * large fonts, a saturated palette. A research terminal wants the opposite - the data
 * ink should dominate and the chrome should almost disappear. Everything here is in
 * service of that, plus three specific requirements from the brief:
 *
 *  - series updates MORPH rather than redraw (animationDurationUpdate),
 *  - every numeral is monospaced with tabular figures,
 *  - the whole thing reads from CSS custom properties so a theme switch does not
 *    require a chart rebuild.
 */

export const SERIES_COLOURS = [
  '#4ECDB4',
  '#7AA5E8',
  '#E0A45E',
  '#C98BD9',
  '#9AA4B2',
  '#E06A5E',
] as const

export const MONO_FAMILY = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace'
export const SANS_FAMILY = '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif'

export interface ChartTokens {
  text: string
  muted: string
  faint: string
  grid: string
  border: string
  surface: string
  elevated: string
  accent: string
  positive: string
  negative: string
  warning: string
}

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const raw = v || fallback.replace(/^rgb\(|\)$/g, '')
  // Tokens are stored as "r g b" so Tailwind can apply alpha; ECharts wants a colour.
  //
  // The separators matter. A canvas fillStyle accepts the space-separated CSS Color
  // Level 4 form, so a colour passed straight through as itemStyle.color works either
  // way - but anywhere ECharts has to INTERPOLATE between two colours (a visualMap
  // ramp, a gradient, a state transition) zrender parses the string itself, and its
  // parser only understands the comma form. A space-separated token in a visualMap
  // silently yields black cells, with no console error to explain it.
  return `rgb(${raw.split(/[\s,]+/).filter(Boolean).join(', ')})`
}

export function readTokens(): ChartTokens {
  return {
    text: readVar('--aq-text', 'rgb(230 233 238)'),
    muted: readVar('--aq-muted', 'rgb(154 164 178)'),
    faint: readVar('--aq-faint', 'rgb(109 118 132)'),
    grid: readVar('--aq-grid', 'rgb(36 41 50)'),
    border: readVar('--aq-border', 'rgb(36 41 50)'),
    surface: readVar('--aq-surface', 'rgb(21 24 29)'),
    elevated: readVar('--aq-elevated', 'rgb(26 30 36)'),
    accent: readVar('--aq-accent', 'rgb(78 205 180)'),
    positive: readVar('--aq-positive', 'rgb(94 205 143)'),
    negative: readVar('--aq-negative', 'rgb(224 106 94)'),
    warning: readVar('--aq-warning', 'rgb(224 164 94)'),
  }
}

export function baseOption(t: ChartTokens, reduceMotion: boolean): EChartsOption {
  return {
    color: [...SERIES_COLOURS],
    backgroundColor: 'transparent',
    animation: !reduceMotion,
    animationDuration: reduceMotion ? 0 : 420,
    // Morph, never redraw. A chart that blanks and repaints on every filter change
    // makes the reader lose their place in the series.
    animationDurationUpdate: reduceMotion ? 0 : 500,
    animationEasingUpdate: 'cubicInOut',
    textStyle: { fontFamily: SANS_FAMILY, fontSize: 11, color: t.muted },
    grid: { left: 8, right: 10, top: 10, bottom: 4, containLabel: true },
    legend: {
      type: 'scroll',
      icon: 'roundRect',
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 16,
      // ECharts butts the label straight against the marker; the left padding is the
      // only way to give it room.
      textStyle: { color: t.muted, fontSize: 11, fontFamily: SANS_FAMILY, padding: [0, 0, 0, 5] },
      inactiveColor: t.faint,
      pageIconColor: t.muted,
      pageIconInactiveColor: t.faint,
      pageTextStyle: { color: t.faint },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.elevated,
      borderColor: t.border,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.text, fontSize: 11, fontFamily: MONO_FAMILY },
      axisPointer: {
        type: 'line',
        lineStyle: { color: t.faint, width: 1, type: 'dashed' },
        crossStyle: { color: t.faint },
        label: { backgroundColor: t.elevated, color: t.text, fontFamily: MONO_FAMILY },
      },
      confine: true,
      extraCssText: 'box-shadow: 0 12px 32px -8px rgba(0,0,0,0.55); border-radius: 6px;',
    },
  }
}

export function categoryAxis(
  t: ChartTokens,
  extra: Record<string, unknown> = {},
): XAXisComponentOption {
  return {
    type: 'category' as const,
    boundaryGap: false,
    axisLine: { lineStyle: { color: t.border } },
    axisTick: { show: false },
    axisLabel: {
      color: t.faint,
      fontSize: 10,
      fontFamily: MONO_FAMILY,
      hideOverlap: true,
    },
    splitLine: { show: false },
    ...extra,
  } as XAXisComponentOption
}

export function valueAxis(
  t: ChartTokens,
  extra: Record<string, unknown> = {},
): YAXisComponentOption {
  return {
    type: 'value' as const,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.faint, fontSize: 10, fontFamily: MONO_FAMILY },
    splitLine: { lineStyle: { color: t.grid, type: 'solid', width: 1 } },
    ...extra,
  } as YAXisComponentOption
}

/**
 * The transposed pair.
 *
 * `categoryAxis` and `valueAxis` are typed for the usual orientation - categories
 * along the bottom, values up the side. A scatter plot wants a value axis on X, and a
 * horizontal bar chart wants a category axis on Y. ECharts' X and Y axis option types
 * are structurally near-identical but nominally distinct, so these exist to keep the
 * call sites free of casts.
 */
export function valueAxisX(
  t: ChartTokens,
  extra: Record<string, unknown> = {},
): XAXisComponentOption {
  return valueAxis(t, extra) as unknown as XAXisComponentOption
}

export function categoryAxisY(
  t: ChartTokens,
  extra: Record<string, unknown> = {},
): YAXisComponentOption {
  return categoryAxis(t, extra) as unknown as YAXisComponentOption
}

/** Hex colour with an alpha channel, for CI ribbons and area fills. */
export function alpha(colour: string, a: number): string {
  if (colour.startsWith('rgb(')) {
    return colour.replace('rgb(', 'rgba(').replace(')', `, ${a})`)
  }
  if (colour.startsWith('#') && colour.length === 7) {
    const r = parseInt(colour.slice(1, 3), 16)
    const g = parseInt(colour.slice(3, 5), 16)
    const b = parseInt(colour.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
  return colour
}
