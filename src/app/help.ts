import type { LevelProgress, SaveManager } from './save';

/**
 * Help that is free and never runs out (§1.4, T5.7): a level's hints unlock after
 * `HINT_FAILS` failed attempts, watching the reference solution after `SOLUTION_FAILS`. A level
 * won only after watching its solution is marked "solved with help"; a later win without
 * watching first clears the mark. Stored per level in the save (T6.3).
 */

export const HINT_FAILS = 3;
export const SOLUTION_FAILS = 5;
export interface HelpView {
  fails: number;
  hintsUnlocked: boolean;
  solutionUnlocked: boolean;
  solved: boolean;
  withHelp: boolean;
  /** Attempts still needed to unlock the hints / the solution (0 once unlocked). */
  failsToHints: number;
  failsToSolution: number;
}

export function helpView(r: LevelProgress): HelpView {
  return {
    fails: r.fails,
    hintsUnlocked: r.fails >= HINT_FAILS,
    solutionUnlocked: r.fails >= SOLUTION_FAILS,
    solved: r.solved,
    withHelp: r.solved && !r.clean,
    failsToHints: Math.max(0, HINT_FAILS - r.fails),
    failsToSolution: Math.max(0, SOLUTION_FAILS - r.fails),
  };
}

/** Fail / win bookkeeping of the levels, stored in the save (`SaveManager`). */
export class HelpTracker {
  constructor(private readonly save: SaveManager) {}

  view(key: string): HelpView {
    return helpView(this.save.level(key));
  }

  recordFail(key: string): HelpView {
    const r = this.save.level(key);
    r.fails++;
    return this.put(key, r);
  }

  /** Watching is only allowed once the solution is unlocked; returns whether it was. */
  watchSolution(key: string): boolean {
    const r = this.save.level(key);
    if (r.fails < SOLUTION_FAILS) return false;
    r.watched = true;
    this.put(key, r);
    return true;
  }

  /** A won run: keeps the best stars and result. */
  recordWin(key: string, stars = 1, saved = 0): HelpView {
    const r = this.save.level(key);
    r.solved = true;
    r.stars = Math.max(r.stars, Math.min(3, stars));
    r.bestSaved = Math.max(r.bestSaved, saved);
    if (!r.watched) r.clean = true;
    r.watched = false;
    return this.put(key, r);
  }

  private put(key: string, r: LevelProgress): HelpView {
    this.save.setLevel(key, r);
    return helpView(r);
  }
}
