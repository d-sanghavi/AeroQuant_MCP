import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Clamp to a range. Used everywhere in the quant layer, so keep it allocation-free. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

/** Stable sort by a numeric key (Array.prototype.sort is stable in ES2019+). */
export function sortBy<T>(xs: readonly T[], key: (x: T) => number): T[] {
  return [...xs].sort((a, b) => key(a) - key(b))
}

export function sum(xs: readonly number[]): number {
  let s = 0
  for (let i = 0; i < xs.length; i++) s += xs[i]!
  return s
}

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

export function uniq<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)]
}

export function groupBy<T, K extends string | number>(
  xs: readonly T[],
  key: (x: T) => K,
): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const x of xs) {
    const k = key(x)
    const bucket = m.get(k)
    if (bucket) bucket.push(x)
    else m.set(k, [x])
  }
  return m
}
