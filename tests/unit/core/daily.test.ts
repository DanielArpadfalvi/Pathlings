import { describe, expect, it } from 'vitest';
import {
  applyModifier,
  candidateModifiers,
  dailyPick,
  dateOfDay,
  dayNumber,
  modifierKey,
} from '../../../src/core/daily';
import { createLevel, emptySkillSet } from '../../../src/core/level';

describe('day numbers', () => {
  it('counts days from 1970-01-01 (matches Date.UTC)', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2000-03-01')).toBe(11017);
    expect(dayNumber('2026-10-07')).toBe(20733);
    for (const d of ['1969-12-31', '2000-02-29', '2024-12-31', '2100-03-01', '2399-07-15']) {
      const [y, m, day] = d.split('-').map(Number) as [number, number, number];
      expect(dayNumber(d)).toBe(Date.UTC(y, m - 1, day) / 86_400_000);
    }
  });

  it('round-trips through dateOfDay', () => {
    for (let day = -800; day < 40_000; day += 37) expect(dayNumber(dateOfDay(day))).toBe(day);
    expect(dateOfDay(20733)).toBe('2026-10-07');
  });

  it('rejects malformed and impossible dates', () => {
    for (const bad of ['2026-1-07', '2026-13-01', '2026-02-29', '2100-02-29', '2026-04-31', 'x']) {
      expect(() => dayNumber(bad)).toThrow(RangeError);
    }
    expect(dayNumber('2000-02-29')).toBe(11016);
  });
});

describe('dailyPick', () => {
  const counts = Array.from({ length: 30 }, (_, i) => 1 + (i % 3));

  it('is the same for the same date (golden values pin it across platforms)', () => {
    expect(dailyPick('2026-10-07', counts)).toEqual({ date: '2026-10-07', level: 2, variant: 2 });
    expect(dailyPick('2026-10-08', counts)).toEqual({ date: '2026-10-08', level: 20, variant: 0 });
    expect(dailyPick('2027-01-01', counts)).toEqual({ date: '2027-01-01', level: 9, variant: 0 });
    expect(dailyPick('2030-02-28', counts)).toEqual({ date: '2030-02-28', level: 24, variant: 0 });
    expect(dailyPick('2026-10-07', counts)).toEqual(dailyPick('2026-10-07', [...counts]));
  });

  it('shows every pool level exactly once per block of pool-size days', () => {
    const start = Math.ceil(dayNumber('2026-10-07') / 30) * 30;
    for (let block = 0; block < 4; block++) {
      const seen = new Set<number>();
      for (let i = 0; i < 30; i++)
        seen.add(dailyPick(dateOfDay(start + block * 30 + i), counts).level);
      expect(seen.size).toBe(30);
    }
  });

  it('keeps the variant inside the level’s list', () => {
    for (let day = 20_000; day < 20_400; day++) {
      const p = dailyPick(dateOfDay(day), counts);
      expect(p.variant).toBeGreaterThanOrEqual(0);
      expect(p.variant).toBeLessThan(counts[p.level] as number);
    }
  });

  it('rejects an empty pool or a level without variants', () => {
    expect(() => dailyPick('2026-10-07', [])).toThrow(RangeError);
    expect(() => dailyPick('2026-10-07', [0])).toThrow(RangeError);
  });
});

describe('modifiers', () => {
  const skills = { ...emptySkillSet(), mason: 2, glider: 1 };
  const level = createLevel({
    skills,
    creatures: 10,
    required: 8,
    master: 9,
    timeLimitTicks: 18_000,
  });

  it('lists −1 per stocked skill, −60 s and +1 needed', () => {
    expect(candidateModifiers(level).map(modifierKey)).toEqual([
      'skillMinus:glider',
      'skillMinus:mason',
      'timeMinus:60',
      'requiredPlus',
    ]);
    const tight = createLevel({ skills, creatures: 8, required: 8, timeLimitTicks: 7200 });
    expect(candidateModifiers(tight).map(modifierKey)).toEqual([
      'skillMinus:glider',
      'skillMinus:mason',
    ]);
  });

  it('applies without touching the original level', () => {
    const withSolution = { ...level, solution: { log: [], releaseChanges: [], finalHash: 1 } };
    const a = applyModifier(withSolution, { kind: 'skillMinus', skill: 'mason' });
    expect(a.skills.mason).toBe(1);
    expect(a.solution).toBeUndefined();
    expect(withSolution.skills.mason).toBe(2);
    expect(applyModifier(level, { kind: 'timeMinus', seconds: 60 }).timeLimitTicks).toBe(14_400);
    const r = applyModifier(level, { kind: 'requiredPlus' });
    expect([r.required, r.master]).toEqual([9, 9]);
    const r2 = applyModifier({ ...level, master: 8 }, { kind: 'requiredPlus' });
    expect(r2.master).toBe(9);
  });
});
