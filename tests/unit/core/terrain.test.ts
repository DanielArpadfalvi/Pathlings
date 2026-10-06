import { describe, expect, it } from 'vitest';
import {
  AIR,
  CRUMBLE,
  CRUMBLE_TICKS,
  METAL,
  ONEWAY_LEFT,
  ONEWAY_RIGHT,
  PLANK_WIDTH,
  ROCK,
  SHAFT_WIDTH,
  SOIL,
  TUNNEL_HEIGHT,
  canRemove,
  carveCircle,
  carveRect,
  carveShaftRow,
  carveTunnelColumn,
  clipRect,
  cloneTerrain,
  countRemovable,
  countSolid,
  createTerrain,
  digSlowdown,
  fillCircle,
  fillRect,
  groundBelow,
  hashTerrain,
  inBounds,
  inDisc,
  isMaterial,
  isSolid,
  materialAt,
  setMaterial,
  terrainFromRows,
  terrainToRows,
  touchCrumble,
  touchCrumbleRect,
  unionRect,
  updateCrumble,
  writeIntoAir,
  writePlank,
} from '../../../src/core/terrain';

describe('terrain basics', () => {
  it('creates an all-air mask and rejects bad sizes', () => {
    const t = createTerrain(4, 3);
    expect(t.cells.length).toBe(12);
    expect(t.cells.every((c) => c === AIR)).toBe(true);
    for (const [w, h] of [
      [0, 3],
      [3, -1],
      [2.5, 3],
    ]) {
      expect(() => createTerrain(w as number, h as number)).toThrow(RangeError);
    }
  });

  it('materialAt / isSolid treat everything outside the level as air', () => {
    const t = terrainFromRows(['###', '#3#']);
    expect(materialAt(t, 1, 1)).toBe(METAL);
    expect(isSolid(t, 0, 0)).toBe(true);
    for (const [x, y] of [
      [-1, 0],
      [3, 0],
      [0, -1],
      [0, 2],
    ]) {
      expect(materialAt(t, x as number, y as number)).toBe(AIR);
      expect(isSolid(t, x as number, y as number)).toBe(false);
      expect(inBounds(t, x as number, y as number)).toBe(false);
    }
  });

  it('round-trips text rows and rejects malformed rows', () => {
    const rows = ['.1234', '56..1'];
    expect(terrainToRows(terrainFromRows(rows))).toEqual(rows);
    expect(terrainToRows(terrainFromRows(['#', ' ']))).toEqual(['1', '.']);
    expect(() => terrainFromRows(['..', '.'])).toThrow(RangeError);
    expect(() => terrainFromRows(['.7'])).toThrow(RangeError);
    expect(() => terrainFromRows(['x'])).toThrow(RangeError);
    expect(() => terrainFromRows([])).toThrow(RangeError);
  });

  it('setMaterial reports changes and ignores out-of-bounds writes', () => {
    const t = createTerrain(2, 2);
    expect(setMaterial(t, 1, 1, ROCK)).toBe(true);
    expect(setMaterial(t, 1, 1, ROCK)).toBe(false);
    expect(setMaterial(t, 2, 0, ROCK)).toBe(false);
    expect(materialAt(t, 1, 1)).toBe(ROCK);
  });

  it('isMaterial, digSlowdown', () => {
    expect([0, 1, 2, 3, 4, 5, 6].every(isMaterial)).toBe(true);
    expect([7, -1, 1.5, '1', null].some(isMaterial)).toBe(false);
    expect(digSlowdown(ROCK)).toBe(2);
    expect(digSlowdown(SOIL)).toBe(1);
    expect(digSlowdown(CRUMBLE)).toBe(1);
  });

  it('clone is deep and independent', () => {
    const t = terrainFromRows(['66']);
    touchCrumble(t, 0, 0, 5);
    const c = cloneTerrain(t);
    expect(hashTerrain(c)).toBe(hashTerrain(t));
    setMaterial(c, 1, 0, SOIL);
    touchCrumble(c, 0, 0, 9);
    c.crumble[0]!.expires = 100;
    expect(materialAt(t, 1, 0)).toBe(CRUMBLE);
    expect(t.crumble[0]!.expires).toBe(5 + CRUMBLE_TICKS);
    expect(hashTerrain(c)).not.toBe(hashTerrain(t));
  });

  it('countSolid, countRemovable and groundBelow', () => {
    const t = terrainFromRows(['....', '.3..', '#24.', '###5']);
    expect(countSolid(t, 0, 0, 4, 4)).toBe(8);
    expect(countSolid(t, -5, -5, 100, 100)).toBe(8);
    expect(countRemovable(t, 0, 0, 4, 4, 'right')).toBe(6); // all but metal and one-way-L
    expect(countRemovable(t, 0, 0, 4, 4, 'left')).toBe(6); // all but metal and one-way-R
    expect(countRemovable(t, 0, 0, 4, 4, 'any')).toBe(7);
    expect(groundBelow(t, 1, 0)).toBe(1);
    expect(groundBelow(t, 3, 0)).toBe(3);
    expect(groundBelow(t, 0, -4)).toBe(2);
    expect(groundBelow(t, -1, 0)).toBe(4);
    expect(groundBelow(t, 2, 4)).toBe(4);
  });
});

