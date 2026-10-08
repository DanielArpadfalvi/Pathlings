import { SKILLS, type SkillId, type Solution } from '../core/level';
import type { KeyValueStore } from '../platform/storage';

/**
 * Help that never costs anything (§1.3, T5.7): a level's hints unlock after `HINT_FAILS` failed
 * tries and its solution replay after `SOLUTION_FAILS`. Winning after watching the solution
 * marks the level "solved with help"; a later win without watching it again (or an earlier clean
 * one) makes it a clean solve. Per level
 * (keyed by `helpKey`), persisted as one JSON record; a damaged record reads as empty.
 */

export const HINT_FAILS = 3;
export const SOLUTION_FAILS = 5;
export const HELP_STORAGE_KEY = 'pathlings.help.v1';

export interface LevelHelp {
  fails: number;
  /** The solution replay was watched since the last win. */
  watched: boolean;
  solved: 'no' | 'withHelp' | 'clean';
}

const EMPTY: LevelHelp = { fails: 0, watched: false, solved: 'no' };

function sanitize(v: unknown): LevelHelp | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Partial<LevelHelp>;
  const fails = Number.isInteger(r.fails) && (r.fails as number) >= 0 ? (r.fails as number) : 0;
  const solved = r.solved === 'withHelp' || r.solved === 'clean' ? r.solved : 'no';
  return { fails, watched: r.watched === true, solved };
}

export class HelpTracker {
  private records: Record<string, LevelHelp>;

  constructor(private readonly store: KeyValueStore) {
    this.records = {};
    try {
      const raw = JSON.parse(store.get(HELP_STORAGE_KEY) ?? '{}') as unknown;
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw)) {
          const r = sanitize(v);
          if (r) this.records[k] = r;
        }
      }
    } catch {
      this.records = {};
    }
  }

  get(key: string): LevelHelp {
    return { ...(this.records[key] ?? EMPTY) };
  }

  hintsUnlocked(key: string): boolean {
    return this.get(key).fails >= HINT_FAILS;
  }

  solutionUnlocked(key: string): boolean {
    return this.get(key).fails >= SOLUTION_FAILS;
  }

  recordFail(key: string): LevelHelp {
    const r = this.get(key);
    return this.put(key, { ...r, fails: r.fails + 1 });
  }

  /** The player opened the solution replay (only allowed once it is unlocked). */
  watchSolution(key: string): boolean {
    if (!this.solutionUnlocked(key)) return false;
    this.put(key, { ...this.get(key), watched: true });
    return true;
  }

  /** A won run; returns the level's resulting mark. */
  recordWin(key: string): LevelHelp['solved'] {
    const r = this.get(key);
    const solved = r.solved === 'clean' || !r.watched ? 'clean' : 'withHelp';
    this.put(key, { ...r, watched: false, solved });
    return solved;
  }

  private put(key: string, r: LevelHelp): LevelHelp {
    this.records[key] = r;
    this.store.set(HELP_STORAGE_KEY, JSON.stringify(this.records));
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
