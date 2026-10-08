import { describe, expect, it } from 'vitest';
import { solutionHint } from '../../../src/app/hud';
import type { Solution } from '../../../src/core/level';
import { setLanguage } from '../../../src/i18n';
import { HINT_FAILS, HelpTracker, SOLUTION_FAILS, solutionSkills } from '../../../src/app/help';
import { SaveGame } from '../../../src/app/save';
import { createMemoryStore } from '../../../src/platform/storage';

function failTimes(h: HelpTracker, key: string, n: number): void {
  for (let i = 0; i < n; i++) h.recordFail(key);
}

describe('HelpTracker', () => {
  it('unlocks hints after 3 failed tries and the solution after 5', () => {
    expect([HINT_FAILS, SOLUTION_FAILS]).toEqual([3, 5]);
    const h = new HelpTracker(new SaveGame(createMemoryStore()));
    failTimes(h, 'w1-01', 2);
    expect(h.hintsUnlocked('w1-01')).toBe(false);
    h.recordFail('w1-01');
    expect(h.hintsUnlocked('w1-01')).toBe(true);
    expect(h.solutionUnlocked('w1-01')).toBe(false);
    failTimes(h, 'w1-01', 2);
    expect(h.solutionUnlocked('w1-01')).toBe(true);
    // Counters are per level.
    expect(h.get('w1-02').fails).toBe(0);
  });

  it('refuses the solution while locked', () => {
    const h = new HelpTracker(new SaveGame(createMemoryStore()));
    failTimes(h, 'a', SOLUTION_FAILS - 1);
    expect(h.watchSolution('a')).toBe(false);
    expect(h.get('a').watched).toBe(false);
  });

  it('marks a win after watching the solution "with help", a later clean win upgrades it', () => {
    const h = new HelpTracker(new SaveGame(createMemoryStore()));
    failTimes(h, 'a', SOLUTION_FAILS);
    expect(h.watchSolution('a')).toBe(true);
    expect(h.recordWin('a')).toBe('withHelp');
    expect(h.get('a')).toMatchObject({ solved: 'withHelp', watched: false });
    expect(h.recordWin('a')).toBe('clean');
  });

  it('keeps a clean solve clean even after watching the solution later', () => {
    const h = new HelpTracker(new SaveGame(createMemoryStore()));
    expect(h.recordWin('a')).toBe('clean');
    failTimes(h, 'a', SOLUTION_FAILS);
    h.watchSolution('a');
    expect(h.recordWin('a')).toBe('clean');
  });

  it('persists in the save game', () => {
    const store = createMemoryStore();
    const h = new HelpTracker(new SaveGame(store));
    failTimes(h, 'w2-03', 4);
    expect(h.recordWin('w2-03', 2)).toBe('clean');
    expect(new HelpTracker(new SaveGame(store)).get('w2-03')).toMatchObject({ fails: 4, stars: 2 });
  });
});

describe('generated solution hint', () => {
  const solution = (log: Solution['log']): Solution => ({ log, releaseChanges: [], finalHash: 0 });

  it('lists the handed-out skills in skill-bar order', () => {
    const s = solution([
      { kind: 'assign', tick: 5, creature: 0, skill: 'delver' },
      { kind: 'assign', tick: 9, creature: 1, skill: 'scaler' },
      { kind: 'assign', tick: 12, creature: 0, skill: 'delver' },
      { kind: 'popAll', tick: 40 },
    ]);
    expect(solutionSkills(s)).toEqual({
      skills: [
        ['scaler', 1],
        ['delver', 2],
      ],
      popAll: true,
    });
    setLanguage('en');
    expect(solutionHint(s)).toBe(
      'The solution hands out: 1× Scaler, 2× Delver – and pops everyone at the end.',
    );
    expect(solutionHint(solution([]))).toMatch(/no skills/);
    setLanguage('hu');
    expect(solutionHint(solution([{ kind: 'assign', tick: 1, creature: 0, skill: 'mason' }]))).toBe(
      'A megoldás ezeket osztja ki: 1× Kőműves.',
    );
    setLanguage('en');
  });
});
