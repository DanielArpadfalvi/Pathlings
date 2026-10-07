import type { KeyValueStore } from '../platform/storage';

/**
 * Help that is free and never runs out (§1.4, T5.7): a level's hints unlock after
 * `HINT_FAILS` failed attempts, watching the reference solution after `SOLUTION_FAILS`. A level
 * won only after watching its solution is marked "solved with help"; a later win without
 * watching first clears the mark. (The save system of T6.3 takes these records over.)
 */

export const HINT_FAILS = 3;
export const SOLUTION_FAILS = 5;
export const HELP_KEY = 'pathlings.help.v1';

export interface HelpRecord {
  fails: number;
  /** The solution was watched since the last win. */
  watched: boolean;
  solved: boolean;
  /** Won at least once without watching the solution first. */
  clean: boolean;
}

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

const EMPTY: HelpRecord = { fails: 0, watched: false, solved: false, clean: false };

function sanitize(v: unknown): HelpRecord | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const fails = typeof r.fails === 'number' && r.fails >= 0 ? Math.floor(r.fails) : 0;
  return {
    fails,
    watched: r.watched === true,
    solved: r.solved === true,
    clean: r.clean === true,
  };
}

export function helpView(r: HelpRecord): HelpView {
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

export class HelpTracker {
  private records: Record<string, HelpRecord> = {};

  constructor(private readonly store: KeyValueStore) {
    try {
      const raw = JSON.parse(store.get(HELP_KEY) ?? '{}') as unknown;
      if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) {
          const r = sanitize(v);
          if (r) this.records[k] = r;
        }
      }
    } catch {
      this.records = {};
    }
  }

  record(key: string): HelpRecord {
    return { ...(this.records[key] ?? EMPTY) };
  }

  view(key: string): HelpView {
    return helpView(this.record(key));
  }

  recordFail(key: string): HelpView {
    const r = this.record(key);
    r.fails++;
    return this.put(key, r);
  }

  /** Watching is only allowed once the solution is unlocked; returns whether it was. */
  watchSolution(key: string): boolean {
    const r = this.record(key);
    if (r.fails < SOLUTION_FAILS) return false;
    r.watched = true;
    this.put(key, r);
    return true;
  }

  recordWin(key: string): HelpView {
    const r = this.record(key);
    r.solved = true;
    if (!r.watched) r.clean = true;
    r.watched = false;
    return this.put(key, r);
  }

  private put(key: string, r: HelpRecord): HelpView {
    this.records[key] = r;
    this.store.set(HELP_KEY, JSON.stringify(this.records));
    return helpView(r);
  }
}
