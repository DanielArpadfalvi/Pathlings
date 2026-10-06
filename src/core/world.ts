/**
 * The simulation state (`Sim`) and the low-level mutators shared by movement, skills, objects and
 * the tick loop: event emission, dirty-rect tracking and creature fates.
 *
 * Everything in a `Sim` that influences the future is integer data and is hashed by
 * `stateHash` (see `sim.ts`); the event queue, the dirty rect and the keyframe store are derived
 * bookkeeping for the renderer / audio / rewind and are not part of the hashed state.
 */

import {
  type Creature,
  CreatureState,
  type DeathCause,
  EXIT_TICKS,
  deathCauseCode,
} from './creature';
import type { LevelDef, LevelObject, LogCommand, ReleaseChange, SkillId, SkillSet } from './level';
import { type Rect, type Terrain, unionRect } from './terrain';

// --- Events -----------------------------------------------------------------------------------

export type LevelEndReason = 'done' | 'time';

/**
 * Event stream for renderer, audio and UI. `tick` is the tick being simulated when the event
 * happened (for commands: the tick they apply to).
 */
export type SimEvent =
  | { type: 'spawned'; tick: number; id: number; entrance: number }
  | { type: 'exiting'; tick: number; id: number; exit: number }
  | { type: 'saved'; tick: number; id: number }
  | { type: 'died'; tick: number; id: number; cause: DeathCause; x: number; y: number }
  | { type: 'skillAssigned'; tick: number; id: number; skill: SkillId }
  | { type: 'popAll'; tick: number }
  | { type: 'releaseChanged'; tick: number; interval: number }
  | { type: 'plank'; tick: number; id: number; planksLeft: number }
  | { type: 'teleported'; tick: number; id: number; object: number }
  | { type: 'bounced'; tick: number; id: number; object: number }
  | { type: 'trapFired'; tick: number; id: number; object: number }
  | { type: 'terrainChanged'; tick: number; rect: Rect }
  | {
      type: 'levelEnded';
      tick: number;
      saved: number;
      required: number;
      won: boolean;
      reason: LevelEndReason;
    }
  | { type: 'rewound'; tick: number };
export type SimEventType = SimEvent['type'];

// --- Keyframes (owned by keyframes.ts, stored on the sim) -------------------------------------

/** Terrain cells that changed between two keyframes. */
export interface TerrainDiff {
  idx: Uint32Array;
  before: Uint8Array;
  after: Uint8Array;
}

export interface Keyframe {
  tick: number;
  creatures: Int32Array;
  /** See `packCounters` in keyframes.ts. */
  counters: Int32Array;
  skills: Int32Array;
  trapReadyAt: Int32Array;
  /** Armed crumble timers as (cell, expires) pairs. */
  crumble: Int32Array;
  /** Terrain changes from the previous keyframe to this one (null for the first keyframe). */
  diff: TerrainDiff | null;
}

export interface KeyframeStore {
  /** Ticks between keyframes. */
  interval: number;
  frames: Keyframe[];
  /** Terrain cells as of the last keyframe. */
  shadow: Uint8Array;
  /** Bounding box of every terrain change since the last keyframe. */
  pending: Rect | null;
}

// --- Sim --------------------------------------------------------------------------------------

export interface Sim {
  readonly level: LevelDef;
  readonly width: number;
  readonly height: number;
  terrain: Terrain;
  /** Next tick to simulate (= number of ticks simulated so far). */
  tick: number;
  /** Every creature released so far, indexed by id. Saved/dead ones stay (state Saved/Dead). */
  creatures: Creature[];
  /** Objects in definition order (static). */
  readonly objects: readonly LevelObject[];
  /** Trigger zone of every object (index-aligned with `objects`, static). */
  readonly zones: readonly Rect[];
  /** Indices into `objects` of the entrances, in definition order (static). */
  readonly entrances: readonly number[];
  /** Per object: tick from which a trap is armed again (unused for other objects). */
  trapReadyAt: number[];
  /** Remaining skill stock. */
  skills: SkillSet;
  /** Current ticks between two spawns. */
  releaseInterval: number;
  /** Tick of the latest spawn, −1 before the first. */
  lastSpawnTick: number;
  spawned: number;
  saved: number;
  dead: number;
  /** Successful skill assignments (★★★ "frugal" counts these). */
  assignments: number;
  /** "Pop all" was used: no more spawns, everyone is a Popper. */
  nuked: boolean;
  ended: boolean;
  endReason: LevelEndReason | null;
  /** Wardens at the start of the current tick (rebuilt every tick). */
  wardens: Creature[];
  /** Input log (commands that were applied), in tick order. */
  log: LogCommand[];
  /** Release-rate changes that were applied, in tick order. */
  releaseChanges: ReleaseChange[];
  /** Pending events (see `drainEvents`). */
  events: SimEvent[];
  recordEvents: boolean;
  /** Terrain changed during the current tick. */
  dirty: Rect | null;
  keyframes: KeyframeStore | null;
}

// --- Mutators ---------------------------------------------------------------------------------

export function emit(sim: Sim, ev: SimEvent): void {
  if (sim.recordEvents) sim.events.push(ev);
}

export function markDirty(sim: Sim, r: Rect | null): void {
  if (r) sim.dirty = unionRect(sim.dirty, r);
}

export function killCreature(sim: Sim, c: Creature, cause: DeathCause): void {
  c.state = CreatureState.Dead;
  c.cause = deathCauseCode(cause);
  c.timer = 0;
  sim.dead++;
  emit(sim, { type: 'died', tick: sim.tick, id: c.id, cause, x: c.x, y: c.y });
}

export function startExit(sim: Sim, c: Creature, exitIndex: number): void {
  c.state = CreatureState.Exiting;
  c.timer = EXIT_TICKS;
  emit(sim, { type: 'exiting', tick: sim.tick, id: c.id, exit: exitIndex });
}

/** Switches to falling (a fresh fall: the fall distance restarts at 0). */
export function startFall(c: Creature): void {
  c.state = CreatureState.Fall;
  c.timer = 0;
  c.fallen = 0;
}

export function startWalk(c: Creature): void {
  c.state = CreatureState.Walk;
  c.timer = 0;
  c.counter = 0;
}
