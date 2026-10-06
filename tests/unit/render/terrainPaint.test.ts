import { describe, expect, it } from 'vitest';
import { METAL, ONEWAY_LEFT, ONEWAY_RIGHT, SOIL, terrainFromRows } from '../../../src/core/terrain';
import { PALETTES } from '../../../src/render/palette';
import {
  cellColor,
  cellNoise,
  growRect,
  paintTerrain,
  patternShade,
} from '../../../src/render/terrainPaint';

const pal = PALETTES.glade;
const soil = pal.materials[SOIL]!;

function rgbaAt(out: Uint8Array, width: number, x: number, y: number): number[] {
  const o = (y * width + x) * 4;
  return Array.from(out.subarray(o, o + 4));
}

function rgba(rgb: number): number[] {
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff, 255];
}

describe('terrain painting', () => {
  const t = terrainFromRows(['.....', '.###.', '.###.', '.###.', '.....']);
  const full = { x: 0, y: 0, w: 5, h: 5 };

  it('leaves air fully transparent', () => {
    const out = new Uint8Array(5 * 5 * 4).fill(7);
    paintTerrain(t, pal, out, full);
    expect(rgbaAt(out, 5, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(rgbaAt(out, 5, 4, 4)).toEqual([0, 0, 0, 0]);
  });

  it('lights the top surface and shades the underside', () => {
    const out = new Uint8Array(5 * 5 * 4);
    paintTerrain(t, pal, out, full);
    expect(rgbaAt(out, 5, 2, 1)).toEqual(rgba(soil.highlight));
    expect(rgbaAt(out, 5, 2, 3)).toEqual(rgba(soil.shadow));
    expect(soil.shades.map(rgba)).toContainEqual(rgbaAt(out, 5, 2, 2));
  });

  it('darkens cells beside air by one shade', () => {
    const side = terrainFromRows(['#####', '#####', '.####', '#####', '#####']);
    const inner = patternShade(SOIL, 1, 2);
    expect(cellColor(side, soil, SOIL, 1, 2)).toBe(soil.shades[Math.min(3, inner + 1)]);
    expect(cellColor(side, soil, SOIL, 3, 2)).toBe(soil.shades[patternShade(SOIL, 3, 2)]);
  });

  it('treats the level border as solid (no edge lighting at the frame)', () => {
    const solid = terrainFromRows(['###', '###']);
    expect(cellColor(solid, soil, SOIL, 1, 0)).toBe(soil.shades[patternShade(SOIL, 1, 0)]);
  });

  it('only writes inside the requested rect', () => {
    const out = new Uint8Array(5 * 5 * 4).fill(9);
    paintTerrain(t, pal, out, { x: 1, y: 1, w: 2, h: 1 });
    expect(rgbaAt(out, 5, 1, 1)[3]).toBe(255);
    expect(rgbaAt(out, 5, 3, 1)).toEqual([9, 9, 9, 9]);
    expect(rgbaAt(out, 5, 1, 2)).toEqual([9, 9, 9, 9]);
  });

  it('is deterministic', () => {
    const a = new Uint8Array(5 * 5 * 4);
    const b = new Uint8Array(5 * 5 * 4);
    paintTerrain(t, pal, a, full);
    paintTerrain(t, pal, b, full);
    expect(a).toEqual(b);
  });

  it('noise is varied and stays in 0…255', () => {
    const seen = new Set<number>();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) seen.add(cellNoise(x, y));
    expect(seen.size).toBeGreaterThan(200);
    for (const v of seen) expect(v >= 0 && v <= 255).toBe(true);
  });

  it('draws metal plates with seams and rivets', () => {
    expect(patternShade(METAL, 0, 3)).toBe(3);
    expect(patternShade(METAL, 3, 8)).toBe(3);
    expect(patternShade(METAL, 1, 1)).toBe(0);
    expect(patternShade(METAL, 7, 7)).toBe(0);
  });

  it('mirrors one-way chevrons by direction', () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = patternShade(ONEWAY_LEFT, x, y) === 0;
        const right = patternShade(ONEWAY_RIGHT, 7 - x, y) === 0;
        expect(left).toBe(right);
      }
    }
  });

  it('every theme has four shades for every solid material', () => {
    for (const p of Object.values(PALETTES)) {
      expect(p.materials).toHaveLength(7);
      for (let m = 1; m < 7; m++) expect(p.materials[m]!.shades).toHaveLength(4);
    }
  });
});

describe('growRect', () => {
  it('grows and clamps to the terrain', () => {
    expect(growRect({ x: 0, y: 0, w: 2, h: 2 }, 1, 10, 10)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    expect(growRect({ x: 8, y: 8, w: 2, h: 2 }, 1, 10, 10)).toEqual({ x: 7, y: 7, w: 3, h: 3 });
  });

  it('returns null for rects outside the terrain', () => {
    expect(growRect({ x: 20, y: 0, w: 2, h: 2 }, 1, 10, 10)).toBeNull();
  });
});
