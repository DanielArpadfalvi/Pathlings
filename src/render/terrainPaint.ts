import type { Rect, Terrain } from '../core/terrain';
import { AIR, CRUMBLE, METAL, ONEWAY_LEFT, ONEWAY_RIGHT, ROCK, SOIL } from '../core/terrain';
import type { MaterialColors, ThemePalette } from './palette';

/**
 * Terrain → RGBA8 pixels (1 cell = 1 texel). Each material gets a deterministic procedural
 * pattern (integer hash noise, so the look never shimmers between frames or devices) and solid
 * cells next to air get an edge highlight (top) or shadow (underside / sides).
 *
 * Painting a cell reads its 4 neighbours, so a terrain change at `r` must repaint `r` grown by
 * one cell (`growRect`).
 */

/** Integer hash of a cell position → 0…255 (stable "noise" for patterns). */
export function cellNoise(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return h & 0xff;
}

/** Shade index 0 (light) … 3 (dark) of a solid cell's pattern, before edge lighting. */
export function patternShade(m: number, x: number, y: number): number {
  const n = cellNoise(x, y);
  switch (m) {
    case SOIL: {
      // Soft strata every 6 rows (wobbling by a coarse noise) plus speckles.
      const band = ((y + (cellNoise(x >> 3, 7) & 3)) / 6) & 1;
      if (n < 10) return 3;
      if (n > 240) return 0;
      return band ? 2 : 1;
    }
    case ROCK: {
      // Offset bricks of 8 × 6 with dark cracks; each brick has its own shade.
      const row = Math.floor(y / 6);
      const bx = x + (row & 1) * 4;
      if (y % 6 === 0 || bx % 8 === 0) return 3;
      const brick = cellNoise(bx >> 3, row);
      return brick < 90 ? 0 : brick < 200 ? 1 : 2;
    }
    case METAL: {
      // 8 × 8 plates: dark seams, a light rivet near each plate corner, vertical sheen.
      const u = x & 7;
      const v = y & 7;
      if (u === 0 || v === 0) return 3;
      if ((u === 1 || u === 7) && (v === 1 || v === 7)) return 0;
      return v < 4 ? 1 : 2;
    }
    case ONEWAY_LEFT:
    case ONEWAY_RIGHT: {
      // Chevrons pointing in the direction digging is allowed.
      const u = m === ONEWAY_LEFT ? x & 7 : 7 - (x & 7);
      const v = y & 7;
      const d = v < 4 ? 3 - v : v - 4;
      if (u === d + 2 || u === d + 3) return 0;
      return n < 40 ? 3 : 2;
    }
    case CRUMBLE: {
      // Sandy grains with diagonal hairline cracks.
      if ((x + y) % 7 === 0 && n > 100) return 3;
      return n < 70 ? 2 : n < 200 ? 1 : 0;
    }
    default:
      return 1;
  }
}

export function growRect(r: Rect, by: number, width: number, height: number): Rect | null {
  const x0 = Math.max(0, r.x - by);
  const y0 = Math.max(0, r.y - by);
  const x1 = Math.min(width, r.x + r.w + by);
  const y1 = Math.min(height, r.y + r.h + by);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

function writeRgb(out: Uint8Array, o: number, rgb: number): void {
  out[o] = (rgb >> 16) & 0xff;
  out[o + 1] = (rgb >> 8) & 0xff;
  out[o + 2] = rgb & 0xff;
  out[o + 3] = 255;
}

function isAirAt(t: Terrain, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= t.width || y >= t.height) return false; // level border: no edge
  return t.cells[y * t.width + x] === AIR;
}

/** Final colour of solid cell (x, y) of material `m`. */
export function cellColor(
  t: Terrain,
  colors: MaterialColors,
  m: number,
  x: number,
  y: number,
): number {
  if (isAirAt(t, x, y - 1)) return colors.highlight;
  if (isAirAt(t, x, y + 1)) return colors.shadow;
  let shade = patternShade(m, x, y);
  if (isAirAt(t, x - 1, y) || isAirAt(t, x + 1, y)) shade = Math.min(3, shade + 1);
  return colors.shades[shade] as number;
}

/**
 * Paints the cells of `rect` (clamped to the terrain) into `out`, an RGBA8 buffer of
 * `terrain.width × terrain.height` texels. Air becomes fully transparent.
 */
export function paintTerrain(t: Terrain, palette: ThemePalette, out: Uint8Array, rect: Rect): void {
  const r = growRect(rect, 0, t.width, t.height);
  if (!r) return;
  for (let y = r.y; y < r.y + r.h; y++) {
    let i = y * t.width + r.x;
    for (let x = r.x; x < r.x + r.w; x++, i++) {
      const m = t.cells[i] as number;
      const o = i * 4;
      if (m === AIR) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
        continue;
      }
      const colors = palette.materials[m];
      writeRgb(out, o, colors ? cellColor(t, colors, m, x, y) : 0xff00ff);
    }
  }
}
