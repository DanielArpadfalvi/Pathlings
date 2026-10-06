import { describe, expect, it } from 'vitest';
import {
  CREATURE_FIELDS,
  CreatureState,
  EXIT_TICKS,
  FNV_OFFSET,
  MAX_STEP_DOWN,
  MAX_STEP_UP,
  SAFE_FALL,
  WALK_TICKS,
  bodyCenter,
  bodyRect,
  createCreature,
  deathCauseCode,
  hashCreature,
  isGroundState,
  packCreatures,
  stateName,
  unpackCreatures,
} from '../../../src/core';
import {
  FIRST_SPAWN_TICK,
  adjustReleaseInterval,
  assign,
  canAssign,
  createSim,
  drainEvents,
  liveCount,
  nextSpawnTick,
  releaseBounds,
  setReleaseInterval,
  step,
  timeLeftTicks,
  waitingCount,
} from '../../../src/core/sim';
import { createLevel, emptySkillSet } from '../../../src/core/level';
import { flat, paint, rowsSim, run, runUntil, spawn, walker } from './simHelpers';

describe('walking', () => {
  it('walks 1 px every 3 ticks', () => {
    const sim = rowsSim(flat(60, 30, 20));
    const c = walker(sim, 10, 20, 1);
    run(sim, WALK_TICKS - 1);
    expect(c.x).toBe(10);
    run(sim, 1);
    expect(c.x).toBe(11);
    run(sim, 30 - WALK_TICKS);
    expect(c.x).toBe(20);
    expect(c.y).toBe(20);
    expect(c.state).toBe(CreatureState.Walk);
  });

  it('walks left too', () => {
    const sim = rowsSim(flat(60, 30, 20));
    const c = walker(sim, 30, 20, -1);
    run(sim, 30);
    expect(c.x).toBe(20);
  });

  it(`steps up to ${MAX_STEP_UP} px`, () => {
    const rows = paint(flat(60, 30, 20), 15, 20 - MAX_STEP_UP, 45, MAX_STEP_UP, '#');
    const sim = rowsSim(rows);
    const c = walker(sim, 10, 20, 1);
    runUntil(sim, () => c.x === 15);
    expect(c.y).toBe(20 - MAX_STEP_UP);
    expect(c.state).toBe(CreatureState.Walk);
    run(sim, 30);
    expect(c.x).toBe(25);
    expect(c.dir).toBe(1);
  });

  it(`turns at a wall of ${MAX_STEP_UP + 1} px`, () => {
    const rows = paint(flat(60, 30, 20), 15, 20 - MAX_STEP_UP - 1, 45, MAX_STEP_UP + 1, '#');
    const sim = rowsSim(rows);
    const c = walker(sim, 10, 20, 1);
    runUntil(sim, () => c.dir === -1);
    expect(c.x).toBe(14);
    expect(c.y).toBe(20);
    run(sim, 30);
    expect(c.x).toBe(4);
  });

  it(`steps down up to ${MAX_STEP_DOWN} px while walking, falls from deeper edges`, () => {
    // Floor at 20 for x < 15, at 23 for 15 ≤ x < 30, at 30 for x ≥ 30.
    let rows = flat(60, 40, 30);
    rows = paint(rows, 0, 20, 15, 10, '#');
    rows = paint(rows, 15, 23, 15, 7, '#');
    const sim = rowsSim(rows);
    const c = walker(sim, 12, 20, 1);
    runUntil(sim, () => c.x === 15);
    expect(c.y).toBe(23);
    expect(c.state).toBe(CreatureState.Walk);
    runUntil(sim, () => c.x === 30);
    expect(c.state).toBe(CreatureState.Fall);
    runUntil(sim, () => c.state === CreatureState.Walk);
    expect(c.y).toBe(30);
  });

  it('falls when the ground disappears below a walker', () => {
    const sim = rowsSim(flat(30, 40, 20));
    const c = walker(sim, 10, 20, 1);
    sim.terrain.cells.fill(0, 20 * 30, 30 * 30); // remove rows 20…29, floor at 30
    step(sim);
    expect(c.state).toBe(CreatureState.Fall);
    expect(c.y).toBe(21);
  });
});

describe('falling', () => {
  it('falls 1 px per tick and lands', () => {
    const sim = rowsSim(flat(20, 40, 30));
    const c = spawn(sim, 5, 10);
    run(sim, 10);
    expect(c.y).toBe(20);
    expect(c.state).toBe(CreatureState.Fall);
    run(sim, 10);
    expect(c.y).toBe(30);
    expect(c.fallen).toBe(20);
    expect(c.state).toBe(CreatureState.Walk);
  });

  it(`survives a ${SAFE_FALL} px fall`, () => {
    const sim = rowsSim(flat(20, 80, 10 + SAFE_FALL));
    const c = spawn(sim, 5, 10);
    run(sim, SAFE_FALL + 1);
    expect(c.state).toBe(CreatureState.Walk);
    expect(c.y).toBe(10 + SAFE_FALL);
  });

  it(`dies after a ${SAFE_FALL + 1} px fall`, () => {
    const sim = rowsSim(flat(20, 80, 11 + SAFE_FALL));
    const c = spawn(sim, 5, 10);
    drainEvents(sim);
    run(sim, SAFE_FALL + 2);
    expect(c.state).toBe(CreatureState.Dead);
    expect(c.cause).toBe(deathCauseCode('fall'));
    expect(sim.dead).toBe(1);
    expect(drainEvents(sim).find((e) => e.type === 'died')).toMatchObject({
      cause: 'fall',
      id: 0,
    });
  });
});

