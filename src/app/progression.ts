import type { WorldId } from '../levels/validate';

/**
 * Campaign progression (§1.4, §2, T6.1), pure: inside a world there are always `OPEN_AHEAD`
 * unsolved levels open (in order, so a stuck player can move on); the world's last level opens
 * at `FINAL_GATE` solved levels, and the next world opens when the previous world's last level is
 * solved. Levels outside the free part (§2: world 1 + world 2 levels 1–10, plus today's daily
 * level) show as `paid` until the full game is unlocked – visible with a lock and price from the
 * first minute. The bonus pool is an archive of the full game, all open once bought.
 */

export const OPEN_AHEAD = 3;
export const FINAL_GATE = 17;
export const CAMPAIGN: readonly WorldId[] = ['w1', 'w2', 'w3', 'w4'];
/** Free levels per world (§2). */
export const FREE_LEVELS: Readonly<Record<WorldId, number>> = {
  w1: 20,
  w2: 10,
  w3: 0,
  w4: 0,
  bonus: 0,
};
/** Shown on locked levels until the store reports the localized price (T8.1). */
export const FULL_GAME_PRICE = '$2.99';

export type LevelAccess = 'solved' | 'open' | 'locked' | 'paid';

export interface LevelState {
  id: string;
  /** 1-based number within the world. */
  number: number;
  access: LevelAccess;
  stars: number;
}

export interface WorldState {
  id: WorldId;
  /** The world itself can be entered (its first levels are reachable). */
  open: boolean;
  /** Some of its levels need the full game. */
  paid: boolean;
  levels: LevelState[];
  solved: number;
  stars: number;
  maxStars: number;
}

export interface ProgressInput {
  /** Level ids per world, in order. */
  worlds: readonly { id: WorldId; levels: readonly string[] }[];
  /** Best stars of a level (0 = not solved). */
  stars: (id: string) => number;
  fullGame: boolean;
}

function campaignWorld(
  id: WorldId,
  ids: readonly string[],
  stars: (id: string) => number,
  reachable: boolean,
  fullGame: boolean,
): WorldState {
  const best = ids.map((l) => stars(l));
  const solved = best.filter((s) => s > 0).length;
  const free = fullGame ? ids.length : FREE_LEVELS[id];
  let ahead = OPEN_AHEAD;
  const levels = ids.map((lid, i): LevelState => {
    const s = best[i] as number;
    const last = i === ids.length - 1;
    let access: LevelAccess;
    if (i >= free) access = 'paid';
    else if (s > 0) access = 'solved';
    else if (!reachable) access = 'locked';
    else if (last) access = solved >= FINAL_GATE ? 'open' : 'locked';
    else if (ahead > 0) {
      access = 'open';
      ahead--;
    } else access = 'locked';
    return { id: lid, number: i + 1, access, stars: s };
  });
  return {
    id,
    open: reachable,
    paid: free < ids.length,
    levels,
    solved,
    stars: best.reduce((a, b) => a + b, 0),
    maxStars: ids.length * 3,
  };
}

/** Every world's state: the campaign chain plus the bonus archive. */
export function progressView(input: ProgressInput): WorldState[] {
  const out: WorldState[] = [];
  let reachable = true;
  for (const id of CAMPAIGN) {
    const w = input.worlds.find((x) => x.id === id);
    if (!w) continue;
    const state = campaignWorld(id, w.levels, input.stars, reachable, input.fullGame);
    out.push(state);
    const last = w.levels[w.levels.length - 1];
    reachable = last !== undefined && input.stars(last) > 0;
  }
  const bonus = input.worlds.find((x) => x.id === 'bonus');
  if (bonus) {
    const levels = bonus.levels.map((lid, i): LevelState => {
      const s = input.stars(lid);
      const access: LevelAccess = !input.fullGame ? 'paid' : s > 0 ? 'solved' : 'open';
      return { id: lid, number: i + 1, access, stars: s };
    });
    out.push({
      id: 'bonus',
      open: input.fullGame,
      paid: !input.fullGame,
      levels,
      solved: levels.filter((l) => l.stars > 0).length,
      stars: levels.reduce((a, l) => a + l.stars, 0),
      maxStars: levels.length * 3,
    });
  }
  return out;
}

export function canPlay(access: LevelAccess): boolean {
  return access === 'open' || access === 'solved';
}

/** Access of one level in a computed view (undefined: not a campaign / bonus level). */
export function accessOf(view: readonly WorldState[], id: string): LevelAccess | undefined {
  for (const w of view) {
    const l = w.levels.find((x) => x.id === id);
    if (l) return l.access;
  }
  return undefined;
}
