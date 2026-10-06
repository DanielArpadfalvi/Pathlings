/**
 * Mason: builds a staircase of 12 planks. Every 32 ticks it lays a 6 × 1 plank in front of its
 * feet (soil, only into air), then steps 2 px forward and 1 px up onto it. If its body would hit
 * terrain on that step it turns around and walks. The last 3 planks are flagged "running out";
 * while running out, another Mason assignment refills it to 12 (no new staircase is started).
 */

import { CREATURE_H, CREATURE_HALF_W, CREATURE_W, type Creature, CreatureState } from '../creature';
import { PLANK_WIDTH, countSolid, writePlank } from '../terrain';
import { type Sim, emit, markDirty, startWalk } from '../world';
import { canTakeGroundSkill } from './ground';

export const MASON_PLANKS = 12;
export const MASON_PLANK_TICKS = 32;
/** The last N planks show the "running out" warning. */
export const MASON_WARN_PLANKS = 3;
export const MASON_STEP_X = 2;
export const MASON_STEP_Y = 1;

export function canTakeMason(c: Creature): boolean {
  if (c.state === CreatureState.Build) return c.counter <= MASON_WARN_PLANKS;
  return canTakeGroundSkill(c);
}

export function startMason(c: Creature): void {
  if (c.state === CreatureState.Build) {
    // Refill while running out: keep the current plank cycle going.
    c.counter = MASON_PLANKS;
    return;
  }
  c.state = CreatureState.Build;
  c.timer = 0;
  c.counter = MASON_PLANKS;
}

/** Whether a building Mason is on its last planks (renderer / audio warning). */
export function masonRunningOut(c: Creature): boolean {
  return c.state === CreatureState.Build && c.counter <= MASON_WARN_PLANKS;
}

export function updateBuild(sim: Sim, c: Creature): void {
  const t = sim.terrain;
  if (c.timer === 0) {
    const px = c.dir > 0 ? c.x : c.x - PLANK_WIDTH + 1;
    markDirty(sim, writePlank(t, px, c.y - 1).dirty);
    c.counter -= 1;
    emit(sim, { type: 'plank', tick: sim.tick, id: c.id, planksLeft: c.counter });
  }
  if (++c.timer < MASON_PLANK_TICKS) return;
  c.timer = 0;
  const nx = c.x + MASON_STEP_X * c.dir;
  const ny = c.y - MASON_STEP_Y;
  if (countSolid(t, nx - CREATURE_HALF_W, ny - CREATURE_H, CREATURE_W, CREATURE_H) > 0) {
    c.dir = -c.dir;
    startWalk(c);
    return;
  }
  c.x = nx;
  c.y = ny;
  if (c.counter <= 0) startWalk(c);
}
