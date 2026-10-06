import { describe, expect, it } from 'vitest';
import {
  CreatureState,
  PERM_GLIDER,
  PERM_SCALER,
  deathCauseCode,
} from '../../../src/core/creature';
import { SKILLS } from '../../../src/core/level';
import {
  BURROW_TICKS,
  CLIMB_TICKS,
  CRATER_RADIUS,
  DELVE_TICKS,
  GLIDE_OPEN_FALL,
  GLIDE_TICKS,
  MASON_PLANKS,
  MASON_PLANK_TICKS,
  POPPER_TICKS,
  SKILL_BEHAVIORS,
  SLOPE_TICKS,
  canTakeSkill,
  fuseSeconds,
  masonRunningOut,
  wardenZone,
} from '../../../src/core/skills';
import { assign, canAssign, drainEvents, popAll, step } from '../../../src/core/sim';
import { AIR, METAL, ONEWAY_LEFT, ROCK, SOIL, materialAt } from '../../../src/core/terrain';
import type { Sim } from '../../../src/core/world';
import { flat, paint, rowsSim, run, runUntil, spawn, walker } from './simHelpers';

/** Whether every cell of a rect has material `m`. */
function allOf(sim: Sim, x: number, y: number, w: number, h: number, m: number): boolean {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) if (materialAt(sim.terrain, xx, yy) !== m) return false;
  return true;
}

/** Ground at row 30, walls (metal) at both ends. */
function arena(w = 80, h = 50): string[] {
  let rows = flat(w, h, 30);
  rows = paint(rows, 0, 0, 2, 30, '3');
  return paint(rows, w - 2, 0, 2, 30, '3');
}

describe('assignment rules', () => {
  it('rejects unknown, unreleased and finished creatures without consuming stock', () => {
    const sim = rowsSim(arena());
    const c = walker(sim, 10, 30);
    expect(canAssign(sim, 1, 'delver')).toBe(false);
    expect(canAssign(sim, -1, 'delver')).toBe(false);
    expect(canAssign(sim, 0.5, 'delver')).toBe(false);
    expect(assign(sim, 7, 'delver')).toBe(false);
    c.state = CreatureState.Dead;
    expect(assign(sim, 0, 'delver')).toBe(false);
    expect(sim.skills.delver).toBe(10);
    expect(sim.log).toEqual([]);
    expect(sim.assignments).toBe(0);
  });

  it('needs stock', () => {
    const sim = rowsSim(arena());
    walker(sim, 10, 30);
    sim.skills.mason = 0;
    expect(canAssign(sim, 0, 'mason')).toBe(false);
    expect(assign(sim, 0, 'mason')).toBe(false);
    expect(sim.skills.mason).toBe(0);
  });

  it('active skills need ground: a falling creature cannot take a Delver', () => {
    const sim = rowsSim(arena());
    spawn(sim, 10, 5);
    for (const s of ['warden', 'mason', 'burrower', 'sloper', 'delver'] as const) {
      expect(canAssign(sim, 0, s), s).toBe(false);
      expect(assign(sim, 0, s)).toBe(false);
      expect(sim.skills[s]).toBe(10);
    }
    for (const s of ['scaler', 'glider', 'popper'] as const)
      expect(canAssign(sim, 0, s)).toBe(true);
  });

  it('a valid assignment consumes stock, is logged and emits an event', () => {
    const sim = rowsSim(arena());
    walker(sim, 10, 30);
    run(sim, 5);
    drainEvents(sim);
    expect(assign(sim, 0, 'delver')).toBe(true);
    expect(sim.skills.delver).toBe(9);
    expect(sim.assignments).toBe(1);
    expect(sim.creatures[0]!.skillsUsed).toBe(1);
    expect(sim.log).toEqual([{ kind: 'assign', tick: 5, creature: 0, skill: 'delver' }]);
    expect(drainEvents(sim)).toEqual([{ type: 'skillAssigned', tick: 5, id: 0, skill: 'delver' }]);
    // The same active skill again is invalid.
    expect(assign(sim, 0, 'delver')).toBe(false);
    expect(sim.skills.delver).toBe(9);
  });

  it('permanent skills stack with each other and one active skill ("all-rounder")', () => {
    const sim = rowsSim(arena());
    const c = walker(sim, 10, 30);
    expect(assign(sim, 0, 'scaler')).toBe(true);
    expect(assign(sim, 0, 'scaler')).toBe(false);
    expect(assign(sim, 0, 'glider')).toBe(true);
    expect(assign(sim, 0, 'glider')).toBe(false);
    expect(assign(sim, 0, 'burrower')).toBe(true);
    expect(c.perm).toBe(PERM_SCALER | PERM_GLIDER);
    expect(c.state).toBe(CreatureState.Burrow);
    // An active skill replaces another active one.
    expect(assign(sim, 0, 'delver')).toBe(true);
    expect(c.state).toBe(CreatureState.Delve);
    expect(c.perm).toBe(PERM_SCALER | PERM_GLIDER);
    expect(c.skillsUsed).toBe(4);
  });

  it('skill behaviours flag the permanent ones', () => {
    expect(SKILLS.filter((s) => SKILL_BEHAVIORS[s].permanent)).toEqual(['scaler', 'glider']);
    const sim = rowsSim(arena());
    const c = walker(sim, 10, 30);
    c.state = CreatureState.Exiting;
    for (const s of SKILLS) expect(canTakeSkill(c, s)).toBe(false);
  });

  it('nothing can be assigned after the level ended', () => {
    const sim = rowsSim(arena());
    walker(sim, 10, 30);
    sim.ended = true;
    expect(canAssign(sim, 0, 'popper')).toBe(false);
  });
});

