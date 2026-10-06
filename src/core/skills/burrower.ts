/**
 * Burrower: digs a horizontal tunnel as tall as the body, 1 px / 4 ticks (8 in rock). Each step
 * clears the body box one pixel ahead and moves into it. It goes back to walking when nothing
 * diggable is left within 8 px ahead of its body, and stops at metal or a one-way wall facing
 * the other way.
 */

import { CREATURE_H, CREATURE_HALF_W, CREATURE_W, type Creature, CreatureState } from '../creature';
import { carveRect, countRemovable } from '../terrain';
import { type Sim, markDirty, startWalk } from '../world';
import { digDir, digTicks, hasUnremovable } from './dig';
import { canTakeGroundSkill } from './ground';

export const BURROW_TICKS = 4;
/** Look-ahead beyond the body's front edge. */
export const BURROW_LOOKAHEAD = 8;

export function canTakeBurrower(c: Creature): boolean {
  return c.state !== CreatureState.Burrow && canTakeGroundSkill(c);
}

export function startBurrower(c: Creature): void {
  c.state = CreatureState.Burrow;
  c.timer = 0;
  c.counter = 0;
}

export function updateBurrow(sim: Sim, c: Creature): void {
  const t = sim.terrain;
  const nx = c.x + c.dir;
  const bx = nx - CREATURE_HALF_W;
  const by = c.y - CREATURE_H;
  if (++c.timer < digTicks(t, BURROW_TICKS, bx, by, CREATURE_W, CREATURE_H)) return;
  c.timer = 0;
  const dir = digDir(c.dir);
  // Diggable material in the front half of the body or up to 8 px ahead of it?
  const span = CREATURE_HALF_W + BURROW_LOOKAHEAD;
  const ax = c.dir > 0 ? c.x + 1 : c.x - span;
  if (countRemovable(t, ax, by, span, CREATURE_H, dir) === 0) {
    startWalk(c);
    return;
  }
  if (hasUnremovable(t, bx, by, CREATURE_W, CREATURE_H, dir)) {
    startWalk(c);
    return;
  }
  markDirty(sim, carveRect(t, bx, by, CREATURE_W, CREATURE_H, dir).dirty);
  c.x = nx;
  c.counter += 1;
}
