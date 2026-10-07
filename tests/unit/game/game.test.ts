import { describe, expect, it } from 'vitest';
import { validateLevel } from '../../../src/core/level';
import { runSolution } from '../../../src/core/replay';
import { stateHash } from '../../../src/core/sim';
import type { SimEvent } from '../../../src/core/world';
import { FixedClock, MAX_FRAME_MS, TICK_MS } from '../../../src/game/clock';
import { parseLaunchParams } from '../../../src/game/launchParams';
import { GameSession } from '../../../src/game/session';
import { TEST_LEVELS, crowd, findTestLevel, showcase, tunnel } from '../../../src/levels/test';

describe('FixedClock', () => {
  it('turns real time into whole 60 Hz ticks and keeps the remainder', () => {
    const c = new FixedClock();
    expect(c.advance(TICK_MS * 2.5)).toBe(2);
    expect(c.alpha).toBeCloseTo(0.5);
    expect(c.advance(TICK_MS * 0.5)).toBe(1);
    expect(c.alpha).toBeCloseTo(0);
  });

  it('runs 60 ticks per real second at 1× and scales with speed', () => {
    const c = new FixedClock();
    let ticks = 0;
    for (let i = 0; i < 60; i++) ticks += c.advance(1000 / 60);
    expect(ticks).toBe(60);
    let fast = 0;
    for (let i = 0; i < 60; i++) fast += c.advance(1000 / 60, 4);
    expect(fast).toBe(240);
    let slow = 0;
    for (let i = 0; i < 60; i++) slow += c.advance(1000 / 60, 0.5);
    expect(slow).toBe(30);
  });

  it('caps long frames and ignores invalid ones', () => {
    const c = new FixedClock();
    expect(c.advance(10_000)).toBe(Math.floor(MAX_FRAME_MS / TICK_MS));
    c.reset();
    expect(c.advance(-5)).toBe(0);
    expect(c.advance(Number.NaN)).toBe(0);
    expect(c.advance(100, 0)).toBe(0);
  });
});

describe('GameSession', () => {
  it('autoplaying a solution in real-time frames ends with the golden hash', () => {
    const s = new GameSession(tunnel, { autoplay: tunnel.solution });
    let guard = 0;
    while (!s.sim.ended && guard++ < 100_000) s.frame(1000 / 60);
    expect(s.sim.ended).toBe(true);
    expect(stateHash(s.sim)).toBe(tunnel.solution!.finalHash);
    expect(stateHash(s.sim)).toBe(runSolution(tunnel).hash);
  });

  it('hands every tick’s events to listeners, once each', () => {
    const s = new GameSession(tunnel, { autoplay: tunnel.solution });
    const ticks: number[] = [];
    const events: SimEvent[] = [];
    const off = s.onStep((sim, evs) => {
      ticks.push(sim.tick);
      events.push(...evs);
    });
    s.seek(400);
    expect(ticks).toEqual(Array.from({ length: 400 }, (_, i) => i + 1));
    expect(events.some((e) => e.type === 'spawned')).toBe(true);
    expect(events.some((e) => e.type === 'terrainChanged')).toBe(true);
    expect(s.sim.events).toEqual([]);
    off();
    s.stepOnce();
    expect(ticks).toHaveLength(400);
  });

  it('assigns while paused: logged at the current tick, invalid ones consume nothing', () => {
    const s = new GameSession(crowd);
    s.seek(300);
    s.paused = true;
    expect(s.assign(3, 'warden')).toBe(true);
    expect(s.sim.log).toEqual([{ kind: 'assign', tick: 300, creature: 3, skill: 'warden' }]);
    expect(s.sim.skills.warden).toBe(9);
    expect(s.assign(3, 'warden')).toBe(false);
    expect(s.assign(99, 'warden')).toBe(false);
    expect(s.sim.skills.warden).toBe(9);
    expect(s.frame(1000)).toBe(0);
  });

  it('rewinds: drops later commands, restores stock, notifies listeners', () => {
    const s = new GameSession(tunnel);
    const seen: string[] = [];
    s.onStep((_sim, evs) => evs.forEach((e) => seen.push(e.type)));
    s.seek(100);
    expect(s.assign(0, 'burrower')).toBe(true);
    s.seek(400);
    expect(s.rewindBy(310)).toBe(90);
    expect(s.sim.log).toEqual([]);
    expect(s.sim.skills.burrower).toBe(1);
    expect(seen.at(-1)).toBe('rewound');
    expect(s.rewindBy(10_000)).toBe(0);
    expect(s.rewindBy(5)).toBe(0);
  });

  it('a rewound and replayed run matches a straight run', () => {
    const straight = new GameSession(tunnel, { autoplay: tunnel.solution });
    straight.seek(Infinity);
    const s = new GameSession(tunnel);
    s.seek(152);
    s.assign(0, 'burrower');
    s.seek(500);
    s.rewindBy(200); // back to 300: the assignment at 152 stays
    expect(s.sim.log).toHaveLength(1);
    s.seek(Infinity);
    expect(stateHash(s.sim)).toBe(stateHash(straight.sim));
  });

  it('does not advance while paused', () => {
    const s = new GameSession(tunnel);
    s.paused = true;
    expect(s.frame(1000)).toBe(0);
    expect(s.sim.tick).toBe(0);
    expect(s.alpha).toBe(1);
  });
});

describe('launch params', () => {
  it('defaults to attract mode', () => {
    expect(parseLaunchParams('')).toEqual({
      levelId: null,
      autoplay: false,
      seek: 0,
      paused: false,
      debug: false,
      skill: null,
      filter: 'both',
      autoPause: false,
      editor: false,
    });
  });

  it('parses level, autoplay, seek, pause, debug, skill and filter', () => {
    const q =
      '?level=test-tunnel&autoplay=1&seek=420&pause=1&debug=true&skill=warden&filter=left&autopause=1';
    expect(parseLaunchParams(q)).toEqual({
      levelId: 'test-tunnel',
      autoplay: true,
      seek: 420,
      paused: true,
      debug: true,
      skill: 'warden',
      filter: 'left',
      autoPause: true,
      editor: false,
    });
  });

  it('rejects bad seek values and false flags', () => {
    const p = parseLaunchParams('?seek=-3&pause=0&autoplay=false');
    expect(p.seek).toBe(0);
    expect(p.paused).toBe(false);
    expect(p.autoplay).toBe(false);
    expect(parseLaunchParams('?seek=abc').seek).toBe(0);
    expect(parseLaunchParams('?skill=bogus').skill).toBeNull();
    expect(parseLaunchParams('?filter=up').filter).toBe('both');
    expect(parseLaunchParams('?filter=right').filter).toBe('right');
  });
});

describe('test levels', () => {
  it('can be found by id', () => {
    for (const l of TEST_LEVELS) expect(findTestLevel(l.id)).toBe(l);
    expect(findTestLevel('nope')).toBeUndefined();
  });

  it('the renderer showcase is a valid level using every object type and material', () => {
    expect(validateLevel(showcase)).toEqual([]);
    const types = new Set(showcase.objects.map((o) => o.type));
    expect(types).toEqual(
      new Set(['entrance', 'exit', 'water', 'lava', 'trap', 'teleport', 'bounce']),
    );
    const materials = new Set(showcase.ops.map((o) => ('m' in o ? o.m : -1)));
    for (let m = 1; m <= 6; m++) expect(materials.has(m as never)).toBe(true);
  });
});
