import { type DailyModifier, type DailyVariant, applyModifier, dailyPick } from '../core/daily';
import type { LevelDef } from '../core/level';
import { BUILTIN_LEVELS, DAILY_VARIANTS } from '../levels/catalog';
import { type TranslationKey, t } from '../i18n';

/**
 * Today's daily level (T5.6): the UTC date picks a bonus level and one of its pre-validated
 * modifiers (`core/daily.ts`). The playable level carries the variant's verified solution.
 */

export interface DailyLevel {
  date: string;
  /** The unmodified bonus level. */
  base: LevelDef;
  modifier: DailyModifier;
  /** The level as played today (modifier applied, variant solution attached). */
  level: LevelDef;
}

/** UTC calendar date `YYYY-MM-DD` of a timestamp. */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function dailyLevel(
  date: string,
  pool: readonly LevelDef[] = BUILTIN_LEVELS.bonus,
  variants: Readonly<Record<string, readonly DailyVariant[]>> = DAILY_VARIANTS,
): DailyLevel | null {
  const usable = pool.filter((l) => (variants[l.id]?.length ?? 0) > 0);
  if (usable.length === 0) return null;
  const pick = dailyPick(
    date,
    usable.map((l) => variants[l.id]?.length ?? 0),
  );
  const base = usable[pick.level] as LevelDef;
  const variant = (variants[base.id] as readonly DailyVariant[])[pick.variant] as DailyVariant;
  const level = { ...applyModifier(base, variant.modifier), solution: variant.solution };
  return { date, base, modifier: variant.modifier, level };
}

/** Short player-facing text of a modifier, e.g. "−1 Mason". */
export function modifierText(mod: DailyModifier): string {
  switch (mod.kind) {
    case 'skillMinus':
      return t('daily.mod.skillMinus', { skill: t(`skill.${mod.skill}` as TranslationKey) });
    case 'timeMinus':
      return t('daily.mod.timeMinus', { seconds: mod.seconds });
    case 'requiredPlus':
      return t('daily.mod.requiredPlus');
  }
}
