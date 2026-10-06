/**
 * Creature (Pathling) data: states, the numbers of §1.1, packing for keyframes and hashing.
 *
 * A creature is a plain object of integers. Its position is the *foot point*: (x, y) is the
 * pixel directly below its feet, so a creature stands when `isSolid(terrain, x, y)`. The body
 * (hitbox) is `CREATURE_W` × `CREATURE_H`: columns x − 2 … x + 2, rows y − 9 … y − 1.
 *
 * Behaviour lives in `movement.ts` (walk, fall, bounce) and `skills/*` (one module per skill);
 * the sim (`sim.ts`) updates creatures in id order once per tick.
 */

import { fnv1aU32 } from './hash';
import type { Rect } from './terrain';

// --- Numbers (§1.1) ---------------------------------------------------------------------------

export const CREATURE_W = 5;
export const CREATURE_H = 9;
/** Half of the body width (columns x − 2 … x + 2). */
export const CREATURE_HALF_W = 2;
/** Walking: 1 px every `WALK_TICKS` ticks (20 px/s). */
export const WALK_TICKS = 3;
/** Highest step a walker climbs without turning (a 7-px wall turns it). */
export const MAX_STEP_UP = 6;
/** Deepest step a walker steps down while still walking (deeper ⇒ it starts falling). */
export const MAX_STEP_DOWN = 3;
/** Falling speed: 1 px per tick. A fall of more than `SAFE_FALL` px kills (unless gliding). */
export const SAFE_FALL = 60;
/** Ticks of the "hop into the exit" animation; the creature counts as saved afterwards. */
export const EXIT_TICKS = 20;

// --- States -----------------------------------------------------------------------------------

/** Creature states (integer codes; part of the hashed state, never renumber shipped codes). */
export const CreatureState = {
  Walk: 0,
  Fall: 1,
  /** Falling with the Glider's leaf open (1 px / 3 ticks, never deadly). */
  Glide: 2,
  /** Scaler going up a wall. */
  Climb: 3,
  /** Launched upwards by a bounce pad. */
  Bounce: 4,
  /** Warden: stands still and turns creatures entering its zone. */
  Warden: 5,
  /** Mason building a staircase. */
  Build: 6,
  /** Burrower digging a horizontal tunnel. */
  Burrow: 7,
  /** Sloper digging diagonally down. */
  Slope: 8,
  /** Delver digging straight down. */
  Delve: 9,
  /** Entering an exit (`EXIT_TICKS`), input has no effect. */
  Exiting: 10,
  Saved: 11,
  Dead: 12,
} as const;
export type CreatureStateCode = (typeof CreatureState)[keyof typeof CreatureState];

/** State names by code (for the renderer, debugging and tests). */
export const STATE_NAMES = [
  'walk',
  'fall',
  'glide',
  'climb',
  'bounce',
  'warden',
  'build',
  'burrow',
  'slope',
  'delve',
  'exiting',
  'saved',
  'dead',
] as const;
export type CreatureStateName = (typeof STATE_NAMES)[number];

/** Permanent skill flags (`Creature.perm`). */
export const PERM_SCALER = 1;
export const PERM_GLIDER = 2;

/** Death causes (index stored in `Creature.cause`; 0 = alive / not dead). */
export const DEATH_CAUSES = [
  'none',
  'fall',
  'water',
  'lava',
  'trap',
  'outOfBounds',
  'popped',
] as const;
export type DeathCause = Exclude<(typeof DEATH_CAUSES)[number], 'none'>;

export function deathCauseCode(cause: DeathCause): number {
  return DEATH_CAUSES.indexOf(cause);
}

// --- Data -------------------------------------------------------------------------------------

export interface Creature {
  /** Stable id = spawn order (0, 1, 2, …); input logs reference creatures by it. */
  readonly id: number;
  x: number;
  y: number;
  /** Facing / moving direction: 1 = right, −1 = left. */
  dir: number;
  state: CreatureStateCode;
  /** Ticks spent in the current state / step (meaning depends on the state). */
  timer: number;
  /** State-specific counter: planks left (Build), steps dug (Slope), rise left (Bounce). */
  counter: number;
  /** Pixels fallen since the fall started (Fall / Glide). */
  fallen: number;
  /** Permanent skills, bit set of `PERM_SCALER` | `PERM_GLIDER`. */
  perm: number;
  /** Popper countdown in ticks, −1 when not a Popper. */
  popTimer: number;
  /** Number of skills ever assigned (smart selection prefers creatures without one). */
  skillsUsed: number;
  /** Index of the teleporter zone the creature is standing in (no re-trigger), −1 = none. */
  lastTeleport: number;
  /** `DEATH_CAUSES` index when dead, else 0. */
  cause: number;
}

