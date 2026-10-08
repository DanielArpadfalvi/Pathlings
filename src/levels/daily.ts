import {
  type DailyModifier,
  type DailyVariant,
  applyModifier,
  dailyPick,
  dayLabel,
} from '../core/daily';
import type { LevelDef } from '../core/level';

/**
 * Today's daily level (T5.6) from the bundled bonus pool: the pure pick from `core/daily` turned
 * into a playable level (modifier applied, the variant's solution attached for the solution
 * viewer). The caller supplies the UTC epoch day.
 */
export interface DailyLevel {
  day: number;
  /** `YYYY-MM-DD` (UTC). */
  label: string;
  /** The bonus level as authored (for its title and number). */
  base: LevelDef;
  mod: DailyModifier;
  /** The level as played today. */
  level: LevelDef;
}

export function dailyLevel(
  day: number,
  pool: readonly LevelDef[],
  variants: readonly (readonly DailyVariant[])[],
): DailyLevel | null {
  if (pool.length === 0 || variants.length !== pool.length) return null;
  if (variants.some((v) => v.length === 0)) return null;
  const pick = dailyPick(
    day,
    variants.map((v) => v.length),
  );
  const base = pool[pick.level] as LevelDef;
  const variant = (variants[pick.level] as readonly DailyVariant[])[pick.variant] as DailyVariant;
  return {
    day,
    label: dayLabel(day),
    base,
    mod: variant.mod,
    level: applyModifier(base, variant.mod, variant.solution),
  };
}
