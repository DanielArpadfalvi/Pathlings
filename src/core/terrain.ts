/**
 * Destructible / buildable terrain: a byte mask, one cell per world pixel, row-major
 * (`cells[y * width + x]`). Everything is integer-only and deterministic.
 *
 * Coordinates outside the level are air on every side (walking or falling out of the level is
 * death, handled by the sim). Mutating helpers return the touched rectangle (`Rect`) so the
 * renderer can upload only that part of the terrain texture (dirty rects).
 */

import { FNV_OFFSET, fnv1aBytes, fnv1aU32 } from './hash';

// --- Materials (§1.1) -------------------------------------------------------------------------

export const AIR = 0;
/** Diggable at normal speed. Planks built by the Mason are soil too. */
export const SOIL = 1;
/** Diggable, but digging takes twice as long; destroyed by blasts. */
export const ROCK = 2;
/** Never removed: not diggable, not blastable. */
export const METAL = 3;
/** One-way wall: horizontal/diagonal digging only while moving left. */
export const ONEWAY_LEFT = 4;
/** One-way wall: horizontal/diagonal digging only while moving right. */
export const ONEWAY_RIGHT = 5;
/** Crumbles away `CRUMBLE_TICKS` after the first contact (see `touchCrumble`). */
export const CRUMBLE = 6;

export type Material = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const MATERIAL_COUNT = 7;

/** Ticks between the first contact with a crumble cell and its disappearance. */
export const CRUMBLE_TICKS = 60;
/** Height of a horizontal/diagonal tunnel (creature hitbox height). */
export const TUNNEL_HEIGHT = 9;
/** Width of the vertical shaft dug downwards. */
export const SHAFT_WIDTH = 9;
/** A Mason plank is `PLANK_WIDTH` × 1 px. */
export const PLANK_WIDTH = 6;

/**
 * Direction of a removal, which decides what one-way walls allow:
 * - `left` / `right`: horizontal or diagonal digging while moving that way;
 * - `down`: vertical digging (one-way walls do not restrict it);
 * - `any`: blasts and other non-directional removal (one-way walls do not restrict it).
 * Metal is never removed, whatever the direction.
 */
export type DigDir = 'left' | 'right' | 'down' | 'any';

export function isMaterial(value: unknown): value is Material {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MATERIAL_COUNT
  );
}

/** Whether a cell of material `m` can be removed by a removal in direction `dir`. Air: false. */
export function canRemove(m: number, dir: DigDir): boolean {
  switch (m) {
    case SOIL:
    case ROCK:
    case CRUMBLE:
      return true;
    case ONEWAY_LEFT:
      return dir !== 'right';
    case ONEWAY_RIGHT:
      return dir !== 'left';
    default:
      return false; // AIR, METAL, unknown
  }
}

/** Dig-time multiplier: rock takes twice as long (§1.1), everything else 1. */
export function digSlowdown(m: number): number {
  return m === ROCK ? 2 : 1;
}

// --- Data types -------------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An armed crumble cell: `cell` (index into `cells`) turns to air at tick `expires`. */
export interface CrumbleTimer {
  cell: number;
  expires: number;
}

export interface Terrain {
  readonly width: number;
  readonly height: number;
  cells: Uint8Array;
  /** Armed crumble cells in arming order (part of the sim state: cloned and hashed). */
  crumble: CrumbleTimer[];
  /** Index set of the cells in `crumble`, for O(1) "already armed?" checks. */
  crumbleArmed: Set<number>;
}

export interface CarveResult {
  /** Bounding box of the removed cells, or null when nothing was removed. */
  dirty: Rect | null;
  /** Number of cells turned into air. */
  removed: number;
  /** Solid cells in the area that could not be removed (metal, one-way wall in the wrong direction). */
  blocked: number;
}

export interface WriteResult {
  /** Bounding box of the written cells, or null when nothing was written. */
  dirty: Rect | null;
  written: number;
}

// --- Construction / access --------------------------------------------------------------------

export function createTerrain(width: number, height: number): Terrain {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`createTerrain: invalid size ${width}×${height}`);
  }
  return {
    width,
    height,
    cells: new Uint8Array(width * height),
    crumble: [],
    crumbleArmed: new Set(),
  };
}

