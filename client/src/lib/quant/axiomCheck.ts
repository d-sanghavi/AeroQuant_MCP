import { carli, dutot, harmonic, jevons } from './elementary'
import { bilateralTornqvist, geksTornqvist, timeProductDummy } from './multilateral'
import type { PriceMatrix } from './types'

/**
 * Index-number axioms, checked at runtime.
 *
 * The Methodology screen could state which formula satisfies which axiom from a table
 * in a textbook. It does not, for the same reason the charts are not static arrays:
 * the claim of this product is that these properties are demonstrable on data rather
 * than asserted from authority. So the checks run in the browser, on a small
 * purpose-built price vector, and the screen reports what actually happened.
 *
 * The failures are the interesting rows. Carli fails time reversal, Dutot fails
 * commensurability, and a bilateral Tornqvist is not transitive - these are not
 * pathologies at the edge of the parameter space, they are why a national statistical
 * office does not chain a Carli index of a churning sample.
 */

export interface AxiomOutcome {
  readonly method: string
  readonly axiom: string
  readonly satisfied: boolean
  /** The quantity that decides it, formatted for display. */
  readonly detail: string
}

type Elementary = (base: readonly number[], curr: readonly number[]) => number

const ELEMENTARY: { name: string; fn: Elementary }[] = [
  { name: 'Carli (mean of ratios)', fn: carli },
  { name: 'Dutot (ratio of means)', fn: dutot },
  { name: 'Jevons (geometric mean)', fn: jevons },
  { name: 'Harmonic', fn: harmonic },
]

const TOL = 1e-9

/** A deliberately dispersed pair of price vectors - axioms fail on dispersion. */
const P0 = [2400, 5200, 9800, 14300, 31000]
const P1 = [3100, 4800, 12600, 13100, 27500]

export function checkAxioms(): AxiomOutcome[] {
  const out: AxiomOutcome[] = []

  for (const { name, fn } of ELEMENTARY) {
    // Identity: unchanged prices must give exactly 1.
    const identity = fn(P0, P0)
    out.push({
      method: name,
      axiom: 'Identity',
      satisfied: Math.abs(identity - 1) < TOL,
      detail: `I(p, p) = ${identity.toFixed(9)}`,
    })

    // Proportionality: scaling every price by lambda must give exactly lambda.
    const lambda = 1.37
    const prop = fn(P0, P0.map((p) => p * lambda))
    out.push({
      method: name,
      axiom: 'Proportionality',
      satisfied: Math.abs(prop - lambda) < 1e-7,
      detail: `I(p, ${lambda}p) = ${prop.toFixed(7)}`,
    })

    // Commensurability: changing the UNITS of one item must not move the index. Here
    // the third item is quoted in paise rather than rupees.
    const scale = [1, 1, 100, 1, 1]
    const base = fn(P0, P1)
    const rescaled = fn(
      P0.map((p, i) => p * scale[i]!),
      P1.map((p, i) => p * scale[i]!),
    )
    out.push({
      method: name,
      axiom: 'Commensurability',
      satisfied: Math.abs(base - rescaled) < 1e-7,
      detail: `${base.toFixed(6)} vs ${rescaled.toFixed(6)} after a unit change`,
    })

    // Time reversal: running the comparison backwards must invert it exactly.
    const fwd = fn(P0, P1)
    const rev = fn(P1, P0)
    const product = fwd * rev
    out.push({
      method: name,
      axiom: 'Time reversal',
      satisfied: Math.abs(product - 1) < 1e-7,
      detail: `I(0,1) × I(1,0) = ${product.toFixed(6)}`,
    })

    // Mean value: the index must lie between the smallest and largest price relative.
    const ratios = P1.map((p, i) => p / P0[i]!)
    const lo = Math.min(...ratios)
    const hi = Math.max(...ratios)
    out.push({
      method: name,
      axiom: 'Mean value',
      satisfied: fwd >= lo - TOL && fwd <= hi + TOL,
      detail: `${lo.toFixed(4)} ≤ ${fwd.toFixed(4)} ≤ ${hi.toFixed(4)}`,
    })
  }

  // --- transitivity, which only multilateral methods can have ---------------
  const pm = transitivityMatrix()
  const direct02 = bilateralTornqvist(pm, 0, 2)
  const chain = bilateralTornqvist(pm, 0, 1) * bilateralTornqvist(pm, 1, 2)
  out.push({
    method: 'Bilateral Törnqvist',
    axiom: 'Transitivity',
    satisfied: Math.abs(direct02 - chain) < 1e-6,
    detail: `direct ${direct02.toFixed(6)} vs chained ${chain.toFixed(6)}`,
  })

  for (const [name, values] of [
    ['GEKS-Törnqvist', geksTornqvist(pm)],
    ['Time Product Dummy', timeProductDummy(pm).values],
  ] as const) {
    const d = values[2]! / values[0]!
    const c = (values[1]! / values[0]!) * (values[2]! / values[1]!)
    out.push({
      method: name,
      axiom: 'Transitivity',
      satisfied: Math.abs(d - c) < 1e-9,
      detail: `direct ${d.toFixed(9)} vs chained ${c.toFixed(9)}`,
    })
  }

  return out
}

/**
 * Three periods, four products, with the expenditure shares moving between them.
 * Transitivity only fails when the weights change, so a matrix with constant shares
 * would let a bilateral index pass a test it should not.
 */
function transitivityMatrix(): PriceMatrix {
  const nProducts = 4
  const nPeriods = 3
  const prices = [
    [100, 118, 131],
    [240, 232, 268],
    [ 75,  96,  88],
    [410, 455, 470],
  ]
  const quantities = [
    [900, 640, 410],
    [220, 300, 380],
    [1400, 1180, 1620],
    [ 80,  96,  70],
  ]

  const price = new Float64Array(nProducts * nPeriods)
  const logPrice = new Float64Array(nProducts * nPeriods)
  const quantity = new Float64Array(nProducts * nPeriods)
  const count = new Int32Array(nProducts * nPeriods).fill(1)
  for (let i = 0; i < nProducts; i++) {
    for (let t = 0; t < nPeriods; t++) {
      const k = i * nPeriods + t
      price[k] = prices[i]![t]!
      logPrice[k] = Math.log(prices[i]![t]!)
      quantity[k] = quantities[i]![t]!
    }
  }

  return {
    nProducts,
    nPeriods,
    price,
    logPrice,
    count,
    quantity,
    periods: ['t0', 't1', 't2'],
  }
}
