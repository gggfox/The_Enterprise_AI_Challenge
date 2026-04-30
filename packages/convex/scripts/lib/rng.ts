/**
 * Deterministic RNG for the synthetic-data generator.
 *
 * Mulberry32 is a fast 32-bit PRNG that's perfectly adequate for seeding
 * a hackathon dataset. We hash the string seed into a 32-bit unsigned
 * int (xmur3) so we can keep the seed human-readable in source.
 *
 * The whole point of this file is determinism: same seed in, byte-for-byte
 * identical fixtures out. Don't introduce `Math.random()` anywhere in the
 * generator.
 */

export interface Rng {
  next: () => number
  int: (minInclusive: number, maxExclusive: number) => number
  pick: <T>(arr: readonly T[]) => T
  // Sample one element using non-negative weights. Weights need not sum to 1.
  weightedPick: <T>(arr: readonly T[], weights: readonly number[]) => T
  // Box-Muller-ish: returns ~Normal(mean, stddev), clamped to [min, max].
  normal: (mean: number, stddev: number, min?: number, max?: number) => number
  bool: (probabilityTrue: number) => boolean
  // Poisson sampler (Knuth's algorithm). Fine for small lambda (<30).
  poisson: (lambda: number) => number
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeRng(seedString: string): Rng {
  const seedFn = xmur3(seedString)
  const next = mulberry32(seedFn())

  const int = (minInclusive: number, maxExclusive: number): number => {
    return Math.floor(next() * (maxExclusive - minInclusive)) + minInclusive
  }

  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error('pick from empty array')
    return arr[int(0, arr.length)] as T
  }

  const weightedPick = <T>(
    arr: readonly T[],
    weights: readonly number[],
  ): T => {
    if (arr.length !== weights.length) {
      throw new Error('weightedPick: length mismatch')
    }
    let total = 0
    for (const w of weights) total += w
    if (total <= 0) throw new Error('weightedPick: non-positive total weight')
    const r = next() * total
    let acc = 0
    for (let i = 0; i < arr.length; i += 1) {
      acc += weights[i] as number
      if (r < acc) return arr[i] as T
    }
    return arr[arr.length - 1] as T
  }

  const normal = (
    mean: number,
    stddev: number,
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY,
  ): number => {
    // Box-Muller transform.
    let u = 0
    let v = 0
    while (u === 0) u = next()
    while (v === 0) v = next()
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
    const x = mean + z * stddev
    return Math.max(min, Math.min(max, x))
  }

  const bool = (probabilityTrue: number): boolean => next() < probabilityTrue

  const poisson = (lambda: number): number => {
    if (lambda <= 0) return 0
    const L = Math.exp(-lambda)
    let k = 0
    let p = 1
    while (true) {
      k += 1
      p *= next()
      if (p <= L) return k - 1
    }
  }

  return { next, int, pick, weightedPick, normal, bool, poisson }
}
