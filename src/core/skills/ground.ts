/** Eligibility shared by the active (ground) skills. */

import { type Creature, CreatureState } from '../creature';

/**
 * Active skills need a creature on the ground: walking, or busy with another active skill that
 * the new one replaces (Warden, Mason, Burrower, Sloper, Delver – not while falling, climbing,
 * gliding, bouncing or blocking).
 */
export function canTakeGroundSkill(c: Creature): boolean {
  switch (c.state) {
    case CreatureState.Walk:
    case CreatureState.Build:
    case CreatureState.Burrow:
    case CreatureState.Slope:
    case CreatureState.Delve:
      return true;
    default:
      return false;
  }
}
