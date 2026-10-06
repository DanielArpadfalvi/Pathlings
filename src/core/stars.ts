import type { LevelDef } from './level';

/**
 * Level rating (§1.1 "Cél"): ★ = at least `required` saved, ★★ = at least `master` saved,
 * ★★★ = won with at most `frugal` skill assignments. Stars are recognition only, they gate
 * nothing. Pure; computed from the end state of a run.
 */
export interface StarResult {
  won: boolean;
  master: boolean;
  frugal: boolean;
  /** 0 when lost, otherwise 1 + master + frugal. */
  count: number;
}

export function rateRun(level: LevelDef, saved: number, assignments: number): StarResult {
  const won = saved >= level.required;
  const master = won && saved >= level.master;
  const frugal = won && assignments <= level.frugal;
  return { won, master, frugal, count: won ? 1 + (master ? 1 : 0) + (frugal ? 1 : 0) : 0 };
}
