/**
 * Glider (permanent): after falling `GLIDE_OPEN_FALL` px the leaf opens; from then on it sinks
 * 1 px / 3 ticks and no fall height is deadly.
 */

import { type Creature, PERM_GLIDER, hasPerm } from '../creature';
import { isSolid } from '../terrain';
import { type Sim, startWalk } from '../world';

export const GLIDE_OPEN_FALL = 16;
export const GLIDE_TICKS = 3;

export function canTakeGlider(c: Creature): boolean {
  return !hasPerm(c, PERM_GLIDER);
}

export function startGlider(c: Creature): void {
  c.perm |= PERM_GLIDER;
}

export function updateGlide(sim: Sim, c: Creature): void {
  const t = sim.terrain;
  if (isSolid(t, c.x, c.y)) {
    startWalk(c);
    return;
  }
  if (++c.timer < GLIDE_TICKS) return;
  c.timer = 0;
  c.y += 1;
  c.fallen += 1;
  if (isSolid(t, c.x, c.y)) startWalk(c);
}
