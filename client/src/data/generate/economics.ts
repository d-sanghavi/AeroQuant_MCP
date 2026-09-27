/**
 * Exogenous economic series.
 *
 * These are inputs to the fare DGP, and they are also what the Attribution Studio
 * regresses against. Generating them from an explicit structure (Brent -> USD/INR ->
 * ATF -> fare) means the attribution has something real to find, and it means the
 * Granger tests are testing a relationship that genuinely exists in the data rather
 * than one asserted in a caption.
 */

import { makeNormal, streamFor, MASTER_SEED, type Rng } from '@/lib/rng'
import { AIRPORTS } from '../master/airports'
import { PERIODS } from '../master/calendar'

/** Two months of run-up before the collection window, so lagged terms have inputs. */
export const EXT_PERIODS: readonly string[] = (() => {
  const first = PERIODS[0]!
  const [y, m] = first.split('-').map(Number)
  const out: string[] = []
  for (let k = 2; k >= 1; k--) {
    let mm = m! - k
    let yy = y!
    while (mm <= 0) {
      mm += 12
      yy -= 1
    }
    out.push(`${yy}-${String(mm).padStart(2, '0')}`)
  }
  return [...out, ...PERIODS]
})()

export const EXT_INDEX: ReadonlyMap<string, number> = new Map(
  EXT_PERIODS.map((p, i) => [p, i]),
)

export interface MonthlySeries {
  readonly id: string
  readonly label: string
  readonly unit: string
  readonly periods: readonly string[]
  readonly values: readonly number[]
}

function series(id: string, label: string, unit: string, values: number[]): MonthlySeries {
  return { id, label, unit, periods: EXT_PERIODS, values }
}

/**
 * An AR(1) around a drifting mean with a couple of deliberate regime shifts, which is
 * what commodity prices actually look like over two years and what makes the unit-root
 * tests in the Attribution screen interesting rather than pro forma.
 */
function ar1Path(rng: Rng, n: number, opts: {
  start: number
  mean: (t: number) => number
  phi: number
  sigma: number
  shocks?: readonly { at: number; size: number; decay: number }[]
}): number[] {
  const normal = makeNormal(rng)
  const out = new Array<number>(n)
  let x = opts.start
  for (let t = 0; t < n; t++) {
    const mu = opts.mean(t)
    x = mu + opts.phi * (x - mu) + opts.sigma * normal()
    let shock = 0
    for (const s of opts.shocks ?? []) {
      if (t >= s.at) shock += s.size * Math.exp(-(t - s.at) / s.decay)
    }
    out[t] = x + shock
  }
  return out
}

const N = EXT_PERIODS.length

/** Brent crude, USD/bbl. Two shocks: a supply scare and a demand-driven slide. */
export const BRENT: MonthlySeries = (() => {
  const rng = streamFor(MASTER_SEED, 'brent')
  const v = ar1Path(rng, N, {
    start: 78,
    mean: (t) => 76 + 6 * Math.sin((2 * Math.PI * t) / 17),
    phi: 0.86,
    sigma: 2.6,
    shocks: [
      { at: 8, size: 11.5, decay: 5 },
      { at: 17, size: -7.5, decay: 6 },
    ],
  })
  return series('brent', 'Brent crude', 'USD/bbl', v.map((x) => Math.max(45, x)))
})()

/** USD/INR. A slow depreciation with the usual defended-range behaviour. */
export const USDINR: MonthlySeries = (() => {
  const rng = streamFor(MASTER_SEED, 'usdinr')
  const v = ar1Path(rng, N, {
    start: 83.4,
    mean: (t) => 83.3 + 0.115 * t,
    phi: 0.7,
    sigma: 0.22,
  })
  return series('usdinr', 'USD/INR', 'INR per USD', v)
})()

/**
 * Aviation turbine fuel, INR per kilolitre.
 *
 * ATF is a refined product priced off crude in rupee terms, plus excise, throughput
 * and into-plane charges. Building it that way rather than drawing it independently is
 * what lets the fuel pass-through coefficient in the attribution model be recoverable.
 */
