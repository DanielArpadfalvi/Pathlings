/**
 * The fixed-60 Hz simulation loop (§1.1, §3.4): `createSim(level)`, `step(sim)`, player commands
 * (assign a skill by creature id, release rate, pop all), the event stream, the input log and the
 * state hash. Rewind and headless replays live in `replay.ts`.
 *
 * Tick order (all iteration in fixed order: creatures by id, objects by definition order):
 *   1. commands for tick T were applied before `step` (they are logged with tick T),
 *   2. crumble cells whose timer ran out disappear,
 *   3. every live creature is updated (`updateCreature`: exit countdown, fuse, movement / skill),
 *      then checked for leaving the level, crumble contact and objects,
 *   4. the entrance releases the next creature when due,
 *   5. T += 1, end conditions, keyframe every `KEYFRAME_INTERVAL` ticks.
 */

import {
  type Creature,
  CreatureState,
  createCreature,
  hashCreature,
  isActive,
  isLive,
} from './creature';
import { FNV_OFFSET, fnv1aU32 } from './hash';
import { KEYFRAME_INTERVAL, captureKeyframe, createKeyframeStore } from './keyframes';
import {
  type EntranceObject,
  type LevelDef,
  SKILLS,
  type SkillId,
  buildTerrain,
  fastestReleaseTicks,
  isSkillId,
} from './level';
import { updateCreature } from './movement';
import { applyObjects, objectZones } from './objects';
import { SKILL_BEHAVIORS, canTakeSkill } from './skills';
import { POPPER_TICKS } from './skills/popper';
import type { StampLibrary } from './stamps';
import {
  CRUMBLE,
  type Terrain,
  cloneTerrain,
  hashTerrain,
  touchCrumble,
  unionRect,
  updateCrumble,
} from './terrain';
import { type Sim, type SimEvent, emit, killCreature, markDirty } from './world';

/** The first creature leaves the entrance at this tick (hatch opening). */
export const FIRST_SPAWN_TICK = 30;

export interface SimOptions {
  /** Record keyframes for `rewindTo` (default true). */
  keyframes?: boolean;
  /** Ticks between keyframes (default `KEYFRAME_INTERVAL`). */
  keyframeInterval?: number;
  /** Collect events for `drainEvents` (default true; headless replays turn it off). */
  events?: boolean;
  /** Use this terrain instead of rasterizing `level.ops` (tests, editor test-play). Cloned. */
  terrain?: Terrain;
  stamps?: StampLibrary;
}

export function createSim(level: LevelDef, options: SimOptions = {}): Sim {
  const terrain = options.terrain
    ? cloneTerrain(options.terrain)
    : buildTerrain(level, options.stamps);
  const objects = level.objects.slice();
  const entrances: number[] = [];
  objects.forEach((o, i) => {
    if (o.type === 'entrance') entrances.push(i);
  });
  const sim: Sim = {
    level,
    width: terrain.width,
    height: terrain.height,
    terrain,
    tick: 0,
    creatures: [],
    objects,
    zones: objectZones(objects),
    entrances,
    trapReadyAt: objects.map(() => 0),
    skills: { ...level.skills },
    releaseInterval: level.minReleaseTicks,
    lastSpawnTick: -1,
    spawned: 0,
    saved: 0,
    dead: 0,
    assignments: 0,
    nuked: false,
    ended: false,
    endReason: null,
    wardens: [],
    log: [],
    releaseChanges: [],
    events: [],
    recordEvents: options.events ?? true,
    dirty: null,
    keyframes: null,
  };
  if (options.keyframes ?? true) {
    sim.keyframes = createKeyframeStore(sim, options.keyframeInterval ?? KEYFRAME_INTERVAL);
    captureKeyframe(sim);
  }
  return sim;
}

// --- Queries ----------------------------------------------------------------------------------

export function getCreature(sim: Sim, id: number): Creature | undefined {
  return Number.isInteger(id) ? sim.creatures[id] : undefined;
}

/** Creatures still in the level (incl. exiting ones), in id order. */
export function liveCreatures(sim: Sim): Creature[] {
  return sim.creatures.filter(isLive);
}

/** Creatures out of the entrance and not yet saved or dead ("out" in the HUD). */
export function liveCount(sim: Sim): number {
  return sim.spawned - sim.saved - sim.dead;
}

/** Creatures still waiting behind the entrance. */
export function waitingCount(sim: Sim): number {
  return sim.nuked ? 0 : sim.level.creatures - sim.spawned;
}

