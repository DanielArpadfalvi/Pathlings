import { describe, expect, it } from 'vitest';
import { CreatureState, deathCauseCode } from '../../../src/core/creature';
import { BOUNCE_HEIGHT } from '../../../src/core/movement';
import { TRAP_RELOAD_TICKS, trapArmed, zoneHit } from '../../../src/core/objects';
import { drainEvents, step } from '../../../src/core/sim';
import { flat, paint, rowsSim, run, runUntil, spawn, walker } from './simHelpers';

function arena(w: number, h: number, ground: number): string[] {
  let rows = flat(w, h, ground);
  rows = paint(rows, 0, 0, 2, ground, '3');
  return paint(rows, w - 2, 0, 2, ground, '3');
}

describe('zones', () => {
  it('hit by the foot point or the pixel above it', () => {
    const r = { x: 10, y: 10, w: 4, h: 4 };
    const at = (x: number, y: number) => zoneHit(r, { x, y } as never);
    expect(at(10, 10)).toBe(true);
    expect(at(13, 14)).toBe(true); // (13, 13) is inside
    expect(at(13, 15)).toBe(false);
    expect(at(14, 12)).toBe(false);
    expect(at(10, 9)).toBe(false);
  });
});

describe('entrances', () => {
  it('multiple entrances release in turn, in definition order', () => {
    const sim = rowsSim(
      arena(120, 60, 40),
      [
        { type: 'entrance', x: 20, y: 30, dir: 1 },
        { type: 'entrance', x: 90, y: 25, dir: -1 },
      ],
      { creatures: 5, minReleaseTicks: 10 },
    );
    const spawned: { id: number; entrance: number }[] = [];
    runUntil(sim, () => sim.spawned === 5);
    for (const e of drainEvents(sim)) if (e.type === 'spawned') spawned.push(e);
    expect(spawned.map((e) => e.entrance)).toEqual([0, 1, 0, 1, 0]);
    const first = sim.creatures.map((c) => c.dir);
    expect(first).toEqual([1, -1, 1, -1, 1]);
    // Same setup, same result (deterministic).
    const again = rowsSim(
      arena(120, 60, 40),
      [
        { type: 'entrance', x: 20, y: 30, dir: 1 },
        { type: 'entrance', x: 90, y: 25, dir: -1 },
      ],
      { creatures: 5, minReleaseTicks: 10 },
    );
    runUntil(again, () => again.spawned === 5);
    expect(again.creatures).toEqual(sim.creatures);
  });
});

describe('trap', () => {
  it(`kills one creature, then needs ${TRAP_RELOAD_TICKS} ticks to re-arm`, () => {
    const sim = rowsSim(arena(120, 50, 30), [{ type: 'trap', x: 30, y: 20 }]);
    const a = walker(sim, 20, 30, 1);
    const b = walker(sim, 15, 30, 1);
    const c = walker(sim, 110, 30, -1);
    runUntil(sim, () => a.state === CreatureState.Dead);
    expect(a.cause).toBe(deathCauseCode('trap'));
    const fired = sim.tick - 1;
    expect(trapArmed(sim, 0)).toBe(false);
    expect(sim.trapReadyAt[0]).toBe(fired + TRAP_RELOAD_TICKS);
    runUntil(sim, () => b.x === 40);
    expect(b.state).toBe(CreatureState.Walk);
    runUntil(sim, () => c.state === CreatureState.Dead);
    expect(c.x).toBe(39);
    expect(sim.tick - 1).toBeGreaterThanOrEqual(fired + TRAP_RELOAD_TICKS);
    expect(b.state).toBe(CreatureState.Walk);
    const fires = drainEvents(sim).filter((e) => e.type === 'trapFired');
    expect(fires.map((e) => e.id)).toEqual([0, 2]);
  });
});

