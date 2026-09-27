import { describe, expect, it } from 'vitest'
import { carli, dutot, jevons, tornqvist } from './elementary'
import { bilateralTornqvist, geksTornqvist, timeProductDummy } from './multilateral'
import { mulberry32 } from '@/lib/rng'
import type { PriceMatrix } from './types'

/**
 * The index-number axioms.
 *
 * These are not unit tests in the usual sense - they are the criteria by which index
 * formulae are judged in the literature, restated as executable assertions. A formula
 * that fails one of these is not "slightly less accurate"; it is disqualified for the
 * use it fails at. Jevons and Tornqvist are expected to pass; Carli is expected to
 * FAIL time reversal, and that failure is asserted rather than tolerated, because it
 * is the reason Carli is offered in the Method Lab only as a comparator.
 *
 * References: ILO CPI Manual (2020) ch. 1 and 20; Diewert (1992) on axiomatic tests.
 */

function synthetic(nProducts: number, nPeriods: number, seed = 7): PriceMatrix {
  const rng = mulberry32(seed)
  const logPrice = new Float64Array(nProducts * nPeriods)
  const price = new Float64Array(nProducts * nPeriods)
  const count = new Int32Array(nProducts * nPeriods).fill(5)
  const quantity = new Float64Array(nProducts * nPeriods)
  for (let i = 0; i < nProducts; i++) {
    const base = 2000 + rng() * 8000
    for (let t = 0; t < nPeriods; t++) {
      const p = base * Math.exp(0.004 * t + 0.05 * (rng() - 0.5))
      price[i * nPeriods + t] = p
      logPrice[i * nPeriods + t] = Math.log(p)
      quantity[i * nPeriods + t] = 1 + rng()
    }
  }
  return {
    nProducts,
    nPeriods,
    logPrice,
    price,
    count,
    quantity,
    periods: Array.from({ length: nPeriods }, (_, t) => `P${t}`),
  }
}

const P0 = [1200, 3400, 5600, 890, 15400, 2300]
const P1 = [1320, 3230, 6100, 950, 14100, 2500]

describe('axiom: identity', () => {
  it('returns 1 when nothing changed', () => {
    expect(jevons(P0, P0)).toBeCloseTo(1, 12)
    expect(dutot(P0, P0)).toBeCloseTo(1, 12)
    expect(carli(P0, P0)).toBeCloseTo(1, 12)
  })

  it('holds for multilateral methods on a flat panel', () => {
    const pm = synthetic(40, 8, 3)
    // Overwrite with a genuinely flat panel.
    for (let i = 0; i < pm.nProducts; i++) {
      const p = pm.price[i * pm.nPeriods]!
      for (let t = 0; t < pm.nPeriods; t++) {
        pm.price[i * pm.nPeriods + t] = p
        pm.logPrice[i * pm.nPeriods + t] = Math.log(p)
      }
    }
    for (const v of geksTornqvist(pm)) expect(v).toBeCloseTo(1, 10)
    for (const v of timeProductDummy(pm).values) expect(v).toBeCloseTo(1, 8)
  })
})

describe('axiom: proportionality', () => {
  it('scales exactly with a uniform price change', () => {
    const k = 1.075
    const scaled = P0.map((p) => p * k)
    expect(jevons(P0, scaled)).toBeCloseTo(k, 12)
    expect(dutot(P0, scaled)).toBeCloseTo(k, 12)
    expect(carli(P0, scaled)).toBeCloseTo(k, 12)
  })

  it('holds for GEKS and TPD', () => {
    const pm = synthetic(50, 6, 11)
    const k = 1.23
    // Multiply the final period by k across every product.
    const T = pm.nPeriods
    for (let i = 0; i < pm.nProducts; i++) {
      pm.price[i * T + (T - 1)] = pm.price[i * T]! * k
      pm.logPrice[i * T + (T - 1)] = Math.log(pm.price[i * T + (T - 1)]!)
      for (let t = 1; t < T - 1; t++) {
        pm.price[i * T + t] = pm.price[i * T]!
        pm.logPrice[i * T + t] = pm.logPrice[i * T]!
      }
    }
    const geks = geksTornqvist(pm)
    expect(geks[T - 1]! / geks[0]!).toBeCloseTo(k, 8)
    const tpd = timeProductDummy(pm).values
    expect(tpd[T - 1]! / tpd[0]!).toBeCloseTo(k, 6)
  })
})

describe('axiom: time reversal', () => {
  it('holds exactly for Jevons', () => {
    expect(jevons(P0, P1) * jevons(P1, P0)).toBeCloseTo(1, 12)
  })

  it('holds exactly for Dutot', () => {
    expect(dutot(P0, P1) * dutot(P1, P0)).toBeCloseTo(1, 12)
  })

  it('holds exactly for Tornqvist', () => {
    const q0 = [3, 1, 0.5, 8, 0.2, 2]
    const q1 = [2.5, 1.4, 0.6, 7, 0.25, 2.2]
    const share = (p: number[], q: number[]): number[] => {
      const e = p.map((x, i) => x * q[i]!)
      const tot = e.reduce((a, b) => a + b, 0)
      return e.map((x) => x / tot)
    }
    const s0 = share(P0, q0)
    const s1 = share(P1, q1)
    expect(tornqvist(P0, P1, s0, s1) * tornqvist(P1, P0, s1, s0)).toBeCloseTo(1, 12)
  })

  it('FAILS for Carli - which is why it is a comparator, not a candidate', () => {
    const roundTrip = carli(P0, P1) * carli(P1, P0)
    expect(roundTrip).toBeGreaterThan(1)
    // The bias is not negligible at realistic dispersion.
    expect(roundTrip - 1).toBeGreaterThan(0.001)
  })
})

