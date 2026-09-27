/**
 * Application state.
 *
 * Deliberately small. The dataset lives in the worker; derived analytics are fetched
 * per screen. What is global is only what genuinely crosses screens: the filter (so
 * that narrowing the date range on the Index Terminal narrows the Method Lab too),
 * the lineage drawer (opened from anywhere), and the theme.
 */

import { create } from 'zustand'
import { PERIODS } from './master/calendar'
import { dataWorker } from './workerClient'
import type { DatasetSummary, LineageDto, LineageUnit } from './worker/protocol'
import type { CubeFilter } from './cube'

export type GenerationStatus = 'idle' | 'generating' | 'ready' | 'error'
export type Theme = 'dark' | 'light'

export interface LineageRequest {
  readonly label: string
  readonly value: number
  readonly method: string
  readonly unit: LineageUnit
  readonly periodIdx: number
  readonly routeId?: string
  readonly airlineCode?: string
  readonly productId?: number
}

interface AppState {
  status: GenerationStatus
  progress: number
  progressLabel: string
  error: string | null
  summary: DatasetSummary | null

  // --- filter (shared across screens) ---
  periodFrom: number
  periodTo: number
  disableScraped: boolean
  selectedRoutes: string[]

  // --- lineage drawer ---
  lineageOpen: boolean
  lineageLoading: boolean
  lineage: LineageDto | null
  lineageError: string | null

  theme: Theme
  reducedMotion: boolean

  generate: (seed?: number) => Promise<void>
  setRange: (from: number, to: number) => void
  resetRange: () => void
  setDisableScraped: (value: boolean) => void
  setSelectedRoutes: (routes: string[]) => void
  openLineage: (req: LineageRequest) => Promise<void>
  closeLineage: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setReducedMotion: (value: boolean) => void
  filter: () => CubeFilter
}

const THEME_KEY = 'aeroquant.theme'

function initialTheme(): Theme {
  // The only thing this prototype persists. Everything else is regenerated from the
  // seed, which is the point of a reproducible dataset.
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Private browsing, or storage disabled. Not an error worth surfacing.
  }
  return 'dark'
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  root.style.colorScheme = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Ignore - the theme simply will not persist.
  }
}

export const useApp = create<AppState>((set, get) => ({
  status: 'idle',
  progress: 0,
  progressLabel: '',
  error: null,
  summary: null,

  periodFrom: 0,
  periodTo: PERIODS.length - 1,
  disableScraped: false,
  selectedRoutes: [],

  lineageOpen: false,
  lineageLoading: false,
  lineage: null,
  lineageError: null,

  theme: initialTheme(),
  reducedMotion:
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,

  generate: async (seed = 26056) => {
    if (get().status === 'generating') return
    set({ status: 'generating', progress: 0, progressLabel: 'Starting', error: null })
    try {
      const summary = await dataWorker.generate(seed, (fraction, label) =>
        set({ progress: fraction, progressLabel: label }),
      )
      set({
        status: 'ready',
        summary,
        progress: 1,
        progressLabel: 'Ready',
        periodFrom: 0,
        periodTo: summary.periods.length - 1,
      })
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  setRange: (from, to) => {
    const max = (get().summary?.periods.length ?? PERIODS.length) - 1
    const lo = Math.max(0, Math.min(from, max))
    const hi = Math.max(lo, Math.min(to, max))
    set({ periodFrom: lo, periodTo: hi })
  },

  resetRange: () =>
    set({ periodFrom: 0, periodTo: (get().summary?.periods.length ?? PERIODS.length) - 1 }),

  setDisableScraped: (value) => set({ disableScraped: value }),

  setSelectedRoutes: (routes) => set({ selectedRoutes: routes }),

  openLineage: async (req) => {
    set({ lineageOpen: true, lineageLoading: true, lineage: null, lineageError: null })
    try {
      const payload = await dataWorker.lineage({
        kind: 'cell',
        label: req.label,
        value: req.value,
        method: req.method,
        unit: req.unit,
        periodIdx: req.periodIdx,
        routeId: req.routeId,
        airlineCode: req.airlineCode,
        productId: req.productId,
        filter: get().filter(),
      })
      set({ lineage: payload, lineageLoading: false })
    } catch (err) {
      set({
        lineageLoading: false,
        lineageError: err instanceof Error ? err.message : String(err),
      })
    }
  },

  closeLineage: () => set({ lineageOpen: false }),

  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },

  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },

  setReducedMotion: (value) => set({ reducedMotion: value }),

  filter: () => {
    const s = get()
    return {
      periodFrom: s.periodFrom,
      periodTo: s.periodTo,
      disableScraped: s.disableScraped,
      routeIds: s.selectedRoutes.length > 0 ? s.selectedRoutes : undefined,
    }
  },
}))

/** Apply the persisted theme before first paint. */
export function bootstrapTheme(): void {
  applyTheme(useApp.getState().theme)
}
