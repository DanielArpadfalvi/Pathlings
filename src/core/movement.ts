/**
 * The creature state machine (§1.1): the per-tick dispatcher `updateCreature`, walking with
 * step-up / step-down and turning at walls, falling with deadly height, and the bounce-pad
 * launch. Skill states delegate to their `skills/*` module.
 *
 * Performance note: this is the hot path (every creature, every tick). Under module transforms
 * (Vitest, dev server) each imported binding is read through a getter, so hot constants are
 * aliased locally and terrain reads use a local cell lookup instead of `isSolid`.
 */

import {
  CREATURE_H,
  CREATURE_HALF_W,
  type Creature,
  CreatureState,
  MAX_STEP_DOWN,
  MAX_STEP_UP,
  PERM_GLIDER,
  PERM_SCALER,
  SAFE_FALL,
  WALK_TICKS,
} from './creature';
import { updateBurrow } from './skills/burrower';
import { updateDelve } from './skills/delver';
import { GLIDE_OPEN_FALL, updateGlide } from './skills/glider';
import { updateBuild } from './skills/mason';
import { tickFuse } from './skills/popper';
import { startClimb, updateClimb } from './skills/scaler';
import { updateSlope } from './skills/sloper';
import { wardenTurns } from './skills/warden';
import type { Terrain } from './terrain';
import { type Sim, emit, killCreature, startFall, startWalk } from './world';

/** Bounce pad: launch height in px (rises 1 px / tick). */
export const BOUNCE_HEIGHT = 40;
/** While rising from a bounce pad the creature also drifts 1 px forward every N ticks. */
export const BOUNCE_DRIFT_TICKS = 2;

const S_WALK = CreatureState.Walk;
const S_FALL = CreatureState.Fall;
const S_GLIDE = CreatureState.Glide;
const S_CLIMB = CreatureState.Climb;
const S_BOUNCE = CreatureState.Bounce;
const S_WARDEN = CreatureState.Warden;
const S_BUILD = CreatureState.Build;
const S_BURROW = CreatureState.Burrow;
const S_SLOPE = CreatureState.Slope;
const S_DELVE = CreatureState.Delve;
const S_EXITING = CreatureState.Exiting;
const S_SAVED = CreatureState.Saved;
const H = CREATURE_H;
const STEP_UP = MAX_STEP_UP;
const STEP_DOWN = MAX_STEP_DOWN;
const WALK_T = WALK_TICKS;
const SAFE = SAFE_FALL;
const GLIDE_OPEN = GLIDE_OPEN_FALL;
const SCALER = PERM_SCALER;
const GLIDER = PERM_GLIDER;

/** `isSolid` (outside the level is air), local for speed. */
function solid(t: Terrain, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < t.width && y < t.height && t.cells[y * t.width + x] !== 0;
}

/**
 * Updates one live creature for the current tick: exit countdown, Popper fuse, losing the
 * ground, then the state's movement / skill. Bounds, crumble contact and objects are handled by
 * the caller (`step`) afterwards.
 */
export function updateCreature(sim: Sim, c: Creature): void {
  const state = c.state;
  if (state === S_EXITING) {
    c.timer -= 1;
    if (c.timer <= 0) {
      c.state = S_SAVED;
      sim.saved += 1;
      emit(sim, { type: 'saved', tick: sim.tick, id: c.id });
    }
    return;
  }
  if (c.popTimer > 0 && tickFuse(sim, c)) return;
  const t = sim.terrain;
  if ((state === S_WALK || (state >= S_WARDEN && state <= S_DELVE)) && !solid(t, c.x, c.y)) {
    startFall(c);
  }
  switch (c.state) {
    case S_WALK:
      if (++c.timer >= WALK_T) {
        c.timer = 0;
        walkStep(sim, c);
      }
      break;
    case S_FALL:
      updateFall(sim, c);
      break;
    case S_GLIDE:
      updateGlide(sim, c);
      break;
    case S_CLIMB:
      updateClimb(sim, c);
      break;
    case S_BOUNCE:
      updateBounce(sim, c);
      break;
    case S_BUILD:
      updateBuild(sim, c);
      break;
    case S_BURROW:
      updateBurrow(sim, c);
      break;
    case S_SLOPE:
      updateSlope(sim, c);
      break;
    case S_DELVE:
      updateDelve(sim, c);
      break;
    default:
      break; // Warden: stands still
  }
}

/** One pixel of walking: turn at wardens and walls, step up ≤ 6, step down ≤ 3, else fall. */
export function walkStep(sim: Sim, c: Creature): void {
  if (sim.wardens.length > 0 && wardenTurns(sim, c)) {
    c.dir = -c.dir;
    return;
  }
  const t = sim.terrain;
  const nx = c.x + c.dir;
  const y = c.y;
  if (solid(t, nx, y - 1)) {
    let h = 1;
    while (h <= STEP_UP && solid(t, nx, y - 1 - h)) h++;
    if (h <= STEP_UP) {
      c.x = nx;
      c.y = y - h;
    } else if ((c.perm & SCALER) !== 0) {
      startClimb(c);
    } else {
      c.dir = -c.dir;
    }
    return;
  }
  c.x = nx;
  if (solid(t, nx, y)) return;
  for (let d = 1; d <= STEP_DOWN; d++) {
    if (solid(t, nx, y + d)) {
      c.y = y + d;
      return;
    }
  }
  startFall(c);
}

/** Falls 1 px per tick; landing after more than `SAFE_FALL` px kills (unless a Glider). */
export function updateFall(sim: Sim, c: Creature): void {
  const t = sim.terrain;
  if (!solid(t, c.x, c.y)) {
    c.y += 1;
    c.fallen += 1;
    if (!solid(t, c.x, c.y)) {
      if ((c.perm & GLIDER) !== 0 && c.fallen >= GLIDE_OPEN) {
        c.state = S_GLIDE;
        c.timer = 0;
      }
      return;
    }
  }
  if (c.fallen > SAFE && (c.perm & GLIDER) === 0) killCreature(sim, c, 'fall');
  else startWalk(c);
}

export function startBounce(c: Creature): void {
  c.state = S_BOUNCE;
  c.timer = 0;
  c.counter = BOUNCE_HEIGHT;
  c.fallen = 0;
}

/** Rising after a bounce pad: 1 px up per tick, drifting forward; a ceiling ends the rise. */
export function updateBounce(sim: Sim, c: Creature): void {
  const t = sim.terrain;
  if (solid(t, c.x, c.y - H - 1)) {
    startFall(c);
    return;
  }
  c.y -= 1;
  c.counter -= 1;
  c.timer += 1;
  if (c.timer % BOUNCE_DRIFT_TICKS === 0) {
    const front = c.x + c.dir * (CREATURE_HALF_W + 1);
    let blocked = false;
    for (let yy = c.y - H; yy < c.y && !blocked; yy++) blocked = solid(t, front, yy);
    if (blocked) c.dir = -c.dir;
    else c.x += c.dir;
  }
  if (c.counter <= 0) startFall(c);
}
