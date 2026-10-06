/**
 * Warden: stops and turns every walker that enters its 7 × 11 zone while heading towards it.
 * It is freed only when the ground below it disappears (dug out, blasted) or when it pops.
 */

import { type Creature, CreatureState } from '../creature';
import type { Rect } from '../terrain';
import type { Sim } from '../world';
import { canTakeGroundSkill } from './ground';

export const WARDEN_ZONE_W = 7;
export const WARDEN_ZONE_H = 11;
const HALF = (WARDEN_ZONE_W - 1) >> 1;

export function canTakeWarden(c: Creature): boolean {
  return canTakeGroundSkill(c);
}

export function startWarden(c: Creature): void {
  c.state = CreatureState.Warden;
  c.timer = 0;
  c.counter = 0;
}

/** Zone of a warden: columns x − 3 … x + 3, rows y − 11 … y − 1. */
export function wardenZone(c: Creature): Rect {
  return { x: c.x - HALF, y: c.y - WARDEN_ZONE_H, w: WARDEN_ZONE_W, h: WARDEN_ZONE_H };
}

/**
 * Whether walker `c` must turn: its point (x, y − 1) is inside a warden's zone and it is heading
 * towards that warden. Uses the wardens collected at the start of the tick.
 */
export function wardenTurns(sim: Sim, c: Creature): boolean {
  const py = c.y - 1;
  for (const w of sim.wardens) {
    if (w === c || w.state !== CreatureState.Warden) continue;
    const dx = w.x - c.x;
    if (dx > HALF || dx < -HALF || py < w.y - WARDEN_ZONE_H || py >= w.y) continue;
    if ((dx > 0 && c.dir > 0) || (dx < 0 && c.dir < 0)) return true;
  }
  return false;
}
