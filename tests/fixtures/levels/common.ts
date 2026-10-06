/** Shared building blocks of the hand-made test levels. */

import type { RasterOp } from '../../../src/core/raster';

export const W = 160;
export const H = 240;

/** Metal side walls from `top` down to `bottom` (exclusive) on both edges. */
export function sideWalls(top: number, bottom: number): RasterOp[] {
  return [
    { op: 'rect', m: 3, x: 0, y: top, w: 4, h: bottom - top },
    { op: 'rect', m: 3, x: W - 4, y: top, w: 4, h: bottom - top },
  ];
}