/**
 * Builds a terrain from text rows (one char per cell, all rows the same length), handy for tests:
 * `.` or space = air, `#` = soil, digits `0`–`6` = that material.
 */
export function terrainFromRows(rows: readonly string[]): Terrain {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const t = createTerrain(width, height);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new RangeError(`terrainFromRows: row ${y} has wrong length`);
    for (let x = 0; x < width; x++) {
      const ch = row[x] as string;
      let m: number;
      if (ch === '.' || ch === ' ') m = AIR;
      else if (ch === '#') m = SOIL;
      else m = ch.charCodeAt(0) - 48;
      if (!isMaterial(m)) throw new RangeError(`terrainFromRows: bad char '${ch}'`);
      t.cells[y * width + x] = m;
    }
  });
  return t;
}

/** Inverse of `terrainFromRows` (`.` for air, digits otherwise). */
export function terrainToRows(t: Terrain): string[] {
  const rows: string[] = [];
  for (let y = 0; y < t.height; y++) {
    let row = '';
    for (let x = 0; x < t.width; x++) {
      const m = t.cells[y * t.width + x] as number;
      row += m === AIR ? '.' : String(m);
    }
    rows.push(row);
  }
  return rows;
}

export function cloneTerrain(t: Terrain): Terrain {
  return {
    width: t.width,
    height: t.height,
    cells: t.cells.slice(),
    crumble: t.crumble.map((c) => ({ cell: c.cell, expires: c.expires })),
    crumbleArmed: new Set(t.crumbleArmed),
  };
}

export function inBounds(t: Terrain, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < t.width && y < t.height;
}

/** Material at integer pixel (x, y); everything outside the level is air. */
export function materialAt(t: Terrain, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= t.width || y >= t.height) return AIR;
  return t.cells[y * t.width + x] as number;
}

export function isSolid(t: Terrain, x: number, y: number): boolean {
  return materialAt(t, x, y) !== AIR;
}

/** Writes one cell (ignored outside the level). Returns whether the value changed. */
export function setMaterial(t: Terrain, x: number, y: number, m: Material): boolean {
  if (!inBounds(t, x, y)) return false;
  const i = y * t.width + x;
  if (t.cells[i] === m) return false;
  t.cells[i] = m;
  return true;
}

/** Number of solid cells in a rectangle (cells outside the level count as air). */
export function countSolid(t: Terrain, x: number, y: number, w: number, h: number): number {
  let n = 0;
  const x0 = Math.max(0, x);
  const x1 = Math.min(t.width, x + w);
  for (let yy = Math.max(0, y); yy < Math.min(t.height, y + h); yy++) {
    const row = yy * t.width;
    for (let xx = x0; xx < x1; xx++) if (t.cells[row + xx] !== AIR) n++;
  }
  return n;
}

/** Number of cells in a rectangle that a removal in direction `dir` would remove. */
export function countRemovable(
  t: Terrain,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: DigDir,
): number {
  let n = 0;
  const x0 = Math.max(0, x);
  const x1 = Math.min(t.width, x + w);
  for (let yy = Math.max(0, y); yy < Math.min(t.height, y + h); yy++) {
    const row = yy * t.width;
    for (let xx = x0; xx < x1; xx++) if (canRemove(t.cells[row + xx] as number, dir)) n++;
  }
  return n;
}

/** Topmost solid y in column x at or below `fromY`, or `height` when the column is open below. */
export function groundBelow(t: Terrain, x: number, fromY: number): number {
  if (x < 0 || x >= t.width) return t.height;
  for (let y = Math.max(0, fromY); y < t.height; y++) {
    if (t.cells[y * t.width + x] !== AIR) return y;
  }
  return t.height;
}

// --- Dirty rects ------------------------------------------------------------------------------