describe('rects', () => {
  it('unionRect handles nulls and merges boxes', () => {
    expect(unionRect(null, null)).toBeNull();
    const a = { x: 1, y: 1, w: 2, h: 2 };
    const b = { x: 5, y: 0, w: 1, h: 1 };
    expect(unionRect(a, null)).toEqual(a);
    expect(unionRect(null, b)).toEqual(b);
    expect(unionRect(a, b)).toEqual({ x: 1, y: 0, w: 5, h: 3 });
  });

  it('clipRect clips to the level or returns null', () => {
    const t = createTerrain(10, 10);
    expect(clipRect(t, -2, 8, 5, 5)).toEqual({ x: 0, y: 8, w: 3, h: 2 });
    expect(clipRect(t, 10, 0, 3, 3)).toBeNull();
    expect(clipRect(t, 0, 0, 0, 3)).toBeNull();
  });
});

describe('fills', () => {
  it('fillRect overwrites any material and clips', () => {
    const t = terrainFromRows(['333', '...']);
    expect(fillRect(t, -1, 0, 3, 5, SOIL)).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(terrainToRows(t)).toEqual(['113', '11.']);
    expect(fillRect(t, 5, 5, 2, 2, SOIL)).toBeNull();
  });

  it('fillCircle uses the r² + r disc', () => {
    const t = createTerrain(7, 7);
    expect(fillCircle(t, 3, 3, 2, ROCK)).toEqual({ x: 1, y: 1, w: 5, h: 5 });
    expect(terrainToRows(t)).toEqual([
      '.......',
      '..222..',
      '.22222.',
      '.22222.',
      '.22222.',
      '..222..',
      '.......',
    ]);
    expect(inDisc(2, 2, 2)).toBe(false);
    expect(inDisc(2, 1, 2)).toBe(true);
    expect(fillCircle(t, -10, -10, 2, ROCK)).toBeNull();
  });
});

