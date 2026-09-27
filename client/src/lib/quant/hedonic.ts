/**
 * Time-Dummy Hedonic (TDH) quality adjustment.
 *
 * The problem this solves is the one that makes airfare hard. A "flight from Delhi to
 * Mumbai" is not one product; it is a family of products that differ in booking
 * horizon, cabin, refundability, baggage, stops and carrier, and those characteristics
 * carry most of the price variation. If the mix of characteristics in the sample
 * changes - and in this data it does, deliberately - then an unadjusted average moves
 * for reasons that have nothing to do with price.
 *
 * The model is
 *
 *   ln(fare) = a + f(horizon) + cabin + stops + refundable + baggage
 *              + airline + route + SUM_t delta_t * 1[period = t] + e
 *
 * and exp(delta_t) is the constant-quality index: the price of a FIXED bundle of
 * characteristics in period t relative to the base.
 *
 * f(horizon) is a natural cubic spline, not a polynomial. The horizon effect is flat
 * beyond a month and then turns sharply inside a fortnight; a cubic in levels either
 * misses the turn or oscillates at the ends. A natural spline is linear beyond the
 * boundary knots, which is exactly the right prior for "nothing much happens at 90
 * days out".
 */

import { AIRLINES, FARE_FAMILY, type FareFamily } from '@/data/master/airlines'
import { HORIZONS, ROUTES } from '@/data/master/routes'
import { FAMILIES, type ProductDef } from '@/data/generate/dgp'
import {
  cholesky,
  cholInverseDiagonal,
  cholSolve,
  NormalEquations,
} from '@/lib/linalg/cholesky'
import type { PriceMatrix } from './types'

/** Knots chosen where the horizon curve actually bends, not at even quantiles. */
export const SPLINE_KNOTS = [2, 10, 30, 75] as const

/**
 * Natural cubic spline basis (truncated power form), excluding the intercept.
 * K knots produce K-2 basis columns plus the linear term: 3 columns for 4 knots.
 */
export function naturalSplineBasis(x: number, knots: readonly number[] = SPLINE_KNOTS): number[] {
  const K = knots.length
  const xs = x / 90 // scale to ~[0,1]; raw days make the cubic terms enormous
  const ks = knots.map((k) => k / 90)
  const cube = (u: number): number => (u > 0 ? u * u * u : 0)
  const last = ks[K - 1]!
  const penult = ks[K - 2]!
  const dk = (k: number): number =>
    (cube(xs - ks[k]!) - cube(xs - last)) / (last - ks[k]!)
  const dPenult = (cube(xs - penult) - cube(xs - last)) / (last - penult)

  const out: number[] = [xs]
  for (let k = 0; k < K - 2; k++) out.push(dk(k) - dPenult)
  return out
}

export interface HedonicCoefficient {
  readonly name: string
  readonly group: string
  readonly value: number
  readonly stdError: number
  readonly tStat: number
  /** Percentage effect on fare, for the coefficients where that reads naturally. */
  readonly pctEffect: number
}

export interface HedonicResult {
  readonly index: number[]
  readonly periods: readonly string[]
  readonly coefficients: readonly HedonicCoefficient[]
  readonly r2: number
  readonly adjR2: number
  readonly sigma: number
  readonly nObs: number
  readonly nParams: number
  readonly rank: number
  readonly droppedColumns: number
  /** Fitted horizon curve, for plotting against the raw term structure. */
  readonly horizonCurve: { horizon: number; logEffect: number }[]
}

interface ColumnSpec {
  readonly name: string
  readonly group: string
}

/**
 * Fit the TDH model on the product x period cube.
 *
 * One row per observed cell, weighted by expenditure (route passenger weight times
 * observation count). Weighting matters: an unweighted fit would let a thin
 * Port Blair product count as much as a Delhi-Mumbai one, and the index is supposed
 * to represent what passengers actually pay.
 */
