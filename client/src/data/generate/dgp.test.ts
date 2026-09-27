import { describe, expect, it } from 'vitest'
import { generateDataset } from './dgp'
import { ROUTE_WEIGHTS, ROUTES } from '../master/routes'

/**
 * These are not unit tests of formatting. They are the guard on the one property the
 * entire demo rests on: that the sample composition drifts, so that a naive average
 * and a constant-quality index are forced apart. If this file goes green and the
 * Method Lab still shows two overlapping lines, the bug is downstream.
 */
describe('fare DGP', () => {
  const ds = generateDataset({ seed: 26056 })

  it('generates a panel in the specified size band', () => {
    expect(ds.panel.n).toBeGreaterThan(400_000)
    expect(ds.panel.n).toBeLessThan(700_000)
  })

  it('is reproducible from the seed', () => {
    const again = generateDataset({ seed: 26056 })
    expect(again.panel.n).toBe(ds.panel.n)
    expect(again.panel.fare[0]).toBe(ds.panel.fare[0])
    expect(again.panel.fare[ds.panel.n - 1]).toBe(ds.panel.fare[ds.panel.n - 1])
  })

  it('produces realistic fare levels', () => {
    let sum = 0
    for (let i = 0; i < ds.panel.n; i++) sum += ds.panel.fare[i]!
    const mean = sum / ds.panel.n
    expect(mean).toBeGreaterThan(3_000)
    expect(mean).toBeLessThan(25_000)
  })

  it('drifts the sample composition toward short horizons over the window', () => {
    const first = ds.composition[0]!
    const last = ds.composition[ds.composition.length - 1]!
    expect(last.shortHorizonShare).toBeGreaterThan(first.shortHorizonShare + 0.05)
    expect(last.meanHorizonDays).toBeLessThan(first.meanHorizonDays - 3)
  })

  it('drifts the sample composition toward full-service carriers and premium cabins', () => {
    const first = ds.composition[0]!
    const last = ds.composition[ds.composition.length - 1]!
    expect(last.fscShare).toBeGreaterThan(first.fscShare * 1.15)
    expect(last.premiumShare).toBeGreaterThan(first.premiumShare * 1.15)
  })

  it('leaves missing cells, concentrated rather than uniform', () => {
    expect(ds.collectionMissRate).toBeGreaterThan(0.02)
    expect(ds.collectionMissRate).toBeLessThan(0.12)
  })

  it('keeps route weights a valid probability distribution', () => {
    const total = ROUTES.reduce((s, r) => s + ROUTE_WEIGHTS.get(r.id)!, 0)
    expect(total).toBeCloseTo(1, 9)
  })

  it('reports the naive mean drifting above the true trend', () => {
    // The true underlying trend is +0.4%/month = ~9.8% over 24 months. A naive mean
    // of the drifting sample must exceed it - that gap IS the demo.
    const first = ds.composition[0]!
    const last = ds.composition[ds.composition.length - 1]!
    // Compare period 12 with period 0 - both October, so the seasonal factor cancels.
    // The endpoint-to-endpoint comparison would straddle a peak-to-trough swing and
    // is not a growth rate; see yoyRatePct in lib/quant/pipeline.ts.
    const yearOn = ds.composition[12]!
    const naiveGrowth = Math.exp(yearOn.meanLogFare - first.meanLogFare) - 1
    const trueTrend = Math.exp(0.004 * 12) - 1

    // Products observed in every period are the fixed matched panel a Jevons index
    // can run on. If this collapses, the matched-model methods have nothing to match.
    const { nProducts, nPeriods, count } = ds.cube
    let fullPanel = 0
    for (let p = 0; p < nProducts; p++) {
      let all = true
      for (let t = 0; t < nPeriods; t++) {
        if (count[p * nPeriods + t] === 0) { all = false; break }
      }
      if (all) fullPanel++
    }
    expect(fullPanel).toBeGreaterThan(300)
    // eslint-disable-next-line no-console
    console.log(
      `\n  observations       ${ds.panel.n.toLocaleString('en-IN')}` +
        `\n  products           ${ds.products.length.toLocaleString('en-IN')}` +
        `\n  empty cube cells   ${(ds.cellMissingRate * 100).toFixed(1)}%` +
        `\n  collection misses  ${(ds.collectionMissRate * 100).toFixed(1)}%` +
        `\n  short-horizon share ${(first.shortHorizonShare * 100).toFixed(1)}% -> ${(last.shortHorizonShare * 100).toFixed(1)}%` +
        `\n  FSC share           ${(first.fscShare * 100).toFixed(1)}% -> ${(last.fscShare * 100).toFixed(1)}%` +
        `\n  premium share       ${(first.premiumShare * 100).toFixed(1)}% -> ${(last.premiumShare * 100).toFixed(1)}%` +
        `\n  mean horizon        ${first.meanHorizonDays.toFixed(1)}d -> ${last.meanHorizonDays.toFixed(1)}d` +
        `\n  NAIVE 12m growth    ${(naiveGrowth * 100).toFixed(2)}%` +
        `\n  true 12m trend      ${(trueTrend * 100).toFixed(2)}%\n`,
    )
    // The naive mean must overstate the true trend, because the sample composition
    // drifted toward more expensive slices. That gap is the whole demonstration.
    expect(naiveGrowth).toBeGreaterThan(trueTrend + 0.02)
  })
})