describe('materials under removal', () => {
  it('soil, rock and crumble are removable in every direction', () => {
    for (const m of [SOIL, ROCK, CRUMBLE]) {
      for (const d of ['left', 'right', 'down', 'any'] as const) expect(canRemove(m, d)).toBe(true);
    }
    expect(canRemove(AIR, 'any')).toBe(false);
    expect(canRemove(99, 'any')).toBe(false);
  });

  it('metal is never removed – not by digging, tunnels, shafts or blasts', () => {
    const t = terrainFromRows(['333', '333', '333']);
    for (const d of ['left', 'right', 'down', 'any'] as const) {
      expect(canRemove(METAL, d)).toBe(false);
      const r = carveRect(t, 0, 0, 3, 3, d);
      expect(r).toEqual({ dirty: null, removed: 0, blocked: 9 });
    }
    expect(carveCircle(t, 1, 1, 12).removed).toBe(0);
    expect(carveShaftRow(t, 1, 0).blocked).toBe(3);
    expect(carveTunnelColumn(t, 1, 3, 'right').blocked).toBe(3);
    expect(terrainToRows(t)).toEqual(['333', '333', '333']);
  });

  it('one-way-left is only removable when moving left (or down / blast)', () => {
    expect(canRemove(ONEWAY_LEFT, 'left')).toBe(true);
    expect(canRemove(ONEWAY_LEFT, 'right')).toBe(false);
    expect(canRemove(ONEWAY_LEFT, 'down')).toBe(true);
    expect(canRemove(ONEWAY_LEFT, 'any')).toBe(true);
    const t = terrainFromRows(['44']);
    expect(carveRect(t, 0, 0, 2, 1, 'right')).toEqual({ dirty: null, removed: 0, blocked: 2 });
    expect(carveRect(t, 0, 0, 1, 1, 'left')).toEqual({
      dirty: { x: 0, y: 0, w: 1, h: 1 },
      removed: 1,
      blocked: 0,
    });
    expect(terrainToRows(t)).toEqual(['.4']);
  });

  it('one-way-right is only removable when moving right (or down / blast)', () => {
    expect(canRemove(ONEWAY_RIGHT, 'right')).toBe(true);
    expect(canRemove(ONEWAY_RIGHT, 'left')).toBe(false);
    expect(canRemove(ONEWAY_RIGHT, 'down')).toBe(true);
    expect(canRemove(ONEWAY_RIGHT, 'any')).toBe(true);
    const t = terrainFromRows(['55', '55']);
    expect(carveRect(t, 0, 0, 2, 2, 'left').blocked).toBe(4);
    expect(carveRect(t, 1, 0, 1, 2, 'right').removed).toBe(2);
    expect(carveRect(t, 0, 1, 1, 1, 'down').removed).toBe(1);
    expect(carveCircle(t, 0, 0, 1).removed).toBe(1);
    expect(terrainToRows(t)).toEqual(['..', '..']);
  });

  it('carveRect reports the dirty box of removed cells only', () => {
    const t = terrainFromRows(['....', '.#3.', '..#.', '....']);
    const r = carveRect(t, -3, -3, 10, 10, 'any');
    expect(r).toEqual({ dirty: { x: 1, y: 1, w: 2, h: 2 }, removed: 2, blocked: 1 });
    expect(carveRect(t, 20, 20, 2, 2, 'any')).toEqual({ dirty: null, removed: 0, blocked: 0 });
  });

  it('carveCircle blasts soil + rock in the radius and leaves metal', () => {
    const t = createTerrain(40, 40);
    fillRect(t, 0, 0, 40, 40, SOIL);
    fillRect(t, 0, 20, 40, 20, ROCK);
    fillRect(t, 18, 18, 4, 4, METAL);
    const r = carveCircle(t, 20, 20, 12);
    expect(r.dirty).toEqual({ x: 8, y: 8, w: 25, h: 25 });
    expect(r.blocked).toBe(16);
    expect(materialAt(t, 20, 20)).toBe(METAL);
    expect(materialAt(t, 20, 8)).toBe(AIR);
    expect(materialAt(t, 20, 32)).toBe(AIR);
    expect(materialAt(t, 20, 33)).toBe(ROCK);
    expect(materialAt(t, 8, 8)).toBe(SOIL);
    expect(carveCircle(t, -50, -50, 3)).toEqual({ dirty: null, removed: 0, blocked: 0 });
  });

  it('carveShaftRow removes a 9-px row centred on x', () => {
    const t = createTerrain(20, 3);
    fillRect(t, 0, 0, 20, 3, SOIL);
    const r = carveShaftRow(t, 10, 1);
    expect(SHAFT_WIDTH).toBe(9);
    expect(r).toEqual({ dirty: { x: 6, y: 1, w: 9, h: 1 }, removed: 9, blocked: 0 });
    expect(terrainToRows(t)[1]).toBe('111111.........11111');
  });

  it('carveTunnelColumn removes a 9-px-tall column above the foot row', () => {
    const t = createTerrain(4, 12);
    fillRect(t, 0, 0, 4, 12, SOIL);
    const r = carveTunnelColumn(t, 2, 11, 'left');
    expect(TUNNEL_HEIGHT).toBe(9);
    expect(r).toEqual({ dirty: { x: 2, y: 2, w: 1, h: 9 }, removed: 9, blocked: 0 });
    expect(materialAt(t, 2, 11)).toBe(SOIL);
    expect(materialAt(t, 2, 1)).toBe(SOIL);
    expect(carveTunnelColumn(t, 1, 3, 'right', 2).removed).toBe(2);
  });
});

