/**
 * Seeded, serializable PRNG (sfc32 seeded through cyrb128), integer-only.
 *
 * Used only where randomness is needed (daily level pick). The state is a plain object, so it
 * survives `structuredClone` / JSON and can be stored in keyframes. All helpers are free
 * functions that mutate the passed state; outputs are identical on every platform.
 */

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export type Seed = string | number;

/** cyrb128 string hash → four unsigned 32-bit words. */
export function hashSeed(seed: Seed): [number, number, number, number] {
  const str = String(seed);
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function createRng(seed: Seed): RngState {
  const [a, b, c, d] = hashSeed(seed);
  const state: RngState = { a, b, c, d };
  // Warm up: the first outputs are weakly mixed.
  for (let i = 0; i < 15; i++) nextUint32(state);
  return state;
}

export function cloneRng(state: RngState): RngState {
  return { a: state.a, b: state.b, c: state.c, d: state.d };
}

/** sfc32 step: returns an unsigned 32-bit integer and advances the state. */
export function nextUint32(state: RngState): number {
  const { a, b, c, d } = state;
  const t = (((a + b) >>> 0) + d) >>> 0;
  state.d = (d + 1) >>> 0;
  state.a = (b ^ (b >>> 9)) >>> 0;
  state.b = (c + (c << 3)) >>> 0;
  const rotated = (c << 21) | (c >>> 11);
  state.c = (rotated + t) >>> 0;
  return t;
}

const UINT32_RANGE = 0x1_0000_0000;

/** Unbiased integer in [0, n) via rejection sampling (no floating point). `1 ≤ n ≤ 2^32`. */
export function randInt(state: RngState, n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > UINT32_RANGE) {
    throw new RangeError(`randInt: invalid bound ${n}`);
  }
  // Largest multiple of n that fits in the 32-bit range; values at or above it are rejected.
  const limit = UINT32_RANGE - (UINT32_RANGE % n);
  for (;;) {
    const x = nextUint32(state);
    if (x < limit) return x % n;
  }
}

export function pick<T>(state: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick: empty array');
  return items[randInt(state, items.length)] as T;
}

/** In-place Fisher–Yates shuffle; returns the same array. */
export function shuffle<T>(state: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(state, i + 1);
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
  return items;
}
