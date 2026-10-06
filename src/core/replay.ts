/**
 * Replays and rewind (§1.1 determinism, §1.4 rewind, §3.3 verification):
 * - `playLog` drives a sim with a recorded input log (commands + release changes);
 * - `rewindTo` restores the nearest keyframe and re-simulates up to the target tick with the
 *   sim's own log (later commands are discarded – the player continues from there);
 * - `runSolution` replays a level's reference solution headless and checks its final hash;
 * - `exportSolution` packages what the player did into a `Solution` (publishing a level code).
 */

import { keyframeIndexAt, restoreKeyframe } from './keyframes';
import type { LevelDef, LogCommand, ReleaseChange, Solution } from './level';
import {
  type SimOptions,
  assign,
  createSim,
  popAll,
  setReleaseInterval,
  stateHash,
  step,
} from './sim';
import { type Sim, emit } from './world';

/** An input log to replay (a `Solution` without the hash works too). */
export interface InputLog {
  log: readonly LogCommand[];
  releaseChanges: readonly ReleaseChange[];
}

function firstAtOrAfter(items: readonly { tick: number }[], tick: number): number {
  let i = 0;
  while (i < items.length && (items[i] as { tick: number }).tick < tick) i++;
  return i;
}

/**
 * Steps the sim while applying `input` at the logged ticks, until the level ends or `sim.tick`
 * reaches `untilTick`. Entries before the current tick are skipped (already applied). Returns
 * how many commands were rejected (a valid recording replays with 0).
 */
export function playLog(sim: Sim, input: InputLog, untilTick: number = Infinity): number {
  let ci = firstAtOrAfter(input.log, sim.tick);
  let ri = firstAtOrAfter(input.releaseChanges, sim.tick);
  let rejected = 0;
  while (!sim.ended && sim.tick < untilTick) {
    for (
      let r = input.releaseChanges[ri];
      r && r.tick === sim.tick;
      r = input.releaseChanges[++ri]
    ) {
      setReleaseInterval(sim, r.interval);
    }
    for (let c = input.log[ci]; c && c.tick === sim.tick; c = input.log[++ci]) {
      const ok = c.kind === 'popAll' ? popAll(sim) : assign(sim, c.creature, c.skill);
      if (!ok) rejected++;
    }
    step(sim);
  }
  return rejected;
}

/**
 * Rewinds to `tick` (clamped to 0 … current tick): restores the latest keyframe at or before it
 * and re-simulates with the commands logged in between. Commands at or after `tick` are dropped
 * from the log. No events are emitted for the re-simulated ticks; pending events are discarded
 * and a single `rewound` event is emitted (the renderer should redraw the whole terrain).
 */
export function rewindTo(sim: Sim, tick: number): void {
  const store = sim.keyframes;
  if (!store) throw new Error('rewindTo: keyframes are disabled for this sim');
  const target = Math.max(0, Math.min(sim.tick, Math.floor(tick)));
  const input: InputLog = {
    log: sim.log.filter((c) => c.tick < target),
    releaseChanges: sim.releaseChanges.filter((c) => c.tick < target),
  };
  const index = keyframeIndexAt(store, target);
  restoreKeyframe(sim, index);
  sim.log = input.log.filter((c) => c.tick < sim.tick);
  sim.releaseChanges = input.releaseChanges.filter((c) => c.tick < sim.tick);
  const record = sim.recordEvents;
  sim.recordEvents = false;
  playLog(sim, input, target);
  sim.recordEvents = record;
  sim.events = [];
  emit(sim, { type: 'rewound', tick: sim.tick });
}

export interface RunResult {
  /** The level ended (it always does: the time limit ends it at the latest). */
  ended: boolean;
  won: boolean;
  saved: number;
  required: number;
  /** Ticks simulated. */
  ticks: number;
  assignments: number;
  /** Commands of the log that could not be applied. */
  rejected: number;
  hash: number;
  /** `hash` equals the solution's `finalHash`. */
  hashMatches: boolean;
}

/**
 * Headless replay of a solution (default: the level's own reference solution) until the level
 * ends. No keyframes, no events.
 */
export function runSolution(
  level: LevelDef,
  solution: Solution | undefined = level.solution,
  options: Omit<SimOptions, 'keyframes' | 'events'> = {},
): RunResult {
  const sim = createSim(level, { ...options, keyframes: false, events: false });
  const input: InputLog = solution ?? { log: [], releaseChanges: [] };
  const rejected = playLog(sim, input);
  const hash = stateHash(sim);
  return {
    ended: sim.ended,
    won: sim.saved >= level.required,
    saved: sim.saved,
    required: level.required,
    ticks: sim.tick,
    assignments: sim.assignments,
    rejected,
    hash,
    hashMatches: solution !== undefined && hash === solution.finalHash,
  };
}

/** The player's run as a `Solution` (copies of the log, final hash of the current state). */
export function exportSolution(sim: Sim): Solution {
  return {
    log: sim.log.map((c) => ({ ...c })),
    releaseChanges: sim.releaseChanges.map((c) => ({ ...c })),
    finalHash: stateHash(sim),
  };
}
