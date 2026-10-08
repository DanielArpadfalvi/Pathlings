import type { DailyVariant } from '../core/daily';
import type { LevelDef } from '../core/level';
import { WORLDS, type WorldId } from './validate';

/**
 * The built-in levels, bundled from `src/levels/<world>/NN.json` (validated in CI by
 * `scripts/validate-levels`). Authoring-only fields (`plan`) are stripped; the daily variants of
 * the bonus pool are kept apart in `BONUS_DAILY`.
 */

type LevelFile = LevelDef & { plan?: unknown; daily?: DailyVariant[] };

const files = import.meta.glob<{ default: LevelFile }>('./*/[0-9][0-9].json', {
  eager: true,
});

function strip(def: LevelFile): LevelDef {
  const level = { ...def };
  delete level.plan;
  delete level.daily;
  return level;
}

const bonusDaily: DailyVariant[][] = [];

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
    if (!out[world]) continue;
    out[world].push(strip(mod.default));
    if (world === 'bonus') bonusDaily.push(mod.default.daily ?? []);
  }
  return out;
}

export const BUILTIN_LEVELS: Readonly<Record<WorldId, readonly LevelDef[]>> = load();

/** Daily variants of each bonus level, in `BUILTIN_LEVELS.bonus` order. */
export const BONUS_DAILY: readonly (readonly DailyVariant[])[] = bonusDaily;

export function builtInLevel(id: string): LevelDef | undefined {
  for (const list of Object.values(BUILTIN_LEVELS)) {
    const l = list.find((x) => x.id === id);
    if (l) return l;
  }
  return undefined;
}
