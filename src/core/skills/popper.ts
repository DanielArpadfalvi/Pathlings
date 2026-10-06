/**
 * Popper: a 300-tick countdown (shown above the head), then a crater of radius 12 centred on the
 * body (removes soil, rock, one-way walls and crumble – never metal) and the creature is lost.
 * The countdown runs in every state except Exiting; it is also what "pop all" starts.
 */

import { type Creature, isActive } from '../creature';
import { carveCircle } from '../terrain';
import { type Sim, killCreature, markDirty } from '../world';

export const POPPER_TICKS = 300;
export const CRATER_RADIUS = 12;
/** Crater centre is this many px above the foot point (body centre). */
export const CRATER_OFFSET_Y = 5;

export function canTakePopper(c: Creature): boolean {
  return c.popTimer < 0;
}

export function startPopper(c: Creature): void {
  c.popTimer = POPPER_TICKS;
}

/** Counts the fuse down; returns true when the creature exploded this tick. */
export function tickFuse(sim: Sim, c: Creature): boolean {
  if (c.popTimer <= 0 || !isActive(c)) return false;
  c.popTimer -= 1;
  if (c.popTimer > 0) return false;
  markDirty(sim, carveCircle(sim.terrain, c.x, c.y - CRATER_OFFSET_Y, CRATER_RADIUS, 'any').dirty);
  killCreature(sim, c, 'popped');
  return true;
}

/** Whole seconds left on the fuse (5, 4, … 1) for the countdown display; 0 when not a Popper. */
export function fuseSeconds(c: Creature): number {
  return c.popTimer > 0 ? Math.floor((c.popTimer + 59) / 60) : 0;
}
