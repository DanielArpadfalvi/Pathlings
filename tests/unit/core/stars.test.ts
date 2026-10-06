import { describe, expect, it } from 'vitest';
import { createLevel } from '../../../src/core/level';
import { runSolution } from '../../../src/core/replay';
import { rateRun } from '../../../src/core/stars';
import { FIXTURE_LEVELS, tunnel } from '../../../src/levels/test';

const level = createLevel({ creatures: 10, required: 5, master: 8, frugal: 2 });

describe('rateRun', () => {
  it('no stars when too few are saved', () => {
    expect(rateRun(level, 4, 0)).toEqual({ won: false, master: false, frugal: false, count: 0 });
  });

  it('★ for reaching the requirement', () => {
    expect(rateRun(level, 5, 3)).toEqual({ won: true, master: false, frugal: false, count: 1 });
  });

  it('★★ for the master threshold, ★★★ adds frugality', () => {
    expect(rateRun(level, 8, 3).count).toBe(2);
    expect(rateRun(level, 8, 2).count).toBe(3);
  });

  it('frugal without master is still two stars', () => {
    expect(rateRun(level, 5, 1)).toEqual({ won: true, master: false, frugal: true, count: 2 });
  });

  it('every fixture solution earns at least one star; tunnel earns all three', () => {
    for (const l of FIXTURE_LEVELS) {
      const r = runSolution(l);
      expect(rateRun(l, r.saved, r.assignments).count, l.id).toBeGreaterThan(0);
    }
    const r = runSolution(tunnel);
    expect(rateRun(tunnel, r.saved, r.assignments).count).toBe(3);
  });
});