export function timeLeftTicks(sim: Sim): number {
  return Math.max(0, sim.level.timeLimitTicks - sim.tick);
}

/** Fastest / slowest allowed spawn interval of this level. */
export function releaseBounds(sim: Sim): { fastest: number; slowest: number } {
  return {
    fastest: fastestReleaseTicks(sim.level.minReleaseTicks),
    slowest: sim.level.minReleaseTicks,
  };
}

/** Tick of the next spawn (meaningless once everyone is out). */
export function nextSpawnTick(sim: Sim): number {
  return sim.lastSpawnTick < 0 ? FIRST_SPAWN_TICK : sim.lastSpawnTick + sim.releaseInterval;
}

/**
 * Whether `skill` can be assigned to creature `id` now: level running, stock left, creature
 * released, active (not exiting / saved / dead) and eligible for the skill (§1.1 rules).
 */
export function canAssign(sim: Sim, id: number, skill: SkillId): boolean {
  if (sim.ended || !isSkillId(skill) || sim.skills[skill] <= 0) return false;
  const c = getCreature(sim, id);
  return c !== undefined && canTakeSkill(c, skill);
}

// --- Commands ---------------------------------------------------------------------------------

/**
 * Assigns `skill` to creature `id` at the current tick (before the next `step`). Returns false –
 * consuming nothing and logging nothing – when the assignment is invalid (see `canAssign`).
 */
export function assign(sim: Sim, id: number, skill: SkillId): boolean {
  if (!canAssign(sim, id, skill)) return false;
  const c = sim.creatures[id] as Creature;
  SKILL_BEHAVIORS[skill].start(c);
  c.skillsUsed += 1;
  sim.skills[skill] -= 1;
  sim.assignments += 1;
  sim.log.push({ kind: 'assign', tick: sim.tick, creature: id, skill });
  emit(sim, { type: 'skillAssigned', tick: sim.tick, id, skill });
  return true;
}

/** "Pop all": every active creature becomes a Popper and no more creatures are released. */
export function popAll(sim: Sim): boolean {
  if (sim.ended || sim.nuked) return false;
  sim.nuked = true;
  for (const c of sim.creatures) {
    if (isActive(c) && c.popTimer < 0) c.popTimer = POPPER_TICKS;
  }
  sim.log.push({ kind: 'popAll', tick: sim.tick });
  emit(sim, { type: 'popAll', tick: sim.tick });
  return true;
}

/**
 * Sets the spawn interval (clamped to the level's [fastest, minReleaseTicks] range). Returns
 * whether it changed. Several changes within one tick are logged as the last one.
 */
export function setReleaseInterval(sim: Sim, interval: number): boolean {
  if (sim.ended || !Number.isInteger(interval)) return false;
  const { fastest, slowest } = releaseBounds(sim);
  const v = Math.min(slowest, Math.max(fastest, interval));
  if (v === sim.releaseInterval) return false;
  sim.releaseInterval = v;
  const last = sim.releaseChanges[sim.releaseChanges.length - 1];
  if (last && last.tick === sim.tick) last.interval = v;
  else sim.releaseChanges.push({ tick: sim.tick, interval: v });
  emit(sim, { type: 'releaseChanged', tick: sim.tick, interval: v });
  return true;
}

/** The +/− buttons: changes the interval by `delta` ticks (negative = faster), clamped. */
export function adjustReleaseInterval(sim: Sim, delta: number): boolean {
  return setReleaseInterval(sim, sim.releaseInterval + delta);
}

/** Returns and clears the pending events. */
export function drainEvents(sim: Sim): SimEvent[] {
  const out = sim.events;
  sim.events = [];
  return out;
}

// --- Tick -------------------------------------------------------------------------------------

/** Releases a creature at foot point (x, y) facing `dir` (the entrance spawner uses this too). */
export function spawnCreature(
  sim: Sim,
  x: number,
  y: number,
  dir: number,
  entrance = -1,
): Creature {
  const c = createCreature(sim.creatures.length, x, y, dir);
  sim.creatures.push(c);
  sim.spawned += 1;
  sim.lastSpawnTick = sim.tick;
  emit(sim, { type: 'spawned', tick: sim.tick, id: c.id, entrance });
  return c;
}

