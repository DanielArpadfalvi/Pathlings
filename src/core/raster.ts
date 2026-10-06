/**
 * Rasterizer: editor ops → terrain mask. Integer-only and deterministic – a level code must
 * produce exactly the same terrain on every platform (see CLAUDE.md, §1.8, §3.4).
 *
 * Ops are applied in order and overwrite whatever is below them (`m = AIR` cuts). Coordinates are
 * world pixels; a shape's integer corners/centre are pixel cells. Ops may extend past the level
 * edges and are clipped.
 */

import { ceilDiv } from './imath';
import { STAMPS, type StampLibrary, stampSize } from './stamps';
import {
  AIR,
  type Material,
  type Rect,
  type Terrain,
  clipRect,
  createTerrain,
  fillCircle,
  fillRect,
  isMaterial,
  unionRect,
} from './terrain';

/** Brush / eraser radii for sizes 0, 1, 2 (small, medium, large). */
export const BRUSH_RADII = [2, 4, 8] as const;
export type BrushSize = 0 | 1 | 2;

/** Editor op limit per level (§1.8). */
export const MAX_OPS = 1024;
export const MAX_POLY_POINTS = 64;
export const MAX_STROKE_POINTS = 256;
/** Allowed coordinate range for op positions (generous margin around the largest level). */
export const COORD_MIN = -1024;
export const COORD_MAX = 2047;
/** Max width/height of rect and ramp ops, and max circle radius. */
export const MAX_SHAPE_SIZE = 1024;
export const MAX_RADIUS = 512;