describe('building', () => {
  it('writePlank writes a 6×1 soil plank only into air', () => {
    const t = terrainFromRows(['..........', '..........']);
    setMaterial(t, 4, 0, METAL);
    const r = writePlank(t, 1, 0);
    expect(PLANK_WIDTH).toBe(6);
    expect(r).toEqual({ dirty: { x: 1, y: 0, w: 6, h: 1 }, written: 5 });
    expect(terrainToRows(t)[0]).toBe('.111311...');
    expect(writePlank(t, 1, 0)).toEqual({ dirty: null, written: 0 });
    expect(writePlank(t, 8, 1, 4, ROCK)).toEqual({ dirty: { x: 8, y: 1, w: 2, h: 1 }, written: 2 });
    expect(writeIntoAir(t, -9, -9, 2, 2, SOIL)).toEqual({ dirty: null, written: 0 });
  });
});

describe('crumble', () => {
  it('disappears exactly 60 ticks after the first contact', () => {
    const t = terrainFromRows(['666', '111']);
    expect(touchCrumble(t, 1, 0, 100)).toBe(true);
    expect(touchCrumble(t, 1, 0, 120)).toBe(false); // later contacts do not reset the timer
    expect(updateCrumble(t, 100 + CRUMBLE_TICKS - 1)).toBeNull();
    expect(materialAt(t, 1, 0)).toBe(CRUMBLE);
    expect(updateCrumble(t, 100 + CRUMBLE_TICKS)).toEqual({ x: 1, y: 0, w: 1, h: 1 });
    expect(materialAt(t, 1, 0)).toBe(AIR);
    expect(materialAt(t, 0, 0)).toBe(CRUMBLE); // never touched
    expect(t.crumble).toEqual([]);
    expect(t.crumbleArmed.size).toBe(0);
  });

  it('only crumble cells inside the level can be armed', () => {
    const t = terrainFromRows(['16']);
    expect(touchCrumble(t, 0, 0, 0)).toBe(false);
    expect(touchCrumble(t, 5, 0, 0)).toBe(false);
    expect(touchCrumble(t, 1, -1, 0)).toBe(false);
    expect(updateCrumble(t, 1000)).toBeNull();
  });

  it('touchCrumbleRect arms a whole footprint; expiry is per contact tick', () => {
    const t = terrainFromRows(['6666666', '1111111']);
    expect(touchCrumbleRect(t, 0, 0, 3, 2, 10)).toBe(3);
    expect(touchCrumbleRect(t, 2, 0, 3, 1, 20)).toBe(2);
    expect(updateCrumble(t, 70)).toEqual({ x: 0, y: 0, w: 3, h: 1 });
    expect(terrainToRows(t)[0]).toBe('...6666');
    expect(updateCrumble(t, 80)).toEqual({ x: 3, y: 0, w: 2, h: 1 });
    expect(terrainToRows(t)[0]).toBe('.....66');
  });

  it('a crumble cell removed or replaced before expiry is skipped', () => {
    const t = terrainFromRows(['66']);
    touchCrumbleRect(t, 0, 0, 2, 1, 0);
    carveRect(t, 0, 0, 1, 1, 'any');
    writePlank(t, 0, 0, 1);
    expect(updateCrumble(t, CRUMBLE_TICKS)).toEqual({ x: 1, y: 0, w: 1, h: 1 });
    expect(terrainToRows(t)).toEqual(['1.']);
  });

  it('armed timers are part of the terrain hash', () => {
    const a = terrainFromRows(['66']);
    const b = cloneTerrain(a);
    expect(hashTerrain(a)).toBe(hashTerrain(b));
    touchCrumble(a, 0, 0, 1);
    expect(hashTerrain(a)).not.toBe(hashTerrain(b));
    touchCrumble(b, 0, 0, 2);
    expect(hashTerrain(a)).not.toBe(hashTerrain(b));
  });
});