export function createCreature(id: number, x: number, y: number, dir: number): Creature {
  return {
    id,
    x,
    y,
    dir: dir < 0 ? -1 : 1,
    state: CreatureState.Fall,
    timer: 0,
    counter: 0,
    fallen: 0,
    perm: 0,
    popTimer: -1,
    skillsUsed: 0,
    lastTeleport: -1,
    cause: 0,
  };
}

/** Still in the level (not saved, not dead). Exiting creatures are live until saved. */
export function isLive(c: Creature): boolean {
  return c.state !== CreatureState.Saved && c.state !== CreatureState.Dead;
}

/** Live and able to take commands / interact with objects (not exiting). */
export function isActive(c: Creature): boolean {
  return c.state < CreatureState.Exiting;
}

/** States in which the creature stands on the ground (lose it ⇒ fall). */
export function isGroundState(state: number): boolean {
  return (
    state === CreatureState.Walk || (state >= CreatureState.Warden && state <= CreatureState.Delve)
  );
}

export function hasPerm(c: Creature, flag: number): boolean {
  return (c.perm & flag) !== 0;
}

export function stateName(c: Creature): CreatureStateName {
  return STATE_NAMES[c.state];
}

/** The creature's hitbox (columns x − 2 … x + 2, rows y − 9 … y − 1). */
export function bodyRect(c: Creature): Rect {
  return { x: c.x - CREATURE_HALF_W, y: c.y - CREATURE_H, w: CREATURE_W, h: CREATURE_H };
}

/** Body centre in world pixels (integer; for selection distance and effects). */
export function bodyCenter(c: Creature): { x: number; y: number } {
  return { x: c.x, y: c.y - 5 };
}

// --- Packing (keyframes) and hashing ----------------------------------------------------------

/** Number of Int32 fields per packed creature. */
export const CREATURE_FIELDS = 13;

export function packCreatures(list: readonly Creature[]): Int32Array {
  const out = new Int32Array(list.length * CREATURE_FIELDS);
  let o = 0;
  for (const c of list) {
    out[o++] = c.id;
    out[o++] = c.x;
    out[o++] = c.y;
    out[o++] = c.dir;
    out[o++] = c.state;
    out[o++] = c.timer;
    out[o++] = c.counter;
    out[o++] = c.fallen;
    out[o++] = c.perm;
    out[o++] = c.popTimer;
    out[o++] = c.skillsUsed;
    out[o++] = c.lastTeleport;
    out[o++] = c.cause;
  }
  return out;
}

export function unpackCreatures(data: Int32Array): Creature[] {
  const list: Creature[] = [];
  for (let o = 0; o < data.length; o += CREATURE_FIELDS) {
    const f = (k: number): number => data[o + k] as number;
    list.push({
      id: f(0),
      x: f(1),
      y: f(2),
      dir: f(3),
      state: f(4) as CreatureStateCode,
      timer: f(5),
      counter: f(6),
      fallen: f(7),
      perm: f(8),
      popTimer: f(9),
      skillsUsed: f(10),
      lastTeleport: f(11),
      cause: f(12),
    });
  }
  return list;
}

/** Folds every field of a creature into a running FNV-1a hash. */
export function hashCreature(h: number, c: Creature): number {
  let x = fnv1aU32(h, c.id);
  x = fnv1aU32(x, c.x);
  x = fnv1aU32(x, c.y);
  x = fnv1aU32(x, c.dir);
  x = fnv1aU32(x, c.state);
  x = fnv1aU32(x, c.timer);
  x = fnv1aU32(x, c.counter);
  x = fnv1aU32(x, c.fallen);
  x = fnv1aU32(x, c.perm);
  x = fnv1aU32(x, c.popTimer);
  x = fnv1aU32(x, c.skillsUsed);
  x = fnv1aU32(x, c.lastTeleport);
  return fnv1aU32(x, c.cause);
}