/** Smallest rect covering both (null-tolerant). */
export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/** Intersection of a rect with the terrain bounds, or null when empty. */
export function clipRect(t: Terrain, x: number, y: number, w: number, h: number): Rect | null {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(t.width, x + w);
  const y1 = Math.min(t.height, y + h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Accumulates a bounding box of individual cells. */
class BoxBuilder {
  minX = Number.MAX_SAFE_INTEGER;
  minY = Number.MAX_SAFE_INTEGER;
  maxX = -1;
  maxY = -1;

  add(x: number, y: number): void {
    if (x < this.minX) this.minX = x;
    if (y < this.minY) this.minY = y;
    if (x > this.maxX) this.maxX = x;
    if (y > this.maxY) this.maxY = y;
  }

  rect(): Rect | null {
    if (this.maxX < 0) return null;
    return {
      x: this.minX,
      y: this.minY,
      w: this.maxX - this.minX + 1,
      h: this.maxY - this.minY + 1,
    };
  }
}

// --- Disc shape -------------------------------------------------------------------------------

/**
 * Integer disc membership used by every round shape (editor circles, brushes, blasts):
 * dx² + dy² ≤ r² + r, which gives rounder small discs than ≤ r². Diameter is 2r + 1.
 */
export function inDisc(dx: number, dy: number, r: number): boolean {
  return dx * dx + dy * dy <= r * r + r;
}

// --- Unconditional writes (level construction) ------------------------------------------------

/** Fills a rect with `m` (overwrites any material, clipped to the level). Returns the clipped rect. */
export function fillRect(
  t: Terrain,
  x: number,
  y: number,
  w: number,
  h: number,
  m: Material,
): Rect | null {
  const r = clipRect(t, x, y, w, h);
  if (!r) return null;
  for (let yy = r.y; yy < r.y + r.h; yy++)
    t.cells.fill(m, yy * t.width + r.x, yy * t.width + r.x + r.w);
  return r;
}

/** Fills a disc (see `inDisc`) with `m`, overwriting any material. Returns the clipped bbox. */
export function fillCircle(
  t: Terrain,
  cx: number,
  cy: number,
  r: number,
  m: Material,
): Rect | null {
  const box = clipRect(t, cx - r, cy - r, 2 * r + 1, 2 * r + 1);
  if (!box) return null;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (inDisc(x - cx, y - cy, r)) t.cells[y * t.width + x] = m;
    }
  }
  return box;
}

// --- Removal (skills, blasts) -----------------------------------------------------------------

function carveCell(
  t: Terrain,
  i: number,
  x: number,
  y: number,
  dir: DigDir,
  out: CarveState,
): void {
  const m = t.cells[i] as number;
  if (m === AIR) return;
  if (!canRemove(m, dir)) {
    out.blocked++;
    return;
  }
  t.cells[i] = AIR;
  out.removed++;
  out.box.add(x, y);
}

interface CarveState {
  removed: number;
  blocked: number;
  box: BoxBuilder;
}

function newCarveState(): CarveState {
  return { removed: 0, blocked: 0, box: new BoxBuilder() };
}

function carveResult(s: CarveState): CarveResult {
  return { dirty: s.box.rect(), removed: s.removed, blocked: s.blocked };
}

/** Removes every removable cell in a rect. */
export function carveRect(
  t: Terrain,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: DigDir,
): CarveResult {
  const s = newCarveState();
  const r = clipRect(t, x, y, w, h);
  if (r) {
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) carveCell(t, yy * t.width + xx, xx, yy, dir, s);
    }
  }
  return carveResult(s);
}

/** Removes every removable cell in a disc (see `inDisc`), e.g. a blast crater (`dir = 'any'`). */
export function carveCircle(
  t: Terrain,
  cx: number,
  cy: number,
  r: number,
  dir: DigDir = 'any',
): CarveResult {
  const s = newCarveState();
  const box = clipRect(t, cx - r, cy - r, 2 * r + 1, 2 * r + 1);
  if (box) {
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        if (inDisc(x - cx, y - cy, r)) carveCell(t, y * t.width + x, x, y, dir, s);
      }
    }
  }
  return carveResult(s);
}

/**
 * One step of digging straight down: removes the `SHAFT_WIDTH`-wide row `y` centred on `cx`
 * (cx − 4 … cx + 4). `y` is usually the creature's foot pixel (the cell below its feet).
 */
export function carveShaftRow(t: Terrain, cx: number, y: number): CarveResult {
  const half = (SHAFT_WIDTH - 1) >> 1;
  return carveRect(t, cx - half, y, SHAFT_WIDTH, 1, 'down');
}