describe('Scaler', () => {
  it(`climbs a wall at 1 px / ${CLIMB_TICKS} ticks and walks on at the top`, () => {
    const rows = paint(arena(), 20, 10, 10, 20, '#');
    const sim = rowsSim(rows);
    const c = walker(sim, 15, 30);
    assign(sim, 0, 'scaler');
    runUntil(sim, () => c.state === CreatureState.Climb);
    expect(c.x).toBe(19);
    run(sim, 10 * CLIMB_TICKS);
    expect(c.y).toBe(20);
    expect(c.state).toBe(CreatureState.Climb);
    run(sim, 10 * CLIMB_TICKS);
    expect(c.state).toBe(CreatureState.Walk);
    expect(c.x).toBe(20);
    expect(c.y).toBe(10);
    expect(c.dir).toBe(1);
  });

  it('falls back and turns at an overhang', () => {
    let rows = paint(arena(), 20, 0, 10, 30, '#');
    rows = paint(rows, 15, 12, 5, 1, '#');
    const sim = rowsSim(rows);
    const c = walker(sim, 15, 30);
    assign(sim, 0, 'scaler');
    runUntil(sim, () => c.state === CreatureState.Climb);
    runUntil(sim, () => c.state !== CreatureState.Climb);
    expect(c.state).toBe(CreatureState.Fall);
    expect(c.y).toBe(22); // head just below the ledge at row 12
    expect(c.dir).toBe(-1);
    runUntil(sim, () => c.state === CreatureState.Walk);
    expect(c.y).toBe(30);
  });

  it('without the skill the creature turns at the same wall', () => {
    const rows = paint(arena(), 20, 10, 10, 20, '#');
    const sim = rowsSim(rows);
    const c = walker(sim, 15, 30);
    runUntil(sim, () => c.dir === -1);
    expect(c.state).toBe(CreatureState.Walk);
  });
});

