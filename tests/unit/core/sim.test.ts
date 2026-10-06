import { describe, expect, it } from 'vitest';
import { CreatureState } from '../../../src/core/creature';
import { KEYFRAME_INTERVAL, keyframeBytes, keyframeIndexAt } from '../../../src/core/keyframes';
import { type LevelDef, createLevel, emptySkillSet, validateLevel } from '../../../src/core/level';
import { exportSolution, playLog, rewindTo, runSolution } from '../../../src/core/replay';
import {
  assign,
  createSim,
  drainEvents,
  getCreature,
  liveCreatures,
  popAll,
  setReleaseInterval,
  stateHash,
  step,
  stepN,
} from '../../../src/core/sim';
import type { SimEvent } from '../../../src/core/world';
import { FIXTURE_LEVELS, cliff, digDown, tunnel } from '../../../src/levels/test';

/** A busy level: 100 creatures in a closed 320 × 480 arena with terraces, rock and metal. */
function busyLevel(withTrap = true): LevelDef {
  return createLevel({
    id: 'busy',
    title: 'Busy',
    w: 320,
    h: 480,
    ops: [
      { op: 'rect', m: 1, x: 0, y: 400, w: 320, h: 80 },
      { op: 'rect', m: 2, x: 0, y: 430, w: 320, h: 20 },
      { op: 'rect', m: 3, x: 0, y: 470, w: 320, h: 10 },
      { op: 'rect', m: 3, x: 0, y: 200, w: 6, h: 200 },
      { op: 'rect', m: 3, x: 314, y: 200, w: 6, h: 200 },
      { op: 'rect', m: 1, x: 120, y: 360, w: 30, h: 40 },
      { op: 'ramp', m: 1, x: 200, y: 380, w: 40, h: 20, rise: 'right' },
      { op: 'rect', m: 6, x: 260, y: 400, w: 20, h: 3 },
    ],
    objects: [
      { type: 'entrance', x: 40, y: 380, dir: 1 },
      { type: 'entrance', x: 280, y: 380, dir: -1 },
      { type: 'exit', x: 160, y: 300 },
      ...(withTrap ? [{ type: 'trap' as const, x: 60, y: 390 }] : []),
    ],
    creatures: 100,
    required: 1,
    master: 1,
    skills: emptySkillSet(99),
    timeLimitTicks: 18_000,
    minReleaseTicks: 8,
  });
}

/** A log with a mix of skills (some will be rejected – that is part of the replay too). */
function busyLog() {
  const skills = ['delver', 'burrower', 'mason', 'sloper', 'warden', 'scaler', 'glider'] as const;
  const log = [];
  for (let k = 0; k < 40; k++) {
    log.push({
      kind: 'assign' as const,
      tick: 900 + k * 97,
      creature: (k * 37) % 100,
      skill: skills[k % skills.length]!,
    });
  }
  log.push({ kind: 'assign' as const, tick: 6000, creature: 3, skill: 'popper' as const });
  return { log, releaseChanges: [{ tick: 0, interval: 2 }] };
}

/** Plays a recorded input log live (assigning through the public API) and returns the sim. */
function playLive(level: LevelDef, untilTick = Infinity) {
  const sim = createSim(level);
  playLog(sim, level.solution ?? busyLog(), untilTick);
  return sim;
}

