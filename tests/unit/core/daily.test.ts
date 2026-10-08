import { describe, expect, it } from 'vitest';
import {
  DAILY_SHORTER_SECONDS,
  applyModifier,
  candidateModifiers,
  dailyPick,
  dayLabel,
  epochDay,
  isDailyModifier,
  modifierKey,
  modifierProblem,
  parseDayLabel,
} from '../../../src/core/daily';
import {
  MIN_TIME_LIMIT_TICKS,
  TICKS_PER_SECOND,
  createLevel,
  emptySkillSet,
} from '../../../src/core/level';

const DAY_MS = 86_400_000;

describe('epoch days', () => {
  it('matches the UTC calendar (checked against Date.UTC)', () => {
    for (const [y, m, d] of [
      [1970, 1, 1],
      [1969, 12, 31],
      [2000, 2, 29],
      [2000, 3, 1],
      [2024, 12, 31],
      [2026, 10, 8],
      [2100, 3, 1],
    ] as const) {
      expect(epochDay(y, m, d)).toBe(Date.UTC(y, m - 1, d) / DAY_MS);
    }
  });

  it('round-trips labels and rejects impossible dates', () => {
    for (let day = -800; day < 40_000; day += 37) {
      expect(parseDayLabel(dayLabel(day))).toBe(day);
    }
    expect(dayLabel(0)).toBe('1970-01-01');
    expect(parseDayLabel('2026-10-08')).toBe(epochDay(2026, 10, 8));
    expect(parseDayLabel('2026-02-30')).toBeNull();
    expect(parseDayLabel('2026-13-01')).toBeNull();
    expect(parseDayLabel('26-10-08')).toBeNull();
    expect(parseDayLabel('')).toBeNull();
  });
});

describe('dailyPick', () => {
  const counts = Array.from({ length: 30 }, (_, i) => 1 + (i % 4));

  it('is a pure function of the date (same on every platform: pinned values)', () => {
    const day = epochDay(2026, 10, 8);
    expect(dailyPick(day, counts)).toEqual(dailyPick(day, [...counts]));
    const picks = [0, 1, 2, 3].map((i) => dailyPick(day + i, counts));
    expect(picks.map((p) => [p.level, p.variant])).toEqual([
      [20, 0],
      [12, 0],
      [27, 2],
      [17, 1],
    ]);
  });

  it('shows every level once per block of pool-size days, never twice in a row', () => {
    let prev = -1;
    for (let block = 680; block < 720; block++) {
      const seen = new Set<number>();
      for (let i = 0; i < 30; i++) {
        const p = dailyPick(block * 30 + i, counts);
        expect(p.variant).toBeGreaterThanOrEqual(0);
        expect(p.variant).toBeLessThan(counts[p.level] as number);
        expect(p.level).not.toBe(prev);
        prev = p.level;
        seen.add(p.level);
      }
      expect(seen.size).toBe(30);
    }
  });

  it('rejects an empty pool, a level without variants and fractional days', () => {
    expect(() => dailyPick(0, [])).toThrow(RangeError);
    expect(() => dailyPick(0.5, counts)).toThrow(RangeError);
    expect(() => dailyPick(0, [0, 0, 0])).toThrow(RangeError);
  });
});

describe('modifiers', () => {
  const skills = { ...emptySkillSet(), delver: 2, glider: 1 };
  const level = createLevel({ creatures: 10, required: 8, master: 8, skills });

  it('lists the applicable modifiers in a stable order', () => {
    expect(candidateModifiers(level).map(modifierKey)).toEqual([
      'fewer-glider',
      'fewer-delver',
      'shorter',
      'more',
    ]);
    const tight = createLevel({
      required: 10,
      creatures: 10,
      timeLimitTicks: MIN_TIME_LIMIT_TICKS,
    });
    expect(candidateModifiers(tight)).toEqual([]);
    expect(modifierProblem(tight, { kind: 'fewer', skill: 'mason' })).toMatch(/mason/);
  });

  it('applies each modifier without touching the original', () => {
    expect(applyModifier(level, { kind: 'fewer', skill: 'delver' }).skills.delver).toBe(1);
    expect(applyModifier(level, { kind: 'shorter' }).timeLimitTicks).toBe(
      level.timeLimitTicks - DAILY_SHORTER_SECONDS * TICKS_PER_SECOND,
    );
    const more = applyModifier(level, { kind: 'more' });
    expect([more.required, more.master]).toEqual([9, 9]);
    expect(level.skills.delver).toBe(2);
    expect(level.required).toBe(8);
    expect(() => applyModifier(level, { kind: 'fewer', skill: 'mason' })).toThrow(RangeError);
  });

  it('attaches the variant solution or drops the original one', () => {
    const solved = { ...level, solution: { log: [], releaseChanges: [], finalHash: 1 } };
    expect(applyModifier(solved, { kind: 'more' }).solution).toBeUndefined();
    const sol = { log: [], releaseChanges: [], finalHash: 2 };
    expect(applyModifier(solved, { kind: 'more' }, sol).solution).toBe(sol);
  });

  it('recognises modifiers', () => {
    expect(isDailyModifier({ kind: 'more' })).toBe(true);
    expect(isDailyModifier({ kind: 'fewer', skill: 'popper' })).toBe(true);
    expect(isDailyModifier({ kind: 'fewer', skill: 'flyer' })).toBe(false);
    expect(isDailyModifier({ kind: 'faster' })).toBe(false);
    expect(isDailyModifier(null)).toBe(false);
  });
});
