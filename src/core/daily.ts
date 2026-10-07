import type { LevelDef, SkillId } from './level';
import { SKILLS } from './level';
import { createRng, randInt, shuffle } from './rng';

/**
 * Daily level (§1.3, T5.6): every UTC date picks one level of the bonus pool and one modifier
 * that makes it a little harder. The pick depends only on the date string and the pool, so it is
 * identical on every platform. Within each block of `poolSize` consecutive days every bonus level
 * appears exactly once (a seeded shuffle per block); the modifier is drawn from the level's
 * pre-validated list (`DailyVariant`s, each with its own verified solution).
 */

export type DailyModifier =
  | { kind: 'skillMinus'; skill: SkillId }
  | { kind: 'timeMinus'; seconds: number }
  | { kind: 'requiredPlus' };

/** A modifier the bonus level ships with, plus the reference solution that wins with it. */
export interface DailyVariant {
  modifier: DailyModifier;
  solution: NonNullable<LevelDef['solution']>;
}

export const DAILY_TIME_CUT_SECONDS = 60;

/** Candidate modifiers of a level, in a fixed order (the author script keeps the winnable ones). */
export function candidateModifiers(level: LevelDef): DailyModifier[] {
  const out: DailyModifier[] = [];
  for (const skill of SKILLS) {
    if (level.skills[skill] > 0) out.push({ kind: 'skillMinus', skill });
  }
  if (level.timeLimitTicks > (DAILY_TIME_CUT_SECONDS + 60) * 60) {
    out.push({ kind: 'timeMinus', seconds: DAILY_TIME_CUT_SECONDS });
  }
  if (level.required < level.creatures) out.push({ kind: 'requiredPlus' });
  return out;
}

/** The level with the modifier applied (new object; the solution is dropped). */
export function applyModifier(level: LevelDef, mod: DailyModifier): LevelDef {
  const out: LevelDef = { ...level, skills: { ...level.skills } };
  delete out.solution;
  switch (mod.kind) {
    case 'skillMinus':
      out.skills[mod.skill] = Math.max(0, out.skills[mod.skill] - 1);
      break;
    case 'timeMinus':
      out.timeLimitTicks = Math.max(60 * 60, level.timeLimitTicks - mod.seconds * 60);
      break;
    case 'requiredPlus':
      out.required = Math.min(level.creatures, level.required + 1);
      out.master = Math.max(out.master, out.required);
      break;
  }
  return out;
}

/** Stable text key of a modifier, e.g. `skillMinus:mason`. */
export function modifierKey(mod: DailyModifier): string {
  switch (mod.kind) {
    case 'skillMinus':
      return `skillMinus:${mod.skill}`;
    case 'timeMinus':
      return `timeMinus:${mod.seconds}`;
    case 'requiredPlus':
      return 'requiredPlus';
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Days since 1970-01-01 of a proleptic Gregorian `YYYY-MM-DD` date (integer-only "days from
 * civil" algorithm). Throws on a malformed or impossible date.
 */
export function dayNumber(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`dayNumber: bad date "${date}"`);
  const y0 = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const leap = (y0 % 4 === 0 && y0 % 100 !== 0) || y0 % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mo < 1 || mo > 12 || d < 1 || d > (lengths[mo - 1] as number)) {
    throw new RangeError(`dayNumber: bad date "${date}"`);
  }
  const y = mo <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** `YYYY-MM-DD` of a day number (inverse of `dayNumber`). */
export function dateOfDay(day: number): string {
  const z = day + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const pad = (n: number, w: number): string => String(n).padStart(w, '0');
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

export interface DailyPick {
  date: string;
  /** Index into the bonus pool. */
  level: number;
  /** Index into that level's variant list. */
  variant: number;
}

/**
 * The daily pick for `date` (UTC `YYYY-MM-DD`). `variantCounts[i]` is the number of variants of
 * pool level i (each ≥ 1).
 */
export function dailyPick(date: string, variantCounts: readonly number[]): DailyPick {
  const n = variantCounts.length;
  if (n === 0) throw new RangeError('dailyPick: empty pool');
  const day = dayNumber(date);
  const block = Math.floor(day / n);
  const order = shuffle(
    createRng(`pathlings-daily-block:${block}`),
    Array.from({ length: n }, (_, i) => i),
  );
  const level = order[day - block * n] as number;
  const count = variantCounts[level] as number;
  if (!(count >= 1)) throw new RangeError(`dailyPick: level ${level} has no variants`);
  const variant = randInt(createRng(`pathlings-daily:${date}`), count);
  return { date, level, variant };
}