export const ATF_NATIONAL: MonthlySeries = (() => {
  const rng = streamFor(MASTER_SEED, 'atf')
  const normal = makeNormal(rng)
  const v = BRENT.values.map((b, t) => {
    const fx = USDINR.values[t]!
    // ~7.3 bbl per kL, a refining margin, then duties and airport throughput.
    const crudeCost = (b * fx * 7.3)
    const refining = 6200 + 40 * t
    const duties = 0.11 * crudeCost
    return crudeCost + refining + duties + 900 * normal()
  })
  return series('atf', 'ATF price (national average)', 'INR/kL', v)
})()

/** City-level ATF differs by state VAT and by throughput charges at the airport. */
const CITY_ATF_PREMIUM: Readonly<Record<string, number>> = {
  DEL: 0.0, BOM: 0.018, BLR: 0.006, MAA: 0.041, CCU: 0.085, HYD: 0.012,
  AMD: -0.014, COK: 0.032, GOI: 0.021, PNQ: 0.016, JAI: 0.028, LKO: 0.036,
  GAU: 0.049, PAT: 0.058, IXC: 0.009, BBI: 0.046, TRV: 0.034, VNS: 0.038,
}

export function atfForCity(iata: string, periodIdx: number): number {
  const base = ATF_NATIONAL.values[Math.max(0, Math.min(N - 1, periodIdx))]!
  return base * (1 + (CITY_ATF_PREMIUM[iata] ?? 0.02))
}

export const ATF_BY_CITY: ReadonlyMap<string, MonthlySeries> = new Map(
  Object.keys(CITY_ATF_PREMIUM).map((iata) => [
    iata,
    series(
      `atf-${iata.toLowerCase()}`,
      `ATF price (${iata})`,
      'INR/kL',
      ATF_NATIONAL.values.map((_, t) => atfForCity(iata, t)),
    ),
  ]),
)

/** CPI (Combined), 2012=100. The statistic airfare feeds into. */
export const CPI_COMBINED: MonthlySeries = (() => {
  const rng = streamFor(MASTER_SEED, 'cpi')
  const normal = makeNormal(rng)
  let level = 190.4
  const v: number[] = []
  for (let t = 0; t < N; t++) {
    // ~4.6% annualised with a food-driven wobble.
    const mom = 0.0038 + 0.0016 * Math.sin((2 * Math.PI * t) / 12) + 0.0011 * normal()
    level *= 1 + mom
    v.push(level)
  }
  return series('cpi', 'CPI (Combined)', '2012=100', v)
})()

/** The reference ATF level the pass-through term is measured against. */
export const ATF_REFERENCE = ATF_NATIONAL.values[0]!

/**
 * Search interest by destination city, weekly, 0-100 - a Google-Trends-shaped series.
 * It is a demand proxy, not a price, which is why it enters attribution as a covariate
 * and never as a deflator.
 */
export interface WeeklySeries {
  readonly id: string
  readonly label: string
  readonly weekStart: readonly string[]
  readonly values: readonly number[]
}

export function buildSearchInterest(weekStarts: readonly string[]): Map<string, WeeklySeries> {
  const out = new Map<string, WeeklySeries>()
  for (const ap of AIRPORTS) {
    const rng = streamFor(MASTER_SEED, `trends-${ap.iata}`)
    const normal = makeNormal(rng)
    let x = 50
    const vals: number[] = []
    for (let w = 0; w < weekStarts.length; w++) {
      const month = Number(weekStarts[w]!.slice(5, 7))
      // Leisure destinations spike in the festive and holiday months.
      const leisure = ['GOI', 'SXR', 'IXZ', 'UDR', 'DED', 'COK', 'TRV'].includes(ap.iata)
      const seasonal =
        (leisure ? 18 : 7) * Math.sin((2 * Math.PI * (month - 3)) / 12) +
        (month === 12 || month === 10 ? (leisure ? 14 : 6) : 0)
      x = 0.72 * x + 0.28 * (46 + seasonal) + 4.2 * normal()
      vals.push(Math.max(0, Math.min(100, x)))
    }
    out.set(ap.iata, {
      id: `trends-${ap.iata}`,
      label: `Search interest - ${ap.city}`,
      weekStart: weekStarts,
      values: vals,
    })
  }
  return out
}

export const ECONOMIC_SERIES: readonly MonthlySeries[] = [
  ATF_NATIONAL,
  BRENT,
  USDINR,
  CPI_COMBINED,
]