describe('Glider', () => {
  it(`opens after ${GLIDE_OPEN_FALL} px, sinks 1 px / ${GLIDE_TICKS} ticks, survives any height`, () => {
    const sim = rowsSim(flat(20, 160, 150));
    const c = spawn(sim, 10, 0);
    assign(sim, 0, 'glider');
    run(sim, GLIDE_OPEN_FALL - 1);
    expect(c.state).toBe(CreatureState.Fall);
    step(sim);
    expect(c.state).toBe(CreatureState.Glide);
    expect(c.y).toBe(GLIDE_OPEN_FALL);
    run(sim, 30 * GLIDE_TICKS);
    expect(c.y).toBe(GLIDE_OPEN_FALL + 30);
    runUntil(sim, () => c.state !== CreatureState.Glide);
    expect(c.state).toBe(CreatureState.Walk);
    expect(c.y).toBe(150);
  });

  it('can be given mid-fall and saves from a deadly drop', () => {
    const sim = rowsSim(flat(20, 160, 150));
    const c = spawn(sim, 10, 0);
    run(sim, 50);
    expect(assign(sim, 0, 'glider')).toBe(true);
    step(sim);
    expect(c.state).toBe(CreatureState.Glide);
    runUntil(sim, () => c.state !== CreatureState.Glide);
    expect(c.state).toBe(CreatureState.Walk);
  });

  it('a glider standing on ground walks', () => {
    const sim = rowsSim(flat(20, 40, 30));
    const c = spawn(sim, 10, 30);
    c.perm = PERM_GLIDER;
    c.state = CreatureState.Glide;
    step(sim);
    expect(c.state).toBe(CreatureState.Walk);
  });

  it('without it the same drop kills', () => {
    const sim = rowsSim(flat(20, 160, 150));
    const c = spawn(sim, 10, 0);
    runUntil(sim, () => c.state !== CreatureState.Fall);
    expect(c.state).toBe(CreatureState.Dead);
  });
});

describe('Popper', () => {
  it(`explodes exactly ${POPPER_TICKS} ticks after assignment`, () => {
    const sim = rowsSim(arena());
    const c = walker(sim, 30, 30);
    assign(sim, 0, 'warden');
    expect(assign(sim, 0, 'popper')).toBe(true);
    expect(fuseSeconds(c)).toBe(5);
    expect(assign(sim, 0, 'popper')).toBe(false);
    run(sim, POPPER_TICKS - 1);
    expect(c.state).toBe(CreatureState.Warden);
    expect(fuseSeconds(c)).toBe(1);
    step(sim);
    expect(c.state).toBe(CreatureState.Dead);
    expect(c.cause).toBe(deathCauseCode('popped'));
    expect(fuseSeconds(c)).toBe(0);
  });

  it(`leaves a crater of radius ${CRATER_RADIUS} that keeps metal`, () => {
    let rows = flat(60, 60, 20);
    rows = paint(rows, 28, 22, 5, 3, '3');
    const sim = rowsSim(rows);
    const c = walker(sim, 30, 20);
    assign(sim, 0, 'warden');
    assign(sim, 0, 'popper');
    drainEvents(sim);
    run(sim, POPPER_TICKS);
    expect(c.state).toBe(CreatureState.Dead);
    // Centre (30, 15): soil inside the disc is gone …
    expect(materialAt(sim.terrain, 30, 26)).toBe(AIR);
    expect(materialAt(sim.terrain, 20, 20)).toBe(AIR);
    // … metal stays, soil outside the radius stays.
    expect(allOf(sim, 28, 22, 5, 3, METAL)).toBe(true);
    expect(materialAt(sim.terrain, 30, 28)).toBe(SOIL);
    expect(materialAt(sim.terrain, 17, 20)).toBe(SOIL);
    const ev = drainEvents(sim);
    expect(ev.find((e) => e.type === 'terrainChanged')).toMatchObject({
      rect: { x: 19, y: 20, w: 23, h: 8 },
    });
    expect(ev.find((e) => e.type === 'died')).toMatchObject({ cause: 'popped' });
  });

  it('works on a falling creature; pop all turns everyone and stops the release', () => {
    const sim = rowsSim(arena(), [{ type: 'entrance', x: 40, y: 20, dir: 1 }], {
      creatures: 5,
      minReleaseTicks: 40,
    });
    runUntil(sim, () => sim.spawned === 2);
    expect(assign(sim, 1, 'popper')).toBe(true);
    run(sim, 20);
    expect(popAll(sim)).toBe(true);
    expect(popAll(sim)).toBe(false);
    expect(sim.creatures.map((c) => c.popTimer)).toEqual([POPPER_TICKS, POPPER_TICKS - 20]);
    expect(sim.log.at(-1)).toEqual({ kind: 'popAll', tick: sim.tick });
    runUntil(sim, () => sim.ended);
    expect(sim.spawned).toBe(2);
    expect(sim.dead).toBe(2);
    expect(sim.endReason).toBe('done');
  });
});