describe('exit', () => {
  it(`enters the exit zone, needs ${EXIT_TICKS} ticks, then counts as saved`, () => {
    const sim = rowsSim(flat(60, 30, 20), [{ type: 'exit', x: 20, y: 8 }]);
    const c = walker(sim, 10, 20, 1);
    runUntil(sim, () => c.state === CreatureState.Exiting);
    expect(c.x).toBe(20);
    expect(canAssign(sim, c.id, 'delver')).toBe(false);
    expect(assign(sim, c.id, 'popper')).toBe(false);
    run(sim, EXIT_TICKS - 1);
    expect(c.state).toBe(CreatureState.Exiting);
    expect(sim.saved).toBe(0);
    step(sim);
    expect(c.state).toBe(CreatureState.Saved);
    expect(sim.saved).toBe(1);
    expect(c.x).toBe(20);
    expect(sim.ended).toBe(true);
  });

  it('catches falling creatures too', () => {
    const sim = rowsSim(flat(40, 80, 70), [{ type: 'exit', x: 0, y: 30 }]);
    const c = spawn(sim, 5, 0);
    runUntil(sim, () => c.state !== CreatureState.Fall);
    expect(c.state).toBe(CreatureState.Exiting);
    expect(c.y).toBe(30);
  });
});

describe('deaths', () => {
  it('drowns in water', () => {
    const rows = paint(flat(60, 40, 20), 20, 20, 10, 20, '.');
    const sim = rowsSim(rows, [{ type: 'water', x: 20, y: 30, w: 10, h: 10 }]);
    const c = walker(sim, 10, 20, 1);
    runUntil(sim, () => c.state === CreatureState.Dead);
    expect(c.cause).toBe(deathCauseCode('water'));
    expect(c.y).toBe(30); // the foot point enters the water's top row
  });

  it('burns in lava', () => {
    const sim = rowsSim(flat(60, 40, 20), [{ type: 'lava', x: 20, y: 18, w: 10, h: 2 }]);
    const c = walker(sim, 10, 20, 1);
    runUntil(sim, () => c.state === CreatureState.Dead);
    expect(c.cause).toBe(deathCauseCode('lava'));
    expect(c.x).toBe(20);
  });

  it('dies when walking out at the side', () => {
    const sim = rowsSim(flat(30, 40, 20));
    const c = walker(sim, 2, 20, -1);
    runUntil(sim, () => c.state === CreatureState.Dead);
    expect(c.x).toBe(-1);
    expect(c.cause).toBe(deathCauseCode('outOfBounds'));
  });

  it('dies when falling out at the bottom', () => {
    const sim = rowsSim(flat(30, 40, 41));
    const c = spawn(sim, 5, 30);
    run(sim, 9);
    expect(c.state).toBe(CreatureState.Fall);
    step(sim);
    expect(c.y).toBe(40);
    expect(c.state).toBe(CreatureState.Dead);
    expect(c.cause).toBe(deathCauseCode('outOfBounds'));
  });
});

