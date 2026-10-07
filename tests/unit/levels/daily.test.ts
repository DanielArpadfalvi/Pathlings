import { describe, expect, it } from 'vitest';
import { dailyLevel } from '../../../src/app/daily';
import { applyModifier, dateOfDay, dayNumber, modifierKey } from '../../../src/core/daily';
import { runSolution } from '../../../src/core/replay';
import { BUILTIN_LEVELS, DAILY_VARIANTS } from '../../../src/levels/catalog';
import { checkDaily } from '../../../src/levels/validate';

describe('daily level', () => {
  it('has 30 bonus levels, each with at least one validated variant', () => {
    expect(BUILTIN_LEVELS.bonus).toHaveLength(30);
    for (const l of BUILTIN_LEVELS.bonus) {
      expect(l).not.toHaveProperty('daily');
      expect(DAILY_VARIANTS[l.id]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('every pick of the next 365 days replays its verified solution', () => {
    const from = dayNumber('2026-10-07');
    const checked = new Set<string>();
    for (let day = from; day < from + 365; day++) {
      const d = dailyLevel(dateOfDay(day));
      expect(d).not.toBeNull();
      const key = `${d!.base.id}/${modifierKey(d!.modifier)}`;
      if (checked.has(key)) continue;
      checked.add(key);
      const r = runSolution(d!.level);
      expect(r.won && r.hashMatches && r.rejected === 0, key).toBe(true);
    }
    // 365 days cover every pool level at least 12 times.
    expect(new Set([...checked].map((k) => k.split('/')[0])).size).toBe(30);
  });

  it('is the same level and modifier for the same date', () => {
    const a = dailyLevel('2026-12-24')!;
    const b = dailyLevel('2026-12-24')!;
    expect(a.base.id).toBe(b.base.id);
    expect(a.modifier).toEqual(b.modifier);
    const variant = DAILY_VARIANTS[a.base.id]!.find((v) => v.modifier === a.modifier)!;
    expect(a.level).toEqual({ ...applyModifier(a.base, a.modifier), solution: variant.solution });
  });

  it('flags broken daily variants', () => {
    const base = BUILTIN_LEVELS.bonus[0]!;
    const variants = DAILY_VARIANTS[base.id]!;
    expect(checkDaily(base, 'bonus', variants)).toEqual([]);
    expect(checkDaily(base, 'bonus', [])).toEqual(['bonus level needs at least one daily variant']);
    expect(checkDaily(base, 'w1', variants)).toEqual([
      'daily variants are only allowed in the bonus pool',
    ]);
    const v = variants[0]!;
    const broken = checkDaily(base, 'bonus', [
      v,
      v,
      { modifier: { kind: 'skillMinus', skill: 'popper' }, solution: v.solution },
      { ...v, solution: { ...v.solution, finalHash: (v.solution.finalHash + 1) >>> 0 } },
    ]);
    expect(broken.join('\n')).toContain('duplicate');
    expect(broken.join('\n')).toContain('skillMinus:popper: not a valid modifier');
    expect(broken.join('\n')).toContain('hash drifted');
  });
});
