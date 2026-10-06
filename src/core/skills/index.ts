/**
 * The 8 skills behind one interface: eligibility (`eligible`) and the effect of an assignment
 * (`start`). Per-tick behaviour is the `update*` function of the state a skill puts the creature
 * in (dispatched by `updateCreature`).
 */

import { type Creature, isActive } from '../creature';
import { PERMANENT_SKILLS, type SkillId } from '../level';
import { canTakeBurrower, startBurrower } from './burrower';
import { canTakeDelver, startDelver } from './delver';
import { canTakeGlider, startGlider } from './glider';
import { canTakeMason, startMason } from './mason';
import { canTakePopper, startPopper } from './popper';
import { canTakeScaler, startScaler } from './scaler';
import { canTakeSloper, startSloper } from './sloper';
import { canTakeWarden, startWarden } from './warden';

export interface SkillBehavior {
  readonly id: SkillId;
  /** Permanent skills (Scaler, Glider) stack with each other and with one active skill. */
  readonly permanent: boolean;
  /** Whether an active creature may receive the skill now (stock not considered). */
  eligible(c: Creature): boolean;
  /** Applies the assignment. */
  start(c: Creature): void;
}

function behavior(
  id: SkillId,
  eligible: (c: Creature) => boolean,
  start: (c: Creature) => void,
): SkillBehavior {
  return { id, permanent: PERMANENT_SKILLS.includes(id), eligible, start };
}

export const SKILL_BEHAVIORS: Readonly<Record<SkillId, SkillBehavior>> = {
  scaler: behavior('scaler', canTakeScaler, startScaler),
  glider: behavior('glider', canTakeGlider, startGlider),
  popper: behavior('popper', canTakePopper, startPopper),
  warden: behavior('warden', canTakeWarden, startWarden),
  mason: behavior('mason', canTakeMason, startMason),
  burrower: behavior('burrower', canTakeBurrower, startBurrower),
  sloper: behavior('sloper', canTakeSloper, startSloper),
  delver: behavior('delver', canTakeDelver, startDelver),
};

/** Whether creature `c` could take `skill` right now (ignores stock and level state). */
export function canTakeSkill(c: Creature, skill: SkillId): boolean {
  return isActive(c) && SKILL_BEHAVIORS[skill].eligible(c);
}

export * from './burrower';
export * from './delver';
export * from './dig';
export * from './glider';
export * from './ground';
export * from './mason';
export * from './popper';
export * from './scaler';
export * from './sloper';
export * from './warden';