describe('release', () => {
  const level = (overrides = {}) =>
    createLevel({
      w: 160,
      h: 240,
      ops: [{ op: 'rect', m: 1, x: 0, y: 200, w: 160, h: 40 }],
      objects: [
        { type: 'entrance', x: 40, y: 190, dir: 1 },
        { type: 'exit', x: 140, y: 188 },
      ],
      creatures: 5,
      required: 1,
      master: 1,
      minReleaseTicks: 40,
      ...overrides,
    });

  it('releases the first creature at FIRST_SPAWN_TICK, then every interval', () => {
    const sim = createSim(level());
    const spawnTicks: number[] = [];
    while (sim.spawned < 5) {
      step(sim);
      for (const e of drainEvents(sim)) if (e.type === 'spawned') spawnTicks.push(e.tick);
    }
    expect(spawnTicks).toEqual([30, 70, 110, 150, 190].map((t) => t - 30 + FIRST_SPAWN_TICK));
    expect(sim.creatures[0]).toMatchObject({ id: 0, dir: 1 });
    expect(waitingCount(sim)).toBe(0);
  });

  it('spawned creatures fall from the entrance and walk', () => {
    const sim = createSim(level());
    run(sim, FIRST_SPAWN_TICK + 1);
    const c = sim.creatures[0]!;
    expect(c.state).toBe(CreatureState.Fall);
    run(sim, 10);
    expect(c.state).toBe(CreatureState.Walk);
    expect(c.y).toBe(200);
  });

  it('+/− stays within [min rate, 4× min rate]', () => {
    const sim = createSim(level());
    expect(releaseBounds(sim)).toEqual({ fastest: 10, slowest: 40 });
    expect(adjustReleaseInterval(sim, +5)).toBe(false); // already the slowest
    expect(setReleaseInterval(sim, 1)).toBe(true);
    expect(sim.releaseInterval).toBe(10);
    expect(adjustReleaseInterval(sim, -1)).toBe(false);
    expect(adjustReleaseInterval(sim, 5)).toBe(true);
    expect(sim.releaseInterval).toBe(15);
    expect(setReleaseInterval(sim, 1000)).toBe(true);
    expect(sim.releaseInterval).toBe(40);
    expect(setReleaseInterval(sim, 2.5)).toBe(false);
    // Changes within one tick collapse into one log entry.
    expect(sim.releaseChanges).toEqual([{ tick: 0, interval: 40 }]);
  });

  it('a faster rate releases sooner', () => {
    const sim = createSim(level());
    run(sim, FIRST_SPAWN_TICK + 1);
    expect(nextSpawnTick(sim)).toBe(FIRST_SPAWN_TICK + 40);
    setReleaseInterval(sim, 10);
    expect(nextSpawnTick(sim)).toBe(FIRST_SPAWN_TICK + 10);
    run(sim, 10);
    expect(sim.spawned).toBe(2);
    expect(sim.releaseChanges).toEqual([{ tick: FIRST_SPAWN_TICK + 1, interval: 10 }]);
  });

  it('ends when everyone is saved, reporting the result', () => {
    const sim = createSim(level({ creatures: 2, required: 2, master: 2 }));
    runUntil(sim, () => sim.ended, 5000);
    expect(sim.endReason).toBe('done');
    expect(sim.saved).toBe(2);
    expect(liveCount(sim)).toBe(0);
    const ev = drainEvents(sim).find((e) => e.type === 'levelEnded');
    expect(ev).toMatchObject({ won: true, saved: 2, required: 2, reason: 'done' });
    const tick = sim.tick;
    step(sim);
    expect(sim.tick).toBe(tick);
  });

  it('ends when the time runs out', () => {
    const sim = createSim(
      level({
        ops: [
          { op: 'rect', m: 1, x: 0, y: 200, w: 160, h: 40 },
          { op: 'rect', m: 3, x: 0, y: 100, w: 4, h: 100 },
          { op: 'rect', m: 3, x: 156, y: 100, w: 4, h: 100 },
        ],
        objects: [{ type: 'entrance', x: 40, y: 190, dir: 1 }],
        timeLimitTicks: 7200,
      }),
    );
    runUntil(sim, () => sim.ended, 8000);
    expect(sim.tick).toBe(7200);
    expect(sim.endReason).toBe('time');
    expect(timeLeftTicks(sim)).toBe(0);
  });
});

describe('creature data', () => {
  it('packs, unpacks and hashes every field', () => {
    const a = createCreature(3, 10, 20, -1);
    Object.assign(a, { state: CreatureState.Build, timer: 5, counter: 7, fallen: 2, perm: 3 });
    Object.assign(a, { popTimer: 99, skillsUsed: 2, lastTeleport: 1, cause: 0 });
    const b = createCreature(4, 1, 2, 1);
    const packed = packCreatures([a, b]);
    expect(packed.length).toBe(2 * CREATURE_FIELDS);
    expect(unpackCreatures(packed)).toEqual([a, b]);
    const h = hashCreature(FNV_OFFSET, a);
    for (const key of Object.keys(a) as (keyof typeof a)[]) {
      const copy = { ...a, [key]: (a[key] as number) + 1 };
      expect(hashCreature(FNV_OFFSET, copy), key).not.toBe(h);
    }
  });

  it('helpers', () => {
    const c = createCreature(0, 10, 20, 0);
    expect(c.dir).toBe(1);
    expect(stateName(c)).toBe('fall');
    expect(bodyRect(c)).toEqual({ x: 8, y: 11, w: 5, h: 9 });
    expect(bodyCenter(c)).toEqual({ x: 10, y: 15 });
    expect(isGroundState(CreatureState.Walk)).toBe(true);
    expect(isGroundState(CreatureState.Delve)).toBe(true);
    expect(isGroundState(CreatureState.Fall)).toBe(false);
    expect(isGroundState(CreatureState.Exiting)).toBe(false);
  });
});

describe('level setup', () => {
  it('uses the level stock and rasterized terrain', () => {
    const def = createLevel({
      w: 160,
      h: 240,
      ops: [{ op: 'rect', m: 1, x: 0, y: 200, w: 160, h: 40 }],
      skills: { ...emptySkillSet(), mason: 3 },
    });
    const sim = createSim(def);
    expect(sim.skills.mason).toBe(3);
    expect(sim.terrain.cells[200 * 160]).toBe(1);
    sim.skills.mason = 0;
    expect(def.skills.mason).toBe(3);
  });
});
