import { SKILLS, type SkillId, type Solution } from '../core/level';
import type { LevelRecord, SaveGame, SolvedMark } from './save';

/**
 * Help that never costs anything (§1.3, T5.7): a level's hints unlock after `HINT_FAILS` failed
 * tries and its solution replay after `SOLUTION_FAILS`. Winning after watching the solution
 * marks the level "solved with help"; a later win without watching it again (or an earlier clean
 * one) makes it a clean solve. Per level (keyed by `GameApp.helpKey`), stored in the save game.
 */

export const HINT_FAILS = 3;
export const SOLUTION_FAILS = 5;
export type { LevelRecord as LevelHelp } from './save';

/** Help state of each level lives in its save record (`SaveGame.level`). */
export class HelpTracker {
  constructor(private readonly save: SaveGame) {}

  get(key: string): LevelRecord {
    return this.save.level(key);
  }

  hintsUnlocked(key: string): boolean {
    return this.get(key).fails >= HINT_FAILS;
  }

  solutionUnlocked(key: string): boolean {
    return this.get(key).fails >= SOLUTION_FAILS;
  }

  recordFail(key: string): LevelRecord {
    const r = this.get(key);
    return this.put(key, { ...r, fails: r.fails + 1 });
  }

  /** The player opened the solution replay (only allowed once it is unlocked). */
  watchSolution(key: string): boolean {
    if (!this.solutionUnlocked(key)) return false;
    this.put(key, { ...this.get(key), watched: true });
    return true;
  }

  /** A won run with `stars`; returns the level's resulting mark. */
  recordWin(key: string, stars = 1): SolvedMark {
    const r = this.get(key);
    const solved = r.solved === 'clean' || !r.watched ? 'clean' : 'withHelp';
    this.put(key, { ...r, watched: false, solved, stars: Math.max(r.stars, Math.min(3, stars)) });
    return solved;
  }

  private put(key: string, r: LevelRecord): LevelRecord {
    this.save.setLevel(key, r);
    return { ...r };
  }
}

/**
 * The skills a reference solution hands out (skill-bar order, with counts) and whether it uses
 * pop-all: the generated last hint for levels with fewer than two written ones.
 */
export function solutionSkills(solution: Solution): {
  skills: [SkillId, number][];
  popAll: boolean;
} {
  const counts = new Map<SkillId, number>();
  let popAll = false;
  for (const c of solution.log) {
    if (c.kind === 'popAll') popAll = true;
    else counts.set(c.skill, (counts.get(c.skill) ?? 0) + 1);
  }
  return {
    skills: SKILLS.filter((s) => counts.has(s)).map((s) => [s, counts.get(s) as number]),
    popAll,
  };
}