export function fitHedonic(
  pm: PriceMatrix,
  products: readonly ProductDef[],
  from = 0,
  to = pm.nPeriods - 1,
): HedonicResult {
  const nPeriods = pm.nPeriods
  const T = to - from + 1
  const nSpline = SPLINE_KNOTS.length - 1
  const nAirlineDummies = AIRLINES.length - 1
  const nRouteDummies = ROUTES.length - 1

  const columns: ColumnSpec[] = [{ name: 'intercept', group: 'intercept' }]
  for (let i = 0; i < nSpline; i++) {
    columns.push({ name: `horizon spline ${i + 1}`, group: 'booking horizon' })
  }
  columns.push({ name: 'cabin: premium', group: 'cabin' })
  columns.push({ name: 'cabin: business', group: 'cabin' })
  columns.push({ name: 'one-stop', group: 'itinerary' })
  columns.push({ name: 'refundable', group: 'fare conditions' })
  columns.push({ name: 'baggage (kg, centred)', group: 'fare conditions' })
  for (let a = 1; a < AIRLINES.length; a++) {
    columns.push({ name: `airline: ${AIRLINES[a]!.code}`, group: 'airline' })
  }
  for (let r = 1; r < ROUTES.length; r++) {
    columns.push({ name: `route: ${ROUTES[r]!.id}`, group: 'route' })
  }
  for (let t = 1; t < T; t++) {
    columns.push({ name: `period: ${pm.periods[from + t]}`, group: 'time' })
  }

  const p = columns.length
  const SPLINE0 = 1
  const CABIN0 = SPLINE0 + nSpline
  const STOPS = CABIN0 + 2
  const REFUND = STOPS + 1
  const BAGGAGE = REFUND + 1
  const AIRLINE0 = BAGGAGE + 1
  const ROUTE0 = AIRLINE0 + nAirlineDummies
  const TIME0 = ROUTE0 + nRouteDummies

  // --- single streaming pass into the normal equations ----------------------
  // Rows are never materialised. See lib/linalg/cholesky.ts for why.
  const ne = new NormalEquations(p)

  // Cache the spline basis - there are only nine distinct horizons.
  const splineByHorizon = HORIZONS.map((h) => naturalSplineBasis(h))
  const meanBaggage =
    FAMILIES.reduce((s, f) => s + FARE_FAMILY[f].baggageKg, 0) / FAMILIES.length

  const idx = new Int32Array(16)
  const val = new Float64Array(16)

  for (let i = 0; i < products.length; i++) {
    const prod = products[i]!
    const basis = splineByHorizon[prod.horizonIdx]!
    const fam = FAMILIES[prod.familyIdx] as FareFamily
    const famDef = FARE_FAMILY[fam]

    // Everything except the time dummy is constant across periods for a product,
    // so build the row prefix once and append the period column inside the loop.
    let k = 0
    idx[k] = 0; val[k] = 1; k++
    for (let s = 0; s < nSpline; s++) { idx[k] = SPLINE0 + s; val[k] = basis[s]!; k++ }
    if (prod.cabinIdx === 1) { idx[k] = CABIN0; val[k] = 1; k++ }
    if (prod.cabinIdx === 2) { idx[k] = CABIN0 + 1; val[k] = 1; k++ }
    if (prod.stops === 1) { idx[k] = STOPS; val[k] = 1; k++ }
    if (famDef.refundable) { idx[k] = REFUND; val[k] = 1; k++ }
    idx[k] = BAGGAGE; val[k] = (famDef.baggageKg - meanBaggage) / 10; k++
    if (prod.airlineIdx > 0) { idx[k] = AIRLINE0 + prod.airlineIdx - 1; val[k] = 1; k++ }
    if (prod.routeIdx > 0) { idx[k] = ROUTE0 + prod.routeIdx - 1; val[k] = 1; k++ }
    const prefix = k

    for (let t = 0; t < T; t++) {
      const cell = i * nPeriods + from + t
      if (pm.count[cell]! === 0) continue
      let kk = prefix
      if (t > 0) { idx[kk] = TIME0 + t - 1; val[kk] = 1; kk++ }
      ne.push(idx, val, kk, pm.logPrice[cell]!, Math.max(1e-12, pm.quantity[cell]!))
    }
  }

  const n = ne.n
  if (n <= p) throw new Error(`fitHedonic: ${n} observations for ${p} parameters`)

  const XtX = ne.toMatrix()
  const chol = cholesky(XtX)
  const beta = cholSolve(chol, ne.Xty)

  // RSS without a second data pass: for the normal-equation solution,
  // RSS = y'Wy - 2 b'X'Wy + b'X'WX b, and the middle and last terms cancel to
  // -b'X'Wy at the optimum.
  let bXty = 0
  for (let j = 0; j < p; j++) bXty += beta[j]! * ne.Xty[j]!
  const rss = Math.max(0, ne.yty - bXty)
  const ybar = ne.wy / ne.wsum
  const tss = Math.max(1e-300, ne.yty - ne.wsum * ybar * ybar)
  const df = n - p
  const sigma2 = df > 0 ? rss / df : NaN
  const r2 = 1 - rss / tss
  const adjR2 = 1 - (1 - r2) * ((n - 1) / Math.max(1, df))

  const invDiag = cholInverseDiagonal(chol)
  const stdErrors = new Float64Array(p)
  for (let j = 0; j < p; j++) stdErrors[j] = Math.sqrt(Math.max(0, sigma2 * invDiag[j]!))

  const fit = {
    beta,
    stdErrors,
    r2,
    adjR2,
    sigma: Math.sqrt(sigma2),
    rank: chol.ok ? p : p,
    droppedColumns: [] as number[],
  }

  const coefficients: HedonicCoefficient[] = columns.map((c, j) => {
    const v = fit.beta[j]!
    const se = fit.stdErrors[j]!
    return {
      name: c.name,
      group: c.group,
      value: v,
      stdError: se,
      tStat: se > 0 ? v / se : NaN,
      pctEffect: (Math.exp(v) - 1) * 100,
    }
  })

  const index: number[] = [1]
  for (let t = 1; t < T; t++) index.push(Math.exp(fit.beta[TIME0 + t - 1]!))

  const horizonCurve = HORIZONS.map((h) => {
    const basis = naturalSplineBasis(h)
    let e = 0
    for (let s = 0; s < nSpline; s++) e += basis[s]! * fit.beta[SPLINE0 + s]!
    return { horizon: h, logEffect: e }
  })
  // Centre the curve at T-30 so it is comparable with the DGP's own parameterisation.
  const centre = horizonCurve.find((x) => x.horizon === 30)?.logEffect ?? 0
  for (const pt of horizonCurve) (pt as { logEffect: number }).logEffect -= centre

  return {
    index,
    periods: pm.periods.slice(from, to + 1),
    coefficients,
    r2: fit.r2,
    adjR2: fit.adjR2,
    sigma: fit.sigma,
    nObs: n,
    nParams: p,
    rank: fit.rank,
    droppedColumns: fit.droppedColumns.length,
    horizonCurve,
  }
}