describe('Warden', () => {
  it('turns walkers from both sides and stays put', () => {
    const sim = rowsSim(arena());
    const w = walker(sim, 40, 30);
    assign(sim, 0, 'warden');
    expect(wardenZone(w)).toEqual({ x: 37, y: 19, w: 7, h: 11 });
    const a = walker(sim, 25, 30, 1);
    const b = walker(sim, 55, 30, -1);
    let maxA = 0;
    let minB = 99;
    for (let i = 0; i < 600; i++) {
      step(sim);
      maxA = Math.max(maxA, a.x);
      minB = Math.min(minB, b.x);
    }
    expect(maxA).toBe(37);
    expect(minB).toBe(43);
    expect(w.state).toBe(CreatureState.Warden);
    expect(w.x).toBe(40);
  });

  it('is freed when dug out from below', () => {
    const sim = rowsSim(arena());
    const w = walker(sim, 40, 30);
    assign(sim, 0, 'warden');
    const a = walker(sim, 30, 30, 1);
    runUntil(sim, () => a.dir === -1);
    expect(a.x).toBe(37);
    assign(sim, 1, 'delver');
    runUntil(sim, () => w.state !== CreatureState.Warden);
    // Its foot pixel was dug away: it drops 1 px onto the next row and walks.
    expect(w.state).toBe(CreatureState.Walk);
    expect(w.y).toBe(31);
    expect(assign(sim, 0, 'warden')).toBe(true);
  });

  it('cannot be given to a falling or climbing creature', () => {
    const sim = rowsSim(arena());
    const c = spawn(sim, 20, 5);
    expect(canAssign(sim, 0, 'warden')).toBe(false);
    c.state = CreatureState.Climb;
    expect(canAssign(sim, 0, 'warden')).toBe(false);
    c.state = CreatureState.Warden;
    expect(canAssign(sim, 0, 'mason')).toBe(false);
    expect(canAssign(sim, 0, 'popper')).toBe(true);
  });
});

describe('Mason', () => {
  it(`builds ${MASON_PLANKS} planks (6×1, +2 forward, +1 up, ${MASON_PLANK_TICKS} ticks each)`, () => {
    const sim = rowsSim(arena(80, 50));
    const c = walker(sim, 10, 30);
    assign(sim, 0, 'mason');
    drainEvents(sim);
    step(sim);
    expect(allOf(sim, 10, 29, 6, 1, SOIL)).toBe(true);
    run(sim, MASON_PLANK_TICKS - 1);
    expect([c.x, c.y]).toEqual([12, 29]);
    run(sim, MASON_PLANK_TICKS * (MASON_PLANKS - 1));
    expect(c.state).toBe(CreatureState.Walk);
    expect([c.x, c.y]).toEqual([10 + 2 * MASON_PLANKS, 30 - MASON_PLANKS]);
    for (let k = 0; k < MASON_PLANKS; k++) {
      expect(allOf(sim, 10 + 2 * k, 29 - k, 6, 1, SOIL), `plank ${k}`).toBe(true);
    }
    const planks = drainEvents(sim).filter((e) => e.type === 'plank');
    expect(planks.map((e) => (e.type === 'plank' ? e.planksLeft : -1))).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    ]);
  });

  it('builds leftwards too', () => {
    const sim = rowsSim(arena(80, 50));
    const c = walker(sim, 60, 30, -1);
    assign(sim, 0, 'mason');
    run(sim, MASON_PLANK_TICKS * 2);
    expect([c.x, c.y]).toEqual([56, 28]);
    expect(allOf(sim, 55, 29, 6, 1, SOIL)).toBe(true);
    expect(allOf(sim, 53, 28, 6, 1, SOIL)).toBe(true);
  });

  it('turns around when it hits a wall', () => {
    const rows = paint(arena(), 20, 0, 6, 30, '#');
    const sim = rowsSim(rows);
    const c = walker(sim, 10, 30);
    assign(sim, 0, 'mason');
    runUntil(sim, () => c.state !== CreatureState.Build);
    expect(c.state).toBe(CreatureState.Walk);
    expect(c.dir).toBe(-1);
    expect([c.x, c.y]).toEqual([16, 27]);
    expect(c.counter).toBe(0); // walking resets the counter
    expect(allOf(sim, 16, 26, 4, 1, SOIL)).toBe(true); // 4th plank, clipped by the wall
  });

  it('flags the last 3 planks and can be refilled only then', () => {
    const sim = rowsSim(arena(120, 50));
    const c = walker(sim, 10, 30);
    assign(sim, 0, 'mason');
    run(sim, 1);
    expect(masonRunningOut(c)).toBe(false);
    expect(assign(sim, 0, 'mason')).toBe(false);
    runUntil(sim, () => c.counter === 3);
    expect(masonRunningOut(c)).toBe(true);
    expect(assign(sim, 0, 'mason')).toBe(true);
    expect(c.counter).toBe(MASON_PLANKS);
    runUntil(sim, () => c.state !== CreatureState.Build);
    expect([c.x, c.y]).toEqual([10 + 2 * 21, 30 - 21]);
  });
});

