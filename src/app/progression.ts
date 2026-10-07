import type { LevelDef } from '../core/level';
import type { WorldId } from '../levels/validate';

/**
 * Campaign progression (§1.4, §2, T6.1), pure:
 * - within a world, the first `OPEN_AHEAD` unsolved levels are always open (stuck on one, you
 *   can move on);
 * - a world's last level opens once `LAST_LEVEL_GATE` of its levels are solved;
 * - the next world opens when the previous world's last level is solved;
 * - the free part is world 1 and world 2 levels 1–10 (plus today's daily level, every editor tool
 *   and every code); everything else needs the full-game unlock and shows a lock with the price
 *   from the start. The bonus pool (archive) needs the unlock but no progression.
 */

export const OPEN_AHEAD = 3;
export const LAST_LEVEL_GATE = 17;
export const CAMPAIGN: readonly WorldId[] = ['w1', 'w2', 'w3', 'w4'];
/** Levels of world 2 that are free (1-based, inclusive). */
export const FREE_W2_LEVELS = 10;

export type LevelState = 'solved' | 'open' | 'locked' | 'paid';

export function isFreeLevel(id: string): boolean {
  const m = /^(w[1-4]|bonus)-(\d\d)$/.exec(id);
  if (!m) return true; // test / community levels
  if (m[1] === 'w1') return true;
  if (m[1] === 'w2') return Number(m[2]) <= FREE_W2_LEVELS;
  return false;
}

/** Progression state of a world's levels (without the paid lock). */
export function progressionStates(
  ids: readonly string[],
  solved: (id: string) => boolean,
  worldOpen: boolean,
): Exclude<LevelState, 'paid'>[] {
  if (!worldOpen) return ids.map(() => 'locked');
  const solvedCount = ids.filter(solved).length;
  let openLeft = OPEN_AHEAD;
  return ids.map((id, i) => {
    if (solved(id)) return 'solved';
    const last = i === ids.length - 1 && ids.length > LAST_LEVEL_GATE;
    if (last && solvedCount < LAST_LEVEL_GATE) return 'locked';
    if (openLeft > 0) {
      openLeft--;
      return 'open';
    }
    return 'locked';
  });
}

export interface WorldsInput {
  levels: Readonly<Record<WorldId, readonly LevelDef[]>>;
  solved: (id: string) => boolean;
  fullGame: boolean;
}

/** Whether a campaign world is reachable by progression (paid locks aside). */
export function worldOpen(world: WorldId, input: WorldsInput): boolean {
  if (world === 'bonus') return true;
  const i = CAMPAIGN.indexOf(world);
  if (i <= 0) return true;
  const prev = input.levels[CAMPAIGN[i - 1] as WorldId];
  const last = prev[prev.length - 1];
  return last !== undefined && input.solved(last.id);
}

/** Final state of each level of a world, paid lock included. */
export function levelStates(world: WorldId, input: WorldsInput): LevelState[] {
  const ids = input.levels[world].map((l) => l.id);
  const base: LevelState[] =
    world === 'bonus'
      ? ids.map((id) => (input.solved(id) ? 'solved' : 'open'))
      : progressionStates(ids, input.solved, worldOpen(world, input));
  return base.map((s, i) =>
    !input.fullGame && !isFreeLevel(ids[i] as string) && s !== 'solved' ? 'paid' : s,
  );
}

/** Whether the player may start the level now. */
export function canPlay(id: string, input: WorldsInput): boolean {
  for (const [world, list] of Object.entries(input.levels) as [WorldId, readonly LevelDef[]][]) {
    const i = list.findIndex((l) => l.id === id);
    if (i < 0) continue;
    const s = levelStates(world, input)[i];
    return s === 'open' || s === 'solved';
  }
  return isFreeLevel(id);
}
