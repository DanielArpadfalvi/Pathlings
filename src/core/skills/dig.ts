/** Shared helpers of the digging skills (Burrower, Sloper, Delver). */

import {
  type DigDir,
  type Terrain,
  ROCK,
  countRemovable,
  countSolid,
  materialAt,
} from '../terrain';

/** Removal direction for horizontal / diagonal digging in creature direction `dir` (±1). */
export function digDir(dir: number): 'left' | 'right' {
  return dir < 0 ? 'left' : 'right';
}

/** Whether a rect contains at least one cell of material `m`. */
export function hasMaterial(
  t: Terrain,
  x: number,
  y: number,
  w: number,
  h: number,
  m: number,
): boolean {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) if (materialAt(t, xx, yy) === m) return true;
  }
  return false;
}

/** Whether a rect contains solid cells that a removal in direction `dir` cannot remove. */
export function hasUnremovable(
  t: Terrain,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: DigDir,
): boolean {
  return countSolid(t, x, y, w, h) > countRemovable(t, x, y, w, h, dir);
}

/** Step duration: `base` ticks, doubled when the area to dig contains rock (§1.1). */
export function digTicks(
  t: Terrain,
  base: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  return hasMaterial(t, x, y, w, h, ROCK) ? base * 2 : base;
}
