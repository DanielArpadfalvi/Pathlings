/**
 * Delver: digs straight down a 9-px-wide shaft, 1 px / 8 ticks (16 in rock). Stops (walks on)
 * when the row below contains metal; falls when there is air below.
 */

import { type Creature, CreatureState } from '../creature';
import { SHAFT_WIDTH, carveShaftRow, isSolid } from '../terrain';
import { type Sim, markDirty, startFall, startWalk } from '../world';
import { digTicks, hasUnremovable } from './dig';
import { canTakeGroundSkill } from './ground';

export const DELVE_TICKS = 8;
const HALF = (SHAFT_WIDTH - 1) >> 1;

export function canTakeDelver(c: Creature): boolean {
  return c.state !== CreatureState.Delve && canTakeGroundSkill(c);
}

export function startDelver(c: Creature): void {
  c.state = CreatureState.Delve;
  c.timer = 0;
  c.counter = 0;
}

export function updateDelve(sim: Sim, c: Creature): void {
  const t = sim.terrain;
  const x0 = c.x - HALF;
  if (++c.timer < digTicks(t, DELVE_TICKS, x0, c.y, SHAFT_WIDTH, 1)) return;
  c.timer = 0;
  if (hasUnremovable(t, x0, c.y, SHAFT_WIDTH, 1, 'down')) {
    startWalk(c);
    return;
  }
  markDirty(sim, carveShaftRow(t, c.x, c.y).dirty);
  c.y += 1;
  c.counter += 1;
  if (!isSolid(t, c.x, c.y)) startFall(c);
}
