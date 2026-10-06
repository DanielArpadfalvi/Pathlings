/**
 * Scaler (permanent): at a wall too high to step up, climbs it at 1 px / 4 ticks. A ceiling
 * directly above the head (overhang) makes it fall back and turn around.
 */

import { CREATURE_H, type Creature, CreatureState, PERM_SCALER, hasPerm } from '../creature';
import { isSolid } from '../terrain';
import { type Sim, startFall, startWalk } from '../world';

export const CLIMB_TICKS = 4;

export function canTakeScaler(c: Creature): boolean {
  return !hasPerm(c, PERM_SCALER);
}

export function startScaler(c: Creature): void {
  c.perm |= PERM_SCALER;
}

/** Walker at a wall (at column x + dir) starts climbing. */
export function startClimb(c: Creature): void {
  c.state = CreatureState.Climb;
  c.timer = 0;
}

export function updateClimb(sim: Sim, c: Creature): void {
  if (++c.timer < CLIMB_TICKS) return;
  c.timer = 0;
  const t = sim.terrain;
  if (isSolid(t, c.x, c.y - CREATURE_H - 1)) {
    // Overhang: the head would hit the ceiling.
    c.dir = -c.dir;
    startFall(c);
    return;
  }
  c.y -= 1;
  if (!isSolid(t, c.x + c.dir, c.y - 1)) {
    // Top of the wall: step onto it.
    c.x += c.dir;
    startWalk(c);
  }
}
