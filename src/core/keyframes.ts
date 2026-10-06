/**
 * Keyframes for rewind (§1.4, §3.5): every `interval` ticks (default 60 = 1 s) the creature
 * array and counters are packed into typed arrays; the terrain is stored only as the diff to the
 * previous keyframe (changed cells with old and new value), found by scanning the union of the
 * dirty rects since then against a shadow copy. Restoring walks the diffs backwards.
 */

import { packCreatures, unpackCreatures } from './creature';
import { SKILLS } from './level';
import type { Rect } from './terrain';
import type { Keyframe, KeyframeStore, LevelEndReason, Sim, TerrainDiff } from './world';

export const KEYFRAME_INTERVAL = 60;

const END_REASONS: readonly (LevelEndReason | null)[] = [null, 'done', 'time'];

function packCounters(sim: Sim): Int32Array {
  return Int32Array.from([
    sim.tick,
    sim.spawned,
    sim.saved,
    sim.dead,
    sim.assignments,
    sim.nuked ? 1 : 0,
    sim.ended ? 1 : 0,
    END_REASONS.indexOf(sim.endReason),
    sim.releaseInterval,
    sim.lastSpawnTick,
  ]);
}

function unpackCounters(sim: Sim, a: Int32Array): void {
  const f = (k: number): number => a[k] as number;
  sim.tick = f(0);
  sim.spawned = f(1);
  sim.saved = f(2);
  sim.dead = f(3);
  sim.assignments = f(4);
  sim.nuked = f(5) === 1;
  sim.ended = f(6) === 1;
  sim.endReason = END_REASONS[f(7)] ?? null;
  sim.releaseInterval = f(8);
  sim.lastSpawnTick = f(9);
}

function diffTerrain(cells: Uint8Array, shadow: Uint8Array, width: number, r: Rect): TerrainDiff {
  const idx: number[] = [];
  const before: number[] = [];
  const after: number[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    const row = y * width;
    for (let i = row + r.x; i < row + r.x + r.w; i++) {
      const now = cells[i] as number;
      const old = shadow[i] as number;
      if (now === old) continue;
      idx.push(i);
      before.push(old);
      after.push(now);
      shadow[i] = now;
    }
  }
  return {
    idx: Uint32Array.from(idx),
    before: Uint8Array.from(before),
    after: Uint8Array.from(after),
  };
}

/** Stores a keyframe of the current state (call when `sim.tick` is a multiple of the interval). */
export function captureKeyframe(sim: Sim): void {
  const store = sim.keyframes;
  if (!store) return;
  const t = sim.terrain;
  let diff: TerrainDiff | null = null;
  if (store.frames.length > 0 && store.pending) {
    diff = diffTerrain(t.cells, store.shadow, t.width, store.pending);
  }
  store.pending = null;
  const crumble = new Int32Array(t.crumble.length * 2);
  t.crumble.forEach((c, k) => {
    crumble[2 * k] = c.cell;
    crumble[2 * k + 1] = c.expires;
  });
  const frame: Keyframe = {
    tick: sim.tick,
    creatures: packCreatures(sim.creatures),
    counters: packCounters(sim),
    skills: Int32Array.from(SKILLS.map((s) => sim.skills[s])),
    trapReadyAt: Int32Array.from(sim.trapReadyAt),
    crumble,
    diff,
  };
  store.frames.push(frame);
}

export function createKeyframeStore(sim: Sim, interval: number = KEYFRAME_INTERVAL): KeyframeStore {
  return { interval, frames: [], shadow: sim.terrain.cells.slice(), pending: null };
}

/** Index of the latest keyframe at or before `tick` (frames are in tick order). */
export function keyframeIndexAt(store: KeyframeStore, tick: number): number {
  let lo = 0;
  let hi = store.frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((store.frames[mid] as Keyframe).tick <= tick) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Restores the state of keyframe `index` and drops every later keyframe. The sim's log, events
 * and dirty rect are left to the caller (see `rewindTo`).
 */
export function restoreKeyframe(sim: Sim, index: number): void {
  const store = sim.keyframes;
  if (!store) throw new Error('restoreKeyframe: keyframes are disabled');
  const frame = store.frames[index];
  if (!frame) throw new RangeError(`restoreKeyframe: no keyframe ${index}`);
  for (let j = store.frames.length - 1; j > index; j--) {
    const d = (store.frames[j] as Keyframe).diff;
    if (!d) continue;
    for (let k = 0; k < d.idx.length; k++) store.shadow[d.idx[k] as number] = d.before[k] as number;
  }
  store.frames.length = index + 1;
  store.pending = null;

  const t = sim.terrain;
  t.cells.set(store.shadow);
  t.crumble = [];
  t.crumbleArmed = new Set();
  for (let k = 0; k < frame.crumble.length; k += 2) {
    const cell = frame.crumble[k] as number;
    t.crumble.push({ cell, expires: frame.crumble[k + 1] as number });
    t.crumbleArmed.add(cell);
  }
  sim.creatures = unpackCreatures(frame.creatures);
  unpackCounters(sim, frame.counters);
  SKILLS.forEach((s, k) => {
    sim.skills[s] = frame.skills[k] as number;
  });
  sim.trapReadyAt = Array.from(frame.trapReadyAt);
  sim.dirty = null;
}

/** Approximate memory held by the keyframes in bytes (typed-array payloads + shadow). */
export function keyframeBytes(store: KeyframeStore): number {
  let n = store.shadow.byteLength;
  for (const f of store.frames) {
    n += f.creatures.byteLength + f.counters.byteLength + f.skills.byteLength;
    n += f.trapReadyAt.byteLength + f.crumble.byteLength;
    if (f.diff) n += f.diff.idx.byteLength + f.diff.before.byteLength + f.diff.after.byteLength;
  }
  return n;
}
