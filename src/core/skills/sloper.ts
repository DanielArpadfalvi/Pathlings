/**
 * Sloper: digs diagonally down, 2 px forward for every 1 px down, one step per 6 ticks (12 in
 * rock). Every step clears the body box at the next position (1 px forward, and 1 px down on
 * every other step, starting with a down step). Stops at metal / a one-way wall facing the other
 * way; falls when it breaks through into air.
 */

import { CREATURE_H, CREATURE_HALF_W, CREATURE_W, type Creature, CreatureState } from '../creature';
import { carveRect, isSolid } from '../terrain';
import { type Sim, markDirty, startFall, startWalk } from '../world';
import { digDir, digTicks, hasUnremovable } from './dig';
import { canTakeGroundSkill } from './ground';

export const SLOPE_TICKS = 6;

export function canTakeSloper(c: Creature): boolean {
  return c.state !== CreatureState.Slope && canTakeGroundSkill(c);
}

export function startSloper(c: Creature): void {
  c.state = CreatureState.Slope;
  c.timer = 0;
  c.counter = 0;
}

export function updateSlope(sim: Sim, c: Creature): void {
  const t = sim.terrain;
  const nx = c.x + c.dir;
  const ny = c.y + (c.counter % 2 === 0 ? 1 : 0);
  const bx = nx - CREATURE_HALF_W;
  const by = ny - CREATURE_H;
  if (++c.timer < digTicks(t, SLOPE_TICKS, bx, by, CREATURE_W, CREATURE_H)) return;
  c.timer = 0;
  const dir = digDir(c.dir);
  if (hasUnremovable(t, bx, by, CREATURE_W, CREATURE_H, dir)) {
    startWalk(c);
    return;
  }
  markDirty(sim, carveRect(t, bx, by, CREATURE_W, CREATURE_H, dir).dirty);
  c.x = nx;
  c.y = ny;
  c.counter += 1;
  if (!isSolid(t, c.x, c.y)) startFall(c);
}