describe('teleporter', () => {
  it('moves the creature to its destination keeping the direction', () => {
    const sim = rowsSim(arena(160, 50, 30), [{ type: 'teleport', x: 40, y: 18, tx: 100, ty: 30 }]);
    const c = walker(sim, 30, 30, 1);
    runUntil(sim, () => c.x === 100);
    expect(c.dir).toBe(1);
    expect(drainEvents(sim).some((e) => e.type === 'teleported')).toBe(true);
    step(sim);
    expect(c.state).toBe(CreatureState.Walk);
    run(sim, 3);
    expect(c.x).toBe(101);
  });

  it('a two-way pair does not bounce the creature back and forth', () => {
    const sim = rowsSim(arena(160, 50, 30), [
      { type: 'teleport', x: 40, y: 18, tx: 104, ty: 30 },
      { type: 'teleport', x: 100, y: 18, tx: 44, ty: 30 },
    ]);
    const c = walker(sim, 30, 30, 1);
    runUntil(sim, () => c.x === 104);
    expect(c.lastTeleport).toBe(1);
    runUntil(sim, () => c.x === 108);
    expect(c.lastTeleport).toBe(-1);
    // Walks to the right wall, turns, comes back through the second zone to (44, 30).
    runUntil(sim, () => c.dir === -1 && c.x === 44, 2000);
    expect(c.lastTeleport).toBe(0);
    run(sim, 30); // 1 tick to land, then 1 px / 3 ticks
    expect(c.x).toBe(35);
    expect(c.dir).toBe(-1);
  });

  it('cancels an active skill but keeps permanent ones', () => {
    const sim = rowsSim(arena(160, 50, 30), [{ type: 'teleport', x: 40, y: 18, tx: 100, ty: 30 }]);
    const c = walker(sim, 37, 30, 1);
    c.perm = 1;
    c.state = CreatureState.Build;
    c.counter = 12;
    runUntil(sim, () => c.x >= 100);
    expect(c.perm).toBe(1);
    expect(c.state).not.toBe(CreatureState.Build);
  });
});

describe('bounce pad', () => {
  it(`launches walkers ${BOUNCE_HEIGHT} px up (drifting forward) and they land safely`, () => {
    const sim = rowsSim(arena(120, 100, 70), [{ type: 'bounce', x: 30, y: 66 }]);
    const c = walker(sim, 20, 70, 1);
    runUntil(sim, () => c.state === CreatureState.Bounce);
    expect(c.x).toBe(30);
    let minY = c.y;
    runUntil(sim, () => {
      minY = Math.min(minY, c.y);
      return c.state === CreatureState.Walk;
    });
    expect(minY).toBe(70 - BOUNCE_HEIGHT);
    expect(c.y).toBe(70);
    expect(c.x).toBe(30 + BOUNCE_HEIGHT / 2);
  });

  it('catches a deadly fall', () => {
    const sim = rowsSim(arena(120, 100, 70), [{ type: 'bounce', x: 30, y: 66 }]);
    const c = spawn(sim, 35, 0, 1);
    runUntil(sim, () => c.state === CreatureState.Bounce);
    expect(c.y).toBe(66);
    runUntil(sim, () => c.state === CreatureState.Walk || c.state === CreatureState.Dead);
    expect(c.state).toBe(CreatureState.Walk);
  });

  it('a ceiling ends the rise early; walls reverse the drift', () => {
    let rows = arena(120, 100, 70);
    rows = paint(rows, 25, 45, 30, 1, '3');
    rows = paint(rows, 36, 50, 2, 20, '3');
    const sim = rowsSim(rows, [{ type: 'bounce', x: 30, y: 66 }]);
    const c = walker(sim, 20, 70, 1);
    runUntil(sim, () => c.state === CreatureState.Bounce);
    runUntil(sim, () => c.state !== CreatureState.Bounce);
    expect(c.y).toBe(55); // head row 46 directly below the ceiling row 45
    expect(c.dir).toBe(-1);
  });
});
