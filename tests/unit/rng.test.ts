import { describe, expect, it } from 'vitest';
import { cloneRng, createRng, nextUint32, pick, randInt, shuffle } from '../../src/core/rng';

const take = (seed: string, n: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => nextUint32(rng));
};

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    expect(take('2026-10-06', 32)).toEqual(take('2026-10-06', 32));
  });

  it('produces a fixed, platform-independent sequence (golden values)', () => {
    const golden = take('pathlings', 4);
    // Golden values pin the algorithm: changing them breaks the daily-level pick on shipped builds.
    expect(golden).toMatchInlineSnapshot(`
      [
        2736591915,
        1378393642,
        939434833,
        571660413,
      ]
    `);
  });

  it('different seeds diverge', () => {
    expect(take('a', 8)).not.toEqual(take('b', 8));
    expect(take('1', 8)).toEqual(take(1 as unknown as string, 8));
  });

  it('outputs unsigned 32-bit integers', () => {
    for (const x of take('range', 1000)) {
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(2 ** 32);
    }
  });

  it('clone continues identically and independently', () => {
    const a = createRng('clone');
    nextUint32(a);
    const b = cloneRng(a);
    expect(nextUint32(a)).toBe(nextUint32(b));
    nextUint32(a);
    expect(a).not.toEqual(b);
    expect(JSON.parse(JSON.stringify(b))).toEqual(b);
  });

  it('randInt stays in range, hits every value and is roughly uniform', () => {
    const rng = createRng('uniform');
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 7000; i++) {
      const v = randInt(rng, 7);
      expect(Number.isInteger(v)).toBe(true);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeGreaterThan(850);
    expect(randInt(rng, 1)).toBe(0);
    expect(randInt(rng, 2 ** 32)).toBeLessThan(2 ** 32);
  });

  it('randInt rejects invalid bounds', () => {
    const rng = createRng('bad');
    for (const n of [0, -1, 1.5, Number.NaN, 2 ** 32 + 1]) {
      expect(() => randInt(rng, n)).toThrow(RangeError);
    }
  });

  it('pick and shuffle are deterministic', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(pick(createRng('p'), items)).toBe(pick(createRng('p'), items));
    expect(() => pick(createRng('p'), [])).toThrow(RangeError);
    const s1 = shuffle(createRng('s'), [...items]);
    const s2 = shuffle(createRng('s'), [...items]);
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual(items);
  });
});
