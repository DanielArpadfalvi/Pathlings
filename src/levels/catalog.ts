import type { DailyVariant } from '../core/daily';
import type { LevelDef } from '../core/level';
import { WORLDS, type WorldId } from './validate';

/**
 * The built-in levels, bundled from `src/levels/<world>/NN.json` (validated in CI by
 * `scripts/validate-levels`). Authoring-only fields (`plan`) are stripped; the daily-level variants
 * of the bonus pool are kept apart in `DAILY_VARIANTS`.
 */

type LevelFile = LevelDef & { plan?: unknown; daily?: DailyVariant[] };

const files = import.meta.glob<{ default: LevelFile }>('./*/[0-9][0-9].json', {
  eager: true,
});

const daily: Record<string, readonly DailyVariant[]> = {};

function strip(def: LevelFile): LevelDef {
  const level = { ...def };
  if (level.daily) daily[level.id] = level.daily;
  delete level.plan;
  delete level.daily;
  return level;
}

function load(): Record<WorldId, LevelDef[]> {
  const out = Object.fromEntries(WORLDS.map((w) => [w.id, [] as LevelDef[]])) as Record<
    WorldId,
    LevelDef[]
  >;
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  for (const [path, mod] of entries) {
    const m = /^\.\/(\w+)\/(\d\d)\.json$/.exec(path);
    if (!m) continue;
    const world = m[1] as WorldId;
    if (out[world]) out[world].push(strip(mod.default));
  }
  return out;
}

export const BUILTIN_LEVELS: Readonly<Record<WorldId, readonly LevelDef[]>> = load();

/** Daily-level variants (modifier + verified solution) of each bonus level, by level id. */
export const DAILY_VARIANTS: Readonly<Record<string, readonly DailyVariant[]>> = daily;

export function builtInLevel(id: string): LevelDef | undefined {
  for (const list of Object.values(BUILTIN_LEVELS)) {
    const l = list.find((x) => x.id === id);
    if (l) return l;
  }
  return undefined;
}