export interface RectOp {
  op: 'rect';
  m: Material;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CircleOp {
  op: 'circle';
  m: Material;
  /** Centre cell. */
  x: number;
  y: number;
  r: number;
}

/** Right triangle inside the box (x, y, w, h); `rise` is the tall side ('right' = slope going up to the right). */
export interface RampOp {
  op: 'ramp';
  m: Material;
  x: number;
  y: number;
  w: number;
  h: number;
  rise: 'left' | 'right';
}

/** Polygon (even-odd rule, pixel centres) from flat vertex coords `[x0, y0, x1, y1, …]`. */
export interface PolyOp {
  op: 'poly';
  m: Material;
  pts: number[];
}

/** Freehand stroke through flat points `[x0, y0, x1, y1, …]` with a round brush. */
export interface BrushOp {
  op: 'brush';
  m: Material;
  size: BrushSize;
  pts: number[];
}

/** Like a brush stroke but always writes air (removes every material, incl. metal). */
export interface EraseOp {
  op: 'erase';
  size: BrushSize;
  pts: number[];
}

/** Stamp `id` from the stamp library with its top-left at (x, y), optionally mirrored. */
export interface StampOp {
  op: 'stamp';
  id: string;
  m: Material;
  x: number;
  y: number;
  flip?: boolean;
}

export type RasterOp = RectOp | CircleOp | RampOp | PolyOp | BrushOp | EraseOp | StampOp;
export type RasterOpKind = RasterOp['op'];

// --- Validation -------------------------------------------------------------------------------

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isCoord = (v: unknown): boolean => isInt(v) && v >= COORD_MIN && v <= COORD_MAX;
const isSize = (v: unknown, max: number): boolean => isInt(v) && v >= 1 && v <= max;

function pointsError(pts: unknown, minPoints: number, maxPoints: number): string | null {
  if (!Array.isArray(pts) || pts.length % 2 !== 0) return 'pts must be a flat [x, y, …] array';
  const n = pts.length / 2;
  if (n < minPoints || n > maxPoints) return `needs ${minPoints}–${maxPoints} points`;
  if (!pts.every(isCoord)) return 'point coordinates must be integers in range';
  return null;
}

/**
 * Returns a human-readable problem with an op, or null when it is valid. Rejects non-integer
 * numbers, so no float can ever reach the terrain cells.
 */
export function validateOp(op: RasterOp, stamps: StampLibrary = STAMPS): string | null {
  if (typeof op !== 'object' || op === null) return 'op must be an object';
  const o = op as unknown as Record<string, unknown>;
  if (o.op !== 'erase' && !isMaterial(o.m)) return 'invalid material';
  switch (op.op) {
    case 'rect':
      if (!isCoord(op.x) || !isCoord(op.y)) return 'invalid position';
      if (!isSize(op.w, MAX_SHAPE_SIZE) || !isSize(op.h, MAX_SHAPE_SIZE)) return 'invalid size';
      return null;
    case 'circle':
      if (!isCoord(op.x) || !isCoord(op.y)) return 'invalid position';
      if (!isInt(op.r) || op.r < 0 || op.r > MAX_RADIUS) return 'invalid radius';
      return null;
    case 'ramp':
      if (!isCoord(op.x) || !isCoord(op.y)) return 'invalid position';
      if (!isSize(op.w, MAX_SHAPE_SIZE) || !isSize(op.h, MAX_SHAPE_SIZE)) return 'invalid size';
      if (op.rise !== 'left' && op.rise !== 'right') return 'invalid rise';
      return null;
    case 'poly':
      return pointsError(op.pts, 3, MAX_POLY_POINTS);
    case 'brush':
    case 'erase':
      if (op.size !== 0 && op.size !== 1 && op.size !== 2) return 'invalid brush size';
      return pointsError(op.pts, 1, MAX_STROKE_POINTS);
    case 'stamp':
      if (typeof op.id !== 'string' || !Object.hasOwn(stamps, op.id)) return 'unknown stamp';
      if (!isCoord(op.x) || !isCoord(op.y)) return 'invalid position';
      if (op.flip !== undefined && typeof op.flip !== 'boolean') return 'invalid flip';
      return null;
    default:
      return 'unknown op';
  }
}

// --- Shapes -----------------------------------------------------------------------------------

function rampOp(t: Terrain, op: RampOp): Rect | null {
  const box = clipRect(t, op.x, op.y, op.w, op.h);
  if (!box) return null;
  for (let j = 0; j < op.h; j++) {
    const y = op.y + j;
    if (y < 0 || y >= t.height) continue;
    // Row j (from the top) is ceil((j + 1) · w / h) cells wide, the last row is full width.
    const width = ceilDiv((j + 1) * op.w, op.h);
    const x0 = op.rise === 'right' ? op.x + op.w - width : op.x;
    fillRect(t, x0, y, width, 1, op.m);
  }
  return box;
}

/**
 * Even-odd scanline fill sampled at pixel centres: cell (x, y) is inside when the point
 * (x + ½, y + ½) is inside the polygon whose vertices sit on cell corners. Evaluated with exact
 * integer arithmetic in doubled coordinates.
 */
function polyOp(t: Terrain, op: PolyOp): Rect | null {
  const pts = op.pts;
  const n = pts.length / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < n; k++) {
    const x = pts[2 * k] as number;
    const y = pts[2 * k + 1] as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const box = clipRect(t, minX, minY, maxX - minX, maxY - minY);
  if (!box) return null;
  const xs: number[] = [];
  for (let y = box.y; y < box.y + box.h; y++) {
    const sy2 = 2 * y + 1; // doubled scanline y (pixel centre)
    xs.length = 0;
    for (let k = 0; k < n; k++) {
      let x0 = pts[2 * k] as number;
      let y0 = pts[2 * k + 1] as number;
      let x1 = pts[(2 * k + 2) % pts.length] as number;
      let y1 = pts[(2 * k + 3) % pts.length] as number;
      if (y0 === y1) continue;
      if (y0 > y1) {
        [x0, x1] = [x1, x0];
        [y0, y1] = [y1, y0];
      }
      if (sy2 < 2 * y0 || sy2 >= 2 * y1) continue;
      const dx = x1 - x0;
      const dy = y1 - y0;
      // First cell whose centre is right of the crossing: ceil(crossX − ½).
      xs.push(ceilDiv(2 * x0 * dy + (sy2 - 2 * y0) * dx - dy, 2 * dy));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = xs[k] as number;
      const b = xs[k + 1] as number;
      if (b > a) fillRect(t, a, y, b - a, 1, op.m);
    }
  }
  return box;
}

/** Integer Bresenham line through (x0, y0) → (x1, y1), calling `plot` for every cell (inclusive). */
export function bresenham(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  plot: (x: number, y: number) => void,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    plot(x, y);
    if (x === x1 && y === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function strokeOp(t: Terrain, pts: number[], size: BrushSize, m: Material): Rect | null {
  const r = BRUSH_RADII[size];
  let dirty: Rect | null = null;
  const dab = (x: number, y: number): void => {
    dirty = unionRect(dirty, fillCircle(t, x, y, r, m));
  };
  const n = pts.length / 2;
  if (n === 1) dab(pts[0] as number, pts[1] as number);
  for (let k = 0; k + 1 < n; k++) {
    const x0 = pts[2 * k] as number;
    const y0 = pts[2 * k + 1] as number;
    const x1 = pts[2 * k + 2] as number;
    const y1 = pts[2 * k + 3] as number;
    // Skip the first cell of later segments (already dabbed as the previous segment's end).
    let skip = k > 0;
    bresenham(x0, y0, x1, y1, (x, y) => {
      if (skip) skip = false;
      else dab(x, y);
    });
  }
  return dirty;
}

function stampOp(t: Terrain, op: StampOp, stamps: StampLibrary): Rect | null {
  const def = stamps[op.id];
  if (!def) throw new RangeError(`unknown stamp '${op.id}'`);
  const { w, h } = stampSize(def);
  for (let j = 0; j < h; j++) {
    const row = def.rows[j] as string;
    const y = op.y + j;
    if (y < 0 || y >= t.height) continue;
    for (let i = 0; i < w; i++) {
      const ch = row[op.flip ? w - 1 - i : i];
      if (ch === undefined || ch === '.') continue;
      const x = op.x + i;
      if (x < 0 || x >= t.width) continue;
      const m = ch === '#' ? op.m : ch.charCodeAt(0) - 48;
      if (isMaterial(m)) t.cells[y * t.width + x] = m;
    }
  }
  return clipRect(t, op.x, op.y, w, h);
}

// --- Public API -------------------------------------------------------------------------------

/**
 * Applies one op to the terrain and returns the (clipped) rectangle it may have changed, or null.
 * Throws a RangeError for an invalid op (see `validateOp`).
 */
export function applyOp(t: Terrain, op: RasterOp, stamps: StampLibrary = STAMPS): Rect | null {
  const err = validateOp(op, stamps);
  if (err) throw new RangeError(`invalid ${String((op as { op?: unknown })?.op)} op: ${err}`);
  switch (op.op) {
    case 'rect':
      return fillRect(t, op.x, op.y, op.w, op.h, op.m);
    case 'circle':
      return fillCircle(t, op.x, op.y, op.r, op.m);
    case 'ramp':
      return rampOp(t, op);
    case 'poly':
      return polyOp(t, op);
    case 'brush':
      return strokeOp(t, op.pts, op.size, op.m);
    case 'erase':
      return strokeOp(t, op.pts, op.size, AIR);
    case 'stamp':
      return stampOp(t, op, stamps);
  }
}

/** Builds a fresh `width` × `height` terrain from an op list (applied in order). */
export function rasterize(
  width: number,
  height: number,
  ops: readonly RasterOp[],
  stamps: StampLibrary = STAMPS,
): Terrain {
  if (ops.length > MAX_OPS) throw new RangeError(`rasterize: more than ${MAX_OPS} ops`);
  const t = createTerrain(width, height);
  for (const op of ops) applyOp(t, op, stamps);
  return t;
}