function spawnDue(sim: Sim): void {
  const n = sim.entrances.length;
  if (sim.nuked || n === 0 || sim.spawned >= sim.level.creatures) return;
  if (sim.tick < nextSpawnTick(sim)) return;
  const index = sim.entrances[sim.spawned % n] as number;
  const e = sim.objects[index] as EntranceObject;
  spawnCreature(sim, e.x, e.y, e.dir, index);
}

function endLevel(sim: Sim, reason: 'done' | 'time'): void {
  sim.ended = true;
  sim.endReason = reason;
  emit(sim, {
    type: 'levelEnded',
    tick: sim.tick,
    saved: sim.saved,
    required: sim.level.required,
    won: sim.saved >= sim.level.required,
    reason,
  });
}

const S_WALK = CreatureState.Walk;
const S_WARDEN = CreatureState.Warden;
const S_DELVE = CreatureState.Delve;
const S_EXITING = CreatureState.Exiting;
const S_SAVED = CreatureState.Saved;
const M_CRUMBLE = CRUMBLE;

/** Simulates one tick. Does nothing once the level has ended. */
export function step(sim: Sim): void {
  if (sim.ended) return;
  sim.dirty = null;
  const wardens = sim.wardens;
  wardens.length = 0;
  const list = sim.creatures;
  for (let i = 0; i < list.length; i++) {
    const c = list[i] as Creature;
    if (c.state === S_WARDEN) wardens.push(c);
  }
  const t = sim.terrain;
  if (t.crumble.length > 0) markDirty(sim, updateCrumble(t, sim.tick));
  const { width, height } = sim;
  const hasObjects = sim.objects.length > sim.entrances.length;
  for (let i = 0; i < list.length; i++) {
    const c = list[i] as Creature;
    if (c.state >= S_SAVED) continue;
    updateCreature(sim, c);
    const state = c.state;
    if (state >= S_EXITING) continue;
    const { x, y } = c;
    if (x < 0 || x >= width || y >= height) {
      killCreature(sim, c, 'outOfBounds');
      continue;
    }
    // Crumble contact: the foot pixel of a creature standing on the ground.
    if (
      y >= 0 &&
      t.cells[y * width + x] === M_CRUMBLE &&
      (state === S_WALK || (state >= S_WARDEN && state <= S_DELVE))
    ) {
      touchCrumble(t, x, y, sim.tick);
    }
    if (hasObjects) applyObjects(sim, c);
  }
  spawnDue(sim);
  if (sim.dirty) {
    emit(sim, { type: 'terrainChanged', tick: sim.tick, rect: sim.dirty });
    if (sim.keyframes) sim.keyframes.pending = unionRect(sim.keyframes.pending, sim.dirty);
  }
  sim.tick += 1;
  const allOut = sim.nuked || sim.spawned >= sim.level.creatures;
  if (allOut && sim.spawned - sim.saved - sim.dead === 0) endLevel(sim, 'done');
  else if (sim.tick >= sim.level.timeLimitTicks) endLevel(sim, 'time');
  const kf = sim.keyframes;
  if (kf && sim.tick % kf.interval === 0) captureKeyframe(sim);
}

/** Steps `n` ticks (stops early when the level ends). */
export function stepN(sim: Sim, n: number): void {
  for (let i = 0; i < n && !sim.ended; i++) step(sim);
}

// --- Hash -------------------------------------------------------------------------------------

/**
 * FNV-1a hash of the whole simulation state: tick, counters, release rate, skill stock, trap
 * timers, every creature and the terrain (cells + crumble timers). Unsigned 32-bit.
 */
export function stateHash(sim: Sim): number {
  let h = FNV_OFFSET;
  h = fnv1aU32(h, sim.tick);
  h = fnv1aU32(h, sim.spawned);
  h = fnv1aU32(h, sim.saved);
  h = fnv1aU32(h, sim.dead);
  h = fnv1aU32(h, sim.assignments);
  h = fnv1aU32(h, sim.nuked ? 1 : 0);
  h = fnv1aU32(h, sim.ended ? 1 : 0);
  h = fnv1aU32(h, sim.releaseInterval);
  h = fnv1aU32(h, sim.lastSpawnTick);
  for (const s of SKILLS) h = fnv1aU32(h, sim.skills[s]);
  h = fnv1aU32(h, sim.trapReadyAt.length);
  for (const r of sim.trapReadyAt) h = fnv1aU32(h, r);
  h = fnv1aU32(h, sim.creatures.length);
  for (const c of sim.creatures) h = hashCreature(h, c);
  return hashTerrain(sim.terrain, h);
}
