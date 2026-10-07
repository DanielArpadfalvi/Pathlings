import type { LevelDef, ThemeId } from '../core/level';
import { validateLevel } from '../core/level';
import { runSolution } from '../core/replay';
import { rateRun } from '../core/stars';

/**
 * Rules for the built-in levels (T5.1), shared by `scripts/validate-levels` (CI) and unit tests:
 * valid definition, id from the file path, world theme and difficulty range, translated title
 * and hints, and a reference solution that replays to its recorded hash and earns all three
 * stars (so every star is reachable).
 */

export type WorldId = 'w1' | 'w2' | 'w3' | 'w4' | 'bonus';

export interface WorldSpec {
  id: WorldId;
  /** null: any theme (bonus pool). */
  theme: ThemeId | null;
  difficulty: [number, number];
  /** Planned number of levels (§1.3). */
  count: number;
}

export const WORLDS: readonly WorldSpec[] = [
  { id: 'w1', theme: 'glade', difficulty: [1, 6], count: 20 },
  { id: 'w2', theme: 'deep', difficulty: [3, 8], count: 20 },
  { id: 'w3', theme: 'clockworks', difficulty: [5, 9], count: 20 },
  { id: 'w4', theme: 'skyreach', difficulty: [7, 10], count: 20 },
  { id: 'bonus', theme: null, difficulty: [1, 10], count: 30 },
];

export function levelId(world: WorldId, index: number): string {
  return `${world}-${String(index).padStart(2, '0')}`;
}

/** i18n keys of a built-in level's title and hints. */
export function levelKeys(id: string): { title: string; hints: [string, string] } {
  return { title: `level.${id}.title`, hints: [`level.${id}.hint1`, `level.${id}.hint2`] };
}

export interface BuiltInCheck {
  id: string;
  problems: string[];
  saved: number;
  assignments: number;
  stars: number;
}

/**
 * Checks one built-in level. `dictionaries` are the UI languages (every title / hint key must
 * exist in each).
 */
export function checkBuiltIn(
  level: LevelDef,
  world: WorldId,
  index: number,
  dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>>,
): BuiltInCheck {
  const id = levelId(world, index);
  const problems: string[] = [];
  const spec = WORLDS.find((w) => w.id === world);
  if (!spec) problems.push(`unknown world ${world}`);
  if (level.id !== id) problems.push(`id must be "${id}" (got "${level.id}")`);
  for (const e of validateLevel(level)) problems.push(`invalid: ${e.path}: ${e.message}`);
  if (spec?.theme && level.theme !== spec.theme) {
    problems.push(`theme must be ${spec.theme} in ${world}`);
  }
  const d = level.difficulty;
  if (d === undefined) problems.push('difficulty tag missing');
  else if (spec && (d < spec.difficulty[0] || d > spec.difficulty[1])) {
    problems.push(`difficulty ${d} outside ${spec.difficulty[0]}–${spec.difficulty[1]}`);
  }
  const keys = levelKeys(id);
  if (level.titleKey !== keys.title) problems.push(`titleKey must be "${keys.title}"`);
  const hintKeys = level.hintKeys ?? [];
  hintKeys.forEach((k, i) => {
    if (k !== keys.hints[i]) problems.push(`hintKeys[${i}] must be "${keys.hints[i]}"`);
  });
  for (const [lang, dict] of Object.entries(dictionaries)) {
    for (const k of [level.titleKey ?? keys.title, ...hintKeys]) {
      if (!dict[k]?.trim()) problems.push(`missing ${lang} text for ${k}`);
    }
  }

  let saved = 0;
  let assignments = 0;
  let stars = 0;
  if (!level.solution) problems.push('reference solution missing');
  else if (problems.every((p) => !p.startsWith('invalid'))) {
    const r = runSolution(level);
    saved = r.saved;
    assignments = r.assignments;
    stars = rateRun(level, r.saved, r.assignments).count;
    if (r.rejected > 0) problems.push(`${r.rejected} solution command(s) rejected`);
    if (!r.won) problems.push(`solution saves ${r.saved}/${level.required}`);
    if (!r.hashMatches) {
      problems.push(
        `solution hash drifted: ${r.hash.toString(16)} ≠ ${level.solution.finalHash.toString(16)}`,
      );
    }
    if (r.won && stars < 3) {
      problems.push(
        `reference solution earns ${stars}★ (master ${level.master}, frugal ${level.frugal})`,
      );
    }
  }
  return { id, problems, saved, assignments, stars };
}