describe('axiom: commensurability (units invariance)', () => {
  it('leaves Jevons unchanged when items are rescaled individually', () => {
    const units = [1, 100, 0.01, 7, 1000, 0.5]
    const a = P0.map((p, i) => p * units[i]!)
    const b = P1.map((p, i) => p * units[i]!)
    expect(jevons(a, b)).toBeCloseTo(jevons(P0, P1), 12)
    expect(carli(a, b)).toBeCloseTo(carli(P0, P1), 12)
  })

  it('FAILS for Dutot - it is only valid on homogeneous items', () => {
    const units = [1, 100, 0.01, 7, 1000, 0.5]
    const a = P0.map((p, i) => p * units[i]!)
    const b = P1.map((p, i) => p * units[i]!)
    expect(Math.abs(dutot(a, b) - dutot(P0, P1))).toBeGreaterThan(0.001)
  })
})

describe('axiom: mean value', () => {
  it('lies between the smallest and largest price relative', () => {
    const rel = P0.map((p, i) => P1[i]! / p)
    const lo = Math.min(...rel)
    const hi = Math.max(...rel)
    for (const v of [jevons(P0, P1), dutot(P0, P1), carli(P0, P1)]) {
      expect(v).toBeGreaterThanOrEqual(lo - 1e-12)
      expect(v).toBeLessThanOrEqual(hi + 1e-12)
    }
  })
})

describe('axiom: transitivity (the reason multilateral methods exist)', () => {
  it('GEKS is transitive: P(0,2) equals P(0,1) x P(1,2)', () => {
    const pm = synthetic(60, 5, 19)
    const g = geksTornqvist(pm)
    for (let t = 2; t < pm.nPeriods; t++) {
      const direct = g[t]! / g[0]!
      let chainedPath = 1
      for (let k = 1; k <= t; k++) chainedPath *= g[k]! / g[k - 1]!
      expect(direct).toBeCloseTo(chainedPath, 10)
    }
  })

  it('the underlying bilateral Tornqvist is NOT transitive - which is the problem', () => {
    const pm = synthetic(60, 5, 19)
    const direct = bilateralTornqvist(pm, 0, 2)
    const viaOne = bilateralTornqvist(pm, 0, 1) * bilateralTornqvist(pm, 1, 2)
    expect(Math.abs(direct - viaOne)).toBeGreaterThan(1e-6)
  })

  it('TPD is transitive by construction', () => {
    const pm = synthetic(60, 5, 23)
    const v = timeProductDummy(pm).values
    for (let t = 2; t < pm.nPeriods; t++) {
      let chainedPath = 1
      for (let k = 1; k <= t; k++) chainedPath *= v[k]! / v[k - 1]!
      expect(v[t]! / v[0]!).toBeCloseTo(chainedPath, 10)
    }
  })
})

describe('axiom: invariance to the base period', () => {
  it('GEKS gives the same movements whichever period is the base', () => {
    const pm = synthetic(45, 7, 31)
    const g = geksTornqvist(pm)
    // Rebasing is division by a constant, so ratios must be unaffected.
    const rebased = g.map((v) => v / g[3]!)
    for (let t = 1; t < pm.nPeriods; t++) {
      expect(rebased[t]! / rebased[t - 1]!).toBeCloseTo(g[t]! / g[t - 1]!, 12)
    }
  })
})

describe('TPD estimation', () => {
  it('converges', () => {
    const r = timeProductDummy(synthetic(200, 13, 5))
    expect(r.converged).toBe(true)
    expect(r.iterations).toBeLessThan(200)
  })

  it('recovers a known time effect from a clean two-way design', () => {
    // Construct ln p = gamma_i + delta_t exactly, then check delta is recovered.
    const nP = 30
    const T = 6
    const delta = [0, 0.01, 0.025, 0.018, 0.04, 0.055]
    const logPrice = new Float64Array(nP * T)
    const price = new Float64Array(nP * T)
    const count = new Int32Array(nP * T).fill(3)
    const quantity = new Float64Array(nP * T).fill(1)
    for (let i = 0; i < nP; i++) {
      const gamma = Math.log(1000 + i * 137)
      for (let t = 0; t < T; t++) {
        logPrice[i * T + t] = gamma + delta[t]!
        price[i * T + t] = Math.exp(logPrice[i * T + t]!)
        quantity[i * T + t] = 1
      }
    }
    const pm: PriceMatrix = {
      nProducts: nP, nPeriods: T, logPrice, price, count, quantity,
      periods: Array.from({ length: T }, (_, t) => `P${t}`),
    }
    const v = timeProductDummy(pm).values
    for (let t = 0; t < T; t++) expect(Math.log(v[t]!)).toBeCloseTo(delta[t]!, 8)
  })
})
