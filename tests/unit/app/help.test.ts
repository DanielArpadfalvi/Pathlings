import { describe, expect, it } from 'vitest';
import { HINT_FAILS, HelpTracker, SOLUTION_FAILS } from '../../../src/app/help';
import { SaveManager } from '../../../src/app/save';
import { createMemoryStore } from '../../../src/platform/storage';

const tracker = (): HelpTracker => new HelpTracker(new SaveManager(createMemoryStore()));

describe('HelpTracker', () => {
  it('unlocks the hints after 3 fails and the solution after 5', () => {
    const h = tracker();
    expect(h.view('w1-01')).toMatchObject({
      fails: 0,
      hintsUnlocked: false,
      solutionUnlocked: false,
      failsToHints: 3,
      failsToSolution: 5,
    });
    for (let i = 1; i < HINT_FAILS; i++) expect(h.recordFail('w1-01').hintsUnlocked).toBe(false);
    expect(h.recordFail('w1-01')).toMatchObject({ hintsUnlocked: true, failsToHints: 0 });
    expect(h.view('w1-01').solutionUnlocked).toBe(false);
    for (let i = HINT_FAILS; i < SOLUTION_FAILS - 1; i++) h.recordFail('w1-01');
    expect(h.view('w1-01')).toMatchObject({ solutionUnlocked: false, failsToSolution: 1 });
    expect(h.recordFail('w1-01').solutionUnlocked).toBe(true);
    // Counters are per level.
    expect(h.view('w1-02').fails).toBe(0);
  });

  it('only lets an unlocked solution be watched', () => {
    const h = tracker();
    expect(h.watchSolution('a')).toBe(false);
    for (let i = 0; i < SOLUTION_FAILS; i++) h.recordFail('a');
    expect(h.watchSolution('a')).toBe(true);
  });

  it('marks a win after watching as solved with help; a clean win clears it', () => {
    const h = tracker();
    for (let i = 0; i < SOLUTION_FAILS; i++) h.recordFail('a');
    h.watchSolution('a');
    expect(h.recordWin('a')).toMatchObject({ solved: true, withHelp: true });
    // Hints and solution stay unlocked after the win.
    expect(h.view('a')).toMatchObject({ hintsUnlocked: true, solutionUnlocked: true });
    expect(h.recordWin('a')).toMatchObject({ solved: true, withHelp: false });
    // Watching again after a clean win does not take the clean solve away.
    h.watchSolution('a');
    expect(h.recordWin('a').withHelp).toBe(false);
  });

  it('a clean first win is never "with help"', () => {
    const h = tracker();
    expect(h.recordWin('b')).toMatchObject({ solved: true, withHelp: false });
  });

  it('keeps the best stars and result, and persists through the save', () => {
    const store = createMemoryStore();
    const h = new HelpTracker(new SaveManager(store));
    h.recordFail('x');
    h.recordWin('x', 2, 8);
    h.recordWin('x', 1, 9);
    const again = new SaveManager(store);
    expect(again.level('x')).toMatchObject({ fails: 1, stars: 2, bestSaved: 9, solved: true });
  });
});
