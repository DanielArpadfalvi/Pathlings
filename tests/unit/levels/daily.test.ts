import { describe, expect, it } from 'vitest';
import { applyModifier, epochDay, modifierKey } from '../../../src/core/daily';
import { runSolution } from '../../../src/core/replay';
import { BONUS_DAILY, BUILTIN_LEVELS } from '../../../src/levels/catalog';
import { dailyLevel } from '../../../src/levels/daily';
import { checkDailyVariants } from '../../../src/levels/validate';

const pool = BUILTIN_LEVELS.bonus;
const START = epochDay(2026, 10, 8);

describe('bonus pool + daily level', () => {
  it('has 30 bonus levels, each with at least one daily variant', () => {
    expect(pool).toHaveLength(30);
    expect(BONUS_DAILY).toHaveLength(30);
    for (const v of BONUS_DAILY) expect(v.length).toBeGreaterThan(0);
    // The catalog keeps the variants apart from the level definitions.
    expect(pool.every((l) => !('daily' in l) && !('plan' in l))).toBe(true);
  });

  it('gives the same level and modifier for the same date', () => {
    const a = dailyLevel(START, pool, BONUS_DAILY);
    const b = dailyLevel(START, pool, BONUS_DAILY);
    expect(a).not.toBeNull();
    expect(b?.base.id).toBe(a?.base.id);
    expect(b?.mod).toEqual(a?.mod);
    expect(a?.label).toBe('2026-10-08');
  });

  it('every level × modifier of the next 365 days replays its solution to a win', () => {
    const combos = new Map<string, ReturnType<typeof dailyLevel>>();
    for (let day = START; day < START + 365; day++) {
      const d = dailyLevel(day, pool, BONUS_DAILY);
      combos.set(`${d?.base.id} ${d && modifierKey(d.mod)}`, d);
    }
    expect(new Set([...combos.values()].map((d) => d?.base.id)).size).toBe(30);
    for (const [key, d] of combos) {
      const r = runSolution(d!.level);
      expect({ key, won: r.won, hash: r.hashMatches, rejected: r.rejected }).toEqual({
        key,
        won: true,
        hash: true,
        rejected: 0,
      });
    }
  });

  it('returns null for an empty or inconsistent pool', () => {
    expect(dailyLevel(START, [], [])).toBeNull();
    expect(dailyLevel(START, pool, BONUS_DAILY.slice(1))).toBeNull();
    expect(dailyLevel(START, pool.slice(0, 1), [[]])).toBeNull();
  });
});

describe('checkDailyVariants', () => {
  const level = pool[0]!;
  const variants = BONUS_DAILY[0]!;

  it('accepts the shipped variants', () => {
    expect(checkDailyVariants(level, variants)).toEqual([]);
  });

  it('flags missing, invalid, duplicate, inapplicable and drifted variants', () => {
    expect(checkDailyVariants(level, undefined)).toEqual(['daily variants missing']);
    expect(checkDailyVariants(level, [])).toEqual(['daily variants missing']);
    const v = variants[0]!;
    expect(checkDailyVariants(level, [{ ...v, mod: { kind: 'faster' } }])[0]).toMatch(/invalid/);
    expect(checkDailyVariants(level, [v, v]).some((p) => p.includes('duplicate'))).toBe(true);
    expect(
      checkDailyVariants(level, [{ ...v, mod: { kind: 'fewer', skill: 'popper' } }])[0],
    ).toMatch(/no popper/);
    const drifted = { ...v, solution: { ...v.solution, finalHash: v.solution.finalHash ^ 1 } };
    expect(checkDailyVariants(level, [drifted]).some((p) => p.includes('drifted'))).toBe(true);
    const lost = { ...v, solution: { ...v.solution, log: [] } };
    expect(checkDailyVariants(level, [lost]).some((p) => p.includes('saves'))).toBe(true);
    // The modified level is what the solution was recorded on.
    expect(runSolution(applyModifier(level, v.mod, v.solution)).hashMatches).toBe(true);
  });
});
