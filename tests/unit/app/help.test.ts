import { describe, expect, it } from 'vitest';
import { HELP_KEY, HINT_FAILS, HelpTracker, SOLUTION_FAILS } from '../../../src/app/help';
import { createMemoryStore } from '../../../src/platform/storage';

describe('HelpTracker', () => {
  it('unlocks the hints after 3 fails and the solution after 5', () => {
    const h = new HelpTracker(createMemoryStore());
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
    const h = new HelpTracker(createMemoryStore());
    expect(h.watchSolution('a')).toBe(false);
    for (let i = 0; i < SOLUTION_FAILS; i++) h.recordFail('a');
    expect(h.watchSolution('a')).toBe(true);
  });

  it('marks a win after watching as solved with help; a clean win clears it', () => {
    const h = new HelpTracker(createMemoryStore());
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
    const h = new HelpTracker(createMemoryStore());
    expect(h.recordWin('b')).toMatchObject({ solved: true, withHelp: false });
  });

  it('persists across instances and survives corrupt data', () => {
    const store = createMemoryStore();
    const a = new HelpTracker(store);
    a.recordFail('x');
    a.recordFail('x');
    expect(new HelpTracker(store).view('x').fails).toBe(2);
    store.set(HELP_KEY, '{not json');
    expect(new HelpTracker(store).view('x').fails).toBe(0);
    store.set(HELP_KEY, JSON.stringify({ x: { fails: -4, solved: 'yes' }, y: 7 }));
    expect(new HelpTracker(store).record('x')).toEqual({
      fails: 0,
      watched: false,
      solved: false,
      clean: false,
    });
  });
});