describe('Burrower', () => {
  it(`tunnels at 1 px / ${BURROW_TICKS} ticks and walks on when it runs out of material`, () => {
    const rows = paint(arena(), 20, 0, 10, 30, '#');
    const sim = rowsSim(rows);
    const c = walker(sim, 17, 30);
    assign(sim, 0, 'burrower');
    run(sim, BURROW_TICKS * 5);
    expect(c.x).toBe(22);
    runUntil(sim, () => c.state !== CreatureState.Burrow);
    expect(c.state).toBe(CreatureState.Walk);
    expect(c.x).toBe(27); // its body box already reaches the far side (x + 2)
    expect(allOf(sim, 20, 21, 10, 9, AIR)).toBe(true);
    expect(allOf(sim, 20, 0, 10, 21, SOIL)).toBe(true);
    run(sim, 30);
    expect(c.x).toBe(37);
  });

  it('stops at metal and turns there as a walker', () => {
    let rows = paint(arena(), 20, 0, 5, 30, '#');
    rows = paint(rows, 25, 0, 3, 30, '3');
    const sim = rowsSim(rows);
    const c = walker(sim, 17, 30);
    assign(sim, 0, 'burrower');
    runUntil(sim, () => c.state !== CreatureState.Burrow);
    expect(c.x).toBe(22);
    runUntil(sim, () => c.dir === -1);
    expect(c.x).toBe(24);
    expect(allOf(sim, 25, 0, 3, 30, METAL)).toBe(true);
  });

  it('stops at metal even with diggable soil behind it', () => {
    let rows = paint(arena(), 20, 0, 20, 30, '#');
    rows = paint(rows, 26, 21, 2, 9, '3');
    const sim = rowsSim(rows);
    const c = walker(sim, 17, 30);
    assign(sim, 0, 'burrower');
    runUntil(sim, () => c.state !== CreatureState.Burrow);
    expect(c.state).toBe(CreatureState.Walk);
    expect(c.x).toBe(23); // the next body box (22 … 26) would contain metal
    expect(materialAt(sim.terrain, 25, 25)).toBe(AIR);
    expect(allOf(sim, 26, 21, 2, 9, METAL)).toBe(true);
    expect(allOf(sim, 28, 21, 12, 9, SOIL)).toBe(true);
  });

  it('is twice as slow in rock', () => {
    const rows = paint(arena(), 20, 0, 10, 30, '2');
    const sim = rowsSim(rows);
    const c = walker(sim, 17, 30);
    assign(sim, 0, 'burrower');
    run(sim, BURROW_TICKS * 2 * 4);
    expect(c.x).toBe(21);
  });

  it('digs one-way walls only in their direction', () => {
    const rows = paint(arena(), 20, 0, 10, 30, String(ONEWAY_LEFT));
    const sim = rowsSim(rows);
    const right = walker(sim, 17, 30, 1);
    assign(sim, 0, 'burrower');
    step(sim);
    runUntil(sim, () => right.state !== CreatureState.Burrow);
    expect(right.x).toBe(17);
    const left = walker(sim, 32, 30, -1);
    assign(sim, 1, 'burrower');
    runUntil(sim, () => left.state !== CreatureState.Burrow);
    expect(left.x).toBe(22);
    expect(allOf(sim, 20, 21, 10, 9, AIR)).toBe(true);
  });

  it('with nothing to dig ahead it just walks on', () => {
    const sim = rowsSim(arena());
    const c = walker(sim, 20, 30);
    assign(sim, 0, 'burrower');
    run(sim, BURROW_TICKS);
    expect(c.state).toBe(CreatureState.Walk);
    expect(sim.skills.burrower).toBe(9);
  });
});