describe('sim loop', () => {
  it('keeps a keyframe every 60 ticks', () => {
    const sim = createSim(digDown);
    stepN(sim, 250);
    const ticks = sim.keyframes!.frames.map((f) => f.tick);
    expect(KEYFRAME_INTERVAL).toBe(60);
    expect(ticks).toEqual([0, 60, 120, 180, 240]);
    expect(keyframeIndexAt(sim.keyframes!, 119)).toBe(1);
    expect(keyframeIndexAt(sim.keyframes!, 120)).toBe(2);
    expect(keyframeIndexAt(sim.keyframes!, 9999)).toBe(4);
    expect(keyframeBytes(sim.keyframes!)).toBeGreaterThan(160 * 240);
  });

  it('emits the event stream of a whole run', () => {
    const sim = createSim(digDown);
    const events: SimEvent[] = [];
    playLog(sim, digDown.solution!);
    events.push(...drainEvents(sim));
    const count = (t: SimEvent['type']) => events.filter((e) => e.type === t).length;
    expect(count('spawned')).toBe(10);
    expect(count('exiting')).toBe(10);
    expect(count('saved')).toBe(10);
    expect(count('skillAssigned')).toBe(1);
    expect(count('terrainChanged')).toBe(10); // one per dug row
    expect(count('levelEnded')).toBe(1);
    expect(events.at(-1)).toMatchObject({ type: 'levelEnded', won: true, saved: 10 });
    const ticks = events.map((e) => e.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    expect(drainEvents(sim)).toEqual([]);
  });

  it('can run without events', () => {
    const sim = createSim(digDown, { events: false });
    stepN(sim, 100);
    expect(sim.events).toEqual([]);
  });

  it('queries for selection: position, direction, state, live list', () => {
    const sim = createSim(tunnel);
    stepN(sim, 200);
    const live = liveCreatures(sim);
    expect(live.map((c) => c.id)).toEqual([0, 1, 2, 3, 4]); // spawned at 30, 70, …, 190
    const c = getCreature(sim, 0)!;
    expect(c).toMatchObject({ dir: expect.any(Number), state: CreatureState.Walk });
    expect(getCreature(sim, 99)).toBeUndefined();
  });
});

describe('determinism', () => {
  it('same level + log ⇒ same hash (3 runs)', () => {
    const level = busyLevel();
    const hashes = [0, 1, 2].map(() => stateHash(playLive(level)));
    expect(new Set(hashes).size).toBe(1);
    for (const fixture of FIXTURE_LEVELS) {
      const h = [0, 1, 2].map(() => runSolution(fixture).hash);
      expect(new Set(h).size, fixture.id).toBe(1);
    }
  });

  it('a different log gives a different hash', () => {
    const a = runSolution(digDown);
    const sol = digDown.solution!;
    // Digging 3 ticks later moves the shaft by 1 px.
    const b = runSolution(digDown, {
      ...sol,
      log: [{ ...sol.log[0]!, tick: sol.log[0]!.tick + 3 }],
    });
    expect(b.won).toBe(true);
    expect(b.hash).not.toBe(a.hash);
    expect(b.hashMatches).toBe(false);
  });

  it('the state hash covers terrain, creatures, counters and tick', () => {
    const sim = createSim(digDown);
    stepN(sim, 200);
    const h = stateHash(sim);
    const mutations: ((s: typeof sim) => void)[] = [
      (s) => (s.terrain.cells[0] = 2),
      (s) => (s.creatures[0]!.x += 1),
      (s) => (s.saved += 1),
      (s) => (s.skills.delver += 1),
      (s) => (s.tick += 1),
      (s) => (s.releaseInterval += 1),
      (s) => s.trapReadyAt.push(0),
    ];
    for (const m of mutations) {
      const copy = createSim(digDown);
      stepN(copy, 200);
      expect(stateHash(copy)).toBe(h);
      m(copy);
      expect(stateHash(copy)).not.toBe(h);
    }
  });
});

describe('rewind', () => {
  it('rewind to any tick then resume ⇒ same hash as a straight run', () => {
    for (const level of [busyLevel(), digDown, tunnel, cliff]) {
      const straight = playLive(level);
      const finalHash = stateHash(straight);
      for (const [stopAt, target] of [
        [700, 0],
        [700, 59],
        [700, 60],
        [1500, 977],
        [400, 399],
        [300, 300],
      ] as const) {
        const sim = playLive(level, stopAt);
        rewindTo(sim, target);
        expect(sim.tick, `${level.id} ${target}`).toBe(Math.min(target, sim.tick));
        const atTarget = playLive(level, sim.tick);
        expect(stateHash(sim), `${level.id} at ${target}`).toBe(stateHash(atTarget));
        playLog(sim, level.solution ?? busyLog());
        expect(stateHash(sim), `${level.id} ${stopAt}→${target}`).toBe(finalHash);
      }
    }
  }, 30_000);

  it('rewinds an ended level and repeatedly', () => {
    const sim = playLive(cliff);
    expect(sim.ended).toBe(true);
    const end = stateHash(sim);
    rewindTo(sim, 500);
    expect(sim.ended).toBe(false);
    rewindTo(sim, 100);
    rewindTo(sim, 20);
    playLog(sim, cliff.solution!, 900);
    rewindTo(sim, 850);
    playLog(sim, cliff.solution!);
    expect(stateHash(sim)).toBe(end);
  });

  it('drops later commands; the player continues with new ones', () => {
    const sim = playLive(cliff, 1100);
    expect(sim.log.length).toBe(3);
    drainEvents(sim);
    rewindTo(sim, 500);
    expect(sim.log.map((c) => c.tick)).toEqual([31, 31]);
    expect(drainEvents(sim)).toEqual([{ type: 'rewound', tick: 500 }]);
    expect(setReleaseInterval(sim, 20)).toBe(true);
    stepN(sim, 10);
    expect(popAll(sim)).toBe(true);
    const sol = exportSolution(sim);
    expect(sol.log.map((c) => c.kind)).toEqual(['assign', 'assign', 'popAll']);
    expect(sol.releaseChanges).toEqual([{ tick: 500, interval: 20 }]);
    stepN(sim, 5000);
    const replay = runSolution(cliff, exportSolution(sim));
    expect(replay.hashMatches).toBe(true);
  });

  it('clamps the target and needs keyframes', () => {
    const sim = createSim(digDown);
    stepN(sim, 30);
    rewindTo(sim, 1000);
    expect(sim.tick).toBe(30);
    rewindTo(sim, -5);
    expect(sim.tick).toBe(0);
    expect(() => rewindTo(createSim(digDown, { keyframes: false }), 0)).toThrow();
  });

  it('restores dug terrain and crumble timers', () => {
    const level = busyLevel();
    const sim = playLive(level, 4000);
    const at = playLive(level, 2345);
    rewindTo(sim, 2345);
    expect(sim.terrain.cells).toEqual(at.terrain.cells);
    expect(sim.terrain.crumble).toEqual(at.terrain.crumble);
    expect(sim.creatures).toEqual(at.creatures);
  });
});

describe('runSolution', () => {
  it('every fixture level is won by its reference solution with a matching hash', () => {
    expect(FIXTURE_LEVELS.length).toBeGreaterThanOrEqual(3);
    for (const level of FIXTURE_LEVELS) {
      expect(validateLevel(level), level.id).toEqual([]);
      const r = runSolution(level);
      expect(r, level.id).toMatchObject({ ended: true, won: true, rejected: 0, hashMatches: true });
      expect(r.saved).toBeGreaterThanOrEqual(level.required);
    }
  });

  it('reports rejected commands and missing solutions', () => {
    const r = runSolution(digDown, {
      log: [{ kind: 'assign', tick: 5, creature: 0, skill: 'delver' }],
      releaseChanges: [],
      finalHash: 0,
    });
    expect(r.rejected).toBe(1);
    expect(r.won).toBe(false);
    const none = runSolution({ ...digDown, solution: undefined });
    expect(none.hashMatches).toBe(false);
    expect(none.ended).toBe(true);
  });

  it('a recorded live run exports a solution that verifies', () => {
    const sim = createSim(tunnel);
    while (!sim.ended) {
      const c = sim.creatures[0];
      if (c && c.x === 60 && sim.assignments === 0) expect(assign(sim, 0, 'burrower')).toBe(true);
      step(sim);
    }
    const sol = exportSolution(sim);
    expect(runSolution(tunnel, sol)).toMatchObject({ hashMatches: true, rejected: 0 });
  });

  it('18 000 ticks with 100 creatures headless < 300 ms', () => {
    const timed = (level: LevelDef) => {
      runSolution(level); // warm-up (JIT)
      const t0 = performance.now();
      const r = runSolution(level);
      return { ms: performance.now() - t0, r };
    };
    const solution = { ...busyLog(), finalHash: 0 };
    // Mixed run (skills, trap, crumble) and a crowd where all 100 stay alive for 18 000 ticks.
    const busy = timed({ ...busyLevel(), solution });
    const crowdLevel = { ...busyLevel(false), solution: { ...solution, log: [] } };
    const crowd = timed(crowdLevel);
    expect(busy.r.ticks).toBe(18_000);
    expect(crowd.r.ticks).toBe(18_000);
    const alive = createSim(crowdLevel, { keyframes: false, events: false });
    playLog(alive, crowdLevel.solution);
    expect(alive.spawned - alive.dead - alive.saved).toBe(100);
    const t1 = performance.now();
    playLive(busyLevel());
    const msKeyframes = performance.now() - t1;
    console.info(
      `perf (18000 ticks, 100 creatures): mixed ${busy.ms.toFixed(1)} ms, ` +
        `crowd ${crowd.ms.toFixed(1)} ms, mixed with events + keyframes ${msKeyframes.toFixed(1)} ms`,
    );
    if (process.env.PATHLINGS_COVERAGE !== '1') {
      expect(busy.ms).toBeLessThan(300);
      expect(crowd.ms).toBeLessThan(300);
    }
  }, 30_000);
});
