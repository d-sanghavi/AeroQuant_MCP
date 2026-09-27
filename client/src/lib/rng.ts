/**
 * Deterministic pseudo-random numbers.
 *
 * Reproducibility is not a nicety here. If the demo generates a different dataset on
 * every reload then the divergence figure quoted on stage changes between rehearsal and
 * performance, and every screenshot in the report is unreproducible. One seed, one
 * dataset, forever.
 *
 * mulberry32 is chosen because it is 5 lines, has no hidden state, and passes the
 * statistical tests that matter at this scale. It is not cryptographic and must never
 * be used as if it were.
 */

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Derive an independent stream from a string key. Lets each route, airline or series
 * have its own reproducible sub-stream without threading a counter through everything.
 */
export function streamFor(seed: number, key: string): Rng {
  let h = 2166136261 ^ seed
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return mulberry32(h >>> 0)
}

/** Box-Muller. Returns one standard normal per call; the spare is cached. */
export function makeNormal(rng: Rng): () => number {
  let spare: number | null = null
  return function normal(): number {
    if (spare !== null) {
      const s = spare
      spare = null
      return s
    }
    let u = 0
    let v = 0
    let s = 0
    do {
      u = rng() * 2 - 1
      v = rng() * 2 - 1
      s = u * u + v * v
    } while (s === 0 || s >= 1)
    const f = Math.sqrt((-2 * Math.log(s)) / s)
    spare = v * f
    return u * f
  }
}

/** Student-t via the normal/chi mixture. Fat tails for the fare residual. */
export function makeStudentT(rng: Rng, df: number): () => number {
  const normal = makeNormal(rng)
  return function t(): number {
    let chi = 0
    for (let i = 0; i < df; i++) {
      const z = normal()
      chi += z * z
    }
    return normal() / Math.sqrt(chi / df)
  }
}

/** Weighted choice over a parallel weights array. Weights need not be normalised. */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0
  for (let i = 0; i < weights.length; i++) total += weights[i]!
  let r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!
    if (r <= 0) return i
  }
  return weights.length - 1
}

export function pick<T>(rng: Rng, xs: readonly T[]): T {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]!
}

export function uniform(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng()
}

/**
 * A stable 32-bit hash of a string. Used to give every synthetic observation a
 * deterministic identity independent of iteration order.
 */
export function hash32(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** The one seed the entire prototype is generated from. */
export const MASTER_SEED = 26056