describe('Sloper', () => {
  it(`digs 2 forward : 1 down, one step per ${SLOPE_TICKS} ticks`, () => {
    const sim = rowsSim(flat(60, 60, 20));
    const c = walker(sim, 10, 20);
    assign(sim, 0, 'sloper');
    run(sim, SLOPE_TICKS);
    expect([c.x, c.y]).toEqual([11, 21]);
    run(sim, SLOPE_TICKS * 9);
    expect([c.x, c.y]).toEqual([20, 25]);
    expect(c.state).toBe(CreatureState.Slope);
    expect(allOf(sim, 18, 16, 5, 9, AIR)).toBe(true);
    expect(materialAt(sim.terrain, 20, 25)).toBe(SOIL);
  });

  it('stops at metal', () => {
    const rows = paint(flat(60, 60, 20), 0, 25, 60, 2, '3');
    const sim = rowsSim(rows);
    const c = walker(sim, 10, 20);
    assign(sim, 0, 'sloper');
    runUntil(sim, () => c.state !== CreatureState.Slope);
    expect(c.state).toBe(CreatureState.Walk);
    expect(c.y).toBe(25);
  });

  it('falls when it breaks through into a cave', () => {
    const rows = paint(flat(60, 60, 20), 0, 25, 60, 5, '.');
    const sim = rowsSim(rows);
    const c = walker(sim, 10, 20, -1);
    c.x = 40;
    assign(sim, 0, 'sloper');
    runUntil(sim, () => c.state !== CreatureState.Slope);
    expect(c.state).toBe(CreatureState.Fall);
    expect(c.y).toBe(25);
    runUntil(sim, () => c.state === CreatureState.Walk);
    expect(c.y).toBe(30);
  });
});

describe('Delver', () => {
  it(`digs a 9-px shaft at 1 px / ${DELVE_TICKS} ticks and falls into the cave below`, () => {
    const rows = paint(flat(40, 60, 20), 0, 30, 40, 10, '.');
    const sim = rowsSim(rows);
    const c = walker(sim, 10, 20);
    assign(sim, 0, 'delver');
    run(sim, DELVE_TICKS * 5);
    expect(c.y).toBe(25);
    expect(allOf(sim, 6, 20, 9, 5, AIR)).toBe(true);
    expect(materialAt(sim.terrain, 5, 20)).toBe(SOIL);
    expect(materialAt(sim.terrain, 15, 20)).toBe(SOIL);
    runUntil(sim, () => c.state !== CreatureState.Delve);
    expect(c.state).toBe(CreatureState.Fall);
    expect(c.y).toBe(30);
    runUntil(sim, () => c.state === CreatureState.Walk);
    expect(c.y).toBe(40);
  });

  it('stops at metal', () => {
    const rows = paint(flat(40, 60, 20), 0, 25, 40, 1, '3');
    const sim = rowsSim(rows);
    const c = walker(sim, 10, 20);
    assign(sim, 0, 'delver');
    runUntil(sim, () => c.state !== CreatureState.Delve);
    expect(c.state).toBe(CreatureState.Walk);
    expect(c.y).toBe(25);
  });

  it('is twice as slow in rock', () => {
    const sim = rowsSim(flat(40, 60, 20, String(ROCK)));
    const c = walker(sim, 10, 20);
    assign(sim, 0, 'delver');
    run(sim, DELVE_TICKS * 2 * 3);
    expect(c.y).toBe(23);
  });
});