/**
 * One step of a horizontal/diagonal tunnel: removes the 1-px-wide column `x` over the
 * `height` rows directly above `footY` (footY − height … footY − 1), digging in direction `dir`.
 */
export function carveTunnelColumn(
  t: Terrain,
  x: number,
  footY: number,
  dir: 'left' | 'right',
  height: number = TUNNEL_HEIGHT,
): CarveResult {
  return carveRect(t, x, footY - height, 1, height, dir);
}

// --- Building ---------------------------------------------------------------------------------

/**
 * Writes material only into air cells of a rect (existing terrain is never overwritten).
 * Used for Mason planks: `writePlank(t, x, y)` = a `PLANK_WIDTH` × 1 soil plank starting at x.
 */
export function writeIntoAir(
  t: Terrain,
  x: number,
  y: number,
  w: number,
  h: number,
  m: Material,
): WriteResult {
  const box = new BoxBuilder();
  let written = 0;
  const r = clipRect(t, x, y, w, h);
  if (r) {
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) {
        const i = yy * t.width + xx;
        if (t.cells[i] !== AIR) continue;
        t.cells[i] = m;
        written++;
        box.add(xx, yy);
      }
    }
  }
  return { dirty: box.rect(), written };
}

/** A Mason plank: `width` × 1 cells of `m` (default soil) from (x, y) rightwards, only into air. */
export function writePlank(
  t: Terrain,
  x: number,
  y: number,
  width: number = PLANK_WIDTH,
  m: Material = SOIL,
): WriteResult {
  return writeIntoAir(t, x, y, width, 1, m);
}

// --- Crumble ----------------------------------------------------------------------------------

/**
 * Marks a crumble cell as touched at `tick`; it disappears at `tick + CRUMBLE_TICKS` (call
 * `updateCrumble` every tick). Only the first contact counts. Returns true when newly armed.
 */
export function touchCrumble(t: Terrain, x: number, y: number, tick: number): boolean {
  if (!inBounds(t, x, y)) return false;
  const i = y * t.width + x;
  if (t.cells[i] !== CRUMBLE || t.crumbleArmed.has(i)) return false;
  t.crumbleArmed.add(i);
  t.crumble.push({ cell: i, expires: tick + CRUMBLE_TICKS });
  return true;
}

/** `touchCrumble` for every cell of a rect (e.g. the row under a creature's feet). Returns the count armed. */
export function touchCrumbleRect(
  t: Terrain,
  x: number,
  y: number,
  w: number,
  h: number,
  tick: number,
): number {
  let n = 0;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) if (touchCrumble(t, xx, yy, tick)) n++;
  }
  return n;
}

/**
 * Removes every armed crumble cell whose timer has run out (`expires ≤ tick`). Cells that were
 * already removed or changed in the meantime are just dropped. Returns the dirty rect.
 */
export function updateCrumble(t: Terrain, tick: number): Rect | null {
  if (t.crumble.length === 0) return null;
  const box = new BoxBuilder();
  let keep = 0;
  for (let k = 0; k < t.crumble.length; k++) {
    const c = t.crumble[k] as CrumbleTimer;
    if (c.expires > tick) {
      t.crumble[keep++] = c;
      continue;
    }
    t.crumbleArmed.delete(c.cell);
    if (t.cells[c.cell] === CRUMBLE) {
      t.cells[c.cell] = AIR;
      box.add(c.cell % t.width, (c.cell - (c.cell % t.width)) / t.width);
    }
  }
  t.crumble.length = keep;
  return box.rect();
}

// --- Hash -------------------------------------------------------------------------------------

/** FNV-1a over size, cells and armed crumble timers (fold into a running hash via `h`). */
export function hashTerrain(t: Terrain, h: number = FNV_OFFSET): number {
  let x = fnv1aU32(h, t.width);
  x = fnv1aU32(x, t.height);
  x = fnv1aBytes(x, t.cells);
  x = fnv1aU32(x, t.crumble.length);
  for (const c of t.crumble) {
    x = fnv1aU32(x, c.cell);
    x = fnv1aU32(x, c.expires);
  }
  return x;
}
