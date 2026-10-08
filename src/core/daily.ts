import {
  type LevelDef,
  MIN_TIME_LIMIT_TICKS,
  SKILLS,
  type SkillId,
  type Solution,
  TICKS_PER_SECOND,
  isSkillId,
} from './level';
import { createRng, randInt, shuffle } from './rng';

/**
 * Daily level (§1.2, T5.6): every UTC day picks one level of the bonus pool plus one modifier.
 * The pick is a pure function of the date, so it is identical on every platform and needs no
 * server. Within each block of `pool` days every bonus level comes up exactly once (a seeded
 * shuffle per block, never repeating the previous block's last level on the first day); the
 * modifier is drawn from the level's own validated variants. Integer-only, no clock access – the
 * caller passes the UTC date.
 */

/** −1 of one skill, −60 s on the clock, or one more Pathling to bring home. */
export type DailyModifier =
  { kind: 'fewer'; skill: SkillId } | { kind: 'shorter' } | { kind: 'more' };

/** A modifier a bonus level supports, with the reference solution that proves it solvable. */
export interface DailyVariant {
  mod: DailyModifier;
  solution: Solution;
}

/** Seconds the "shorter" modifier takes off the time limit. */
export const DAILY_SHORTER_SECONDS = 60;

export function modifierKey(mod: DailyModifier): string {
  return mod.kind === 'fewer' ? `fewer-${mod.skill}` : mod.kind;
}

export function isDailyModifier(value: unknown): value is DailyModifier {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as { kind?: unknown; skill?: unknown };
  if (m.kind === 'shorter' || m.kind === 'more') return true;
  return m.kind === 'fewer' && isSkillId(m.skill);
}

/** Why `mod` cannot apply to `level` (null when it can). */
export function modifierProblem(level: LevelDef, mod: DailyModifier): string | null {
  switch (mod.kind) {
    case 'fewer':
      return level.skills[mod.skill] > 0 ? null : `no ${mod.skill} to take away`;
    case 'shorter':
      return level.timeLimitTicks - DAILY_SHORTER_SECONDS * TICKS_PER_SECOND >= MIN_TIME_LIMIT_TICKS
        ? null
        : 'time limit too short';
    case 'more':
      return level.required < level.creatures ? null : 'already every Pathling is required';
  }
}

/** Every modifier that can apply to `level`, in a stable order (skills in skill-bar order). */
export function candidateModifiers(level: LevelDef): DailyModifier[] {
  const all: DailyModifier[] = [
    ...SKILLS.map((skill): DailyModifier => ({ kind: 'fewer', skill })),
    { kind: 'shorter' },
    { kind: 'more' },
  ];
  return all.filter((m) => modifierProblem(level, m) === null);
}

/**
 * The level as played on the day: the modifier applied, the variant's solution attached (when
 * given) and the star thresholds kept consistent (★★ never below ★).
 */
export function applyModifier(level: LevelDef, mod: DailyModifier, solution?: Solution): LevelDef {
  const problem = modifierProblem(level, mod);
  if (problem) throw new RangeError(`daily modifier ${modifierKey(mod)}: ${problem}`);
  const out: LevelDef = { ...level, skills: { ...level.skills } };
  if (mod.kind === 'fewer') out.skills[mod.skill] -= 1;
  else if (mod.kind === 'shorter') {
    out.timeLimitTicks -= DAILY_SHORTER_SECONDS * TICKS_PER_SECOND;
  } else {
    out.required += 1;
    out.master = Math.max(out.master, out.required);
  }
  if (solution) out.solution = solution;
  else delete out.solution;
  return out;
}

// --- Dates ------------------------------------------------------------------------------------

/** Days since 1970-01-01 of a proleptic Gregorian date (Howard Hinnant's days_from_civil). */
export function epochDay(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** `YYYY-MM-DD` of an epoch day (inverse of `epochDay`). */
export function dayLabel(day: number): string {
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

/** Epoch day of a `YYYY-MM-DD` label; null when malformed or not a real date. */
export function parseDayLabel(label: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (!m) return null;
  const day = epochDay(Number(m[1]), Number(m[2]), Number(m[3]));
  return dayLabel(day) === label ? day : null;
}

// --- The pick ---------------------------------------------------------------------------------

export interface DailyPick {
  day: number;
  /** Index into the bonus pool. */
  level: number;
  /** Index into that level's variants. */
  variant: number;
}

function blockOrder(block: number, pool: number): number[] {
  const ids = Array.from({ length: pool }, (_, i) => i);
  return shuffle(createRng(`pathlings-daily-block:${block}`), ids);
}

/**
 * Level of `day` for a pool of `pool` levels: a fresh permutation every `pool` days. If the
 * permutation would start with the previous block's last level, the first two swap (the last
 * position never moves, so the previous block's last level is its raw permutation's last).
 */
function levelOfDay(day: number, pool: number): number {
  const block = Math.floor(day / pool);
  const order = blockOrder(block, pool);
  if (pool > 2) {
    const prevLast = blockOrder(block - 1, pool)[pool - 1] as number;
    if (order[0] === prevLast) [order[0], order[1]] = [order[1] as number, prevLast];
  }
  return order[day - block * pool] as number;
}

/**
 * Today's level and modifier. `variantCounts[i]` is the number of validated variants of bonus
 * level i (each ≥ 1).
 */
export function dailyPick(day: number, variantCounts: readonly number[]): DailyPick {
  const pool = variantCounts.length;
  if (pool === 0) throw new RangeError('dailyPick: empty pool');
  if (!Number.isInteger(day)) throw new RangeError(`dailyPick: invalid day ${day}`);
  const level = levelOfDay(day, pool);
  const count = variantCounts[level] as number;
  if (!(count >= 1)) throw new RangeError(`dailyPick: level ${level} has no variants`);
  const variant = randInt(createRng(`pathlings-daily-mod:${day}`), count);
  return { day, level, variant };
}
