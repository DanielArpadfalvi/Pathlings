import type { LevelDef, LevelObject, LevelObjectType } from '../core/level';
import { objectRect } from '../core/level';
import {
  type BrushSize,
  COORD_MAX,
  COORD_MIN,
  MAX_POLY_POINTS,
  MAX_STROKE_POINTS,
  type RasterOp,
} from '../core/raster';
import { STAMPS, stampSize } from '../core/stamps';
import type { Material } from '../core/terrain';

/**
 * Editor tools (§1.8: brush / shape / stamp / eraser / object / hand) as pure functions from
 * world-space finger positions to raster ops or objects. All output coordinates are integers.
 */

export type ShapeKind = 'rect' | 'circle' | 'ramp' | 'poly';
/** Paintable materials (air is the eraser's job). */
export type PaintMaterial = Exclude<Material, 0>;

export type Tool =
  | { kind: 'brush'; size: BrushSize; m: PaintMaterial }
  | { kind: 'eraser'; size: BrushSize }
  | { kind: 'shape'; shape: ShapeKind; m: PaintMaterial }
  | { kind: 'stamp'; id: string; flip: boolean; m: PaintMaterial }
  | { kind: 'object'; type: LevelObjectType }
  | { kind: 'hand' };

export interface WorldPoint {
  x: number;
  y: number;
}

/** Points closer than this (world px) to the previous one are skipped while drawing. */
export const STROKE_MIN_STEP = 2;
/** A poly closes when a point lands this close to its first point. */
export const POLY_CLOSE_DISTANCE = 6;

function coord(v: number): number {
  return Math.max(COORD_MIN, Math.min(COORD_MAX, Math.round(v)));
}

function pt(p: WorldPoint): WorldPoint {
  return { x: coord(p.x), y: coord(p.y) };
}

/** Collects a freehand stroke and turns it into brush / erase ops of ≤ 256 points each. */
export class StrokeBuilder {
  private readonly pts: number[] = [];

  constructor(private readonly tool: Extract<Tool, { kind: 'brush' | 'eraser' }>) {}

  add(p: WorldPoint): void {
    const q = pt(p);
    const n = this.pts.length;
    if (n >= 2) {
      const dx = q.x - (this.pts[n - 2] as number);
      const dy = q.y - (this.pts[n - 1] as number);
      if (dx * dx + dy * dy < STROKE_MIN_STEP * STROKE_MIN_STEP) return;
    }
    this.pts.push(q.x, q.y);
  }

  get points(): readonly number[] {
    return this.pts;
  }

  /** The stroke as ops; consecutive chunks share their joint point so the line stays unbroken. */
  finish(): RasterOp[] {
    if (this.pts.length === 0) return [];
    const ops: RasterOp[] = [];
    const per = MAX_STROKE_POINTS * 2;
    for (let start = 0; start < this.pts.length; start += per - 2) {
      const chunk = this.pts.slice(start, start + per);
      if (start > 0 && chunk.length < 4) break;
      ops.push(
        this.tool.kind === 'brush'
          ? { op: 'brush', m: this.tool.m, size: this.tool.size, pts: chunk }
          : { op: 'erase', size: this.tool.size, pts: chunk },
      );
      if (start + per >= this.pts.length) break;
    }
    return ops;
  }
}

/** Rect / circle / ramp from a drag between `a` and `b` (null for a zero-size drag). */
export function shapeFromDrag(
  shape: Exclude<ShapeKind, 'poly'>,
  m: PaintMaterial,
  a: WorldPoint,
  b: WorldPoint,
): RasterOp | null {
  const p = pt(a);
  const q = pt(b);
  if (shape === 'circle') {
    const r = Math.round(Math.hypot(q.x - p.x, q.y - p.y));
    return r < 1 ? null : { op: 'circle', m, x: p.x, y: p.y, r: Math.min(r, 512) };
  }
  const x = Math.min(p.x, q.x);
  const y = Math.min(p.y, q.y);
  const w = Math.min(1024, Math.abs(q.x - p.x) + 1);
  const h = Math.min(1024, Math.abs(q.y - p.y) + 1);
  if (w < 2 && h < 2) return null;
  if (shape === 'rect') return { op: 'rect', m, x, y, w, h };
  // Dragging up-right (or down-left) draws a slope rising to the right.
  const rise = (q.x - p.x) * (q.y - p.y) < 0 ? 'right' : 'left';
  return { op: 'ramp', m, x, y, w, h, rise };
}

/** Tap-by-tap polygon: closes on a tap near the first point (or when the point limit is hit). */
export class PolyBuilder {
  private readonly pts: number[] = [];

  constructor(private readonly m: PaintMaterial) {}

  get points(): readonly number[] {
    return this.pts;
  }

  /** Adds a corner; returns the finished op when this tap closes the polygon. */
  add(p: WorldPoint): RasterOp | null {
    const q = pt(p);
    const n = this.pts.length / 2;
    if (n >= 3) {
      const d = Math.hypot(q.x - (this.pts[0] as number), q.y - (this.pts[1] as number));
      if (d <= POLY_CLOSE_DISTANCE) return this.finish();
    }
    this.pts.push(q.x, q.y);
    return n + 1 >= MAX_POLY_POINTS ? this.finish() : null;
  }

  finish(): RasterOp | null {
    if (this.pts.length < 6) return null;
    return { op: 'poly', m: this.m, pts: this.pts.slice() };
  }
}

/** A stamp centred on `p`. */
export function stampAt(
  id: string,
  m: PaintMaterial,
  p: WorldPoint,
  flip: boolean,
): RasterOp | null {
  const def = STAMPS[id];
  if (!def) return null;
  const { w, h } = stampSize(def);
  const q = pt(p);
  const op: RasterOp = { op: 'stamp', id, m, x: q.x - (w >> 1), y: q.y - (h >> 1) };
  if (flip) op.flip = true;
  return op;
}

/**
 * A new object of `type` at `p`: entrances and exits stand on the tapped point (feet / door sill),
 * other objects are centred on it. Clamped into the level.
 */
export function objectAt(type: LevelObjectType, p: WorldPoint, level: LevelDef): LevelObject {
  const clampX = (x: number, w: number): number => Math.max(0, Math.min(level.w - w, x));
  const clampY = (y: number, h: number): number => Math.max(0, Math.min(level.h - h, y));
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  switch (type) {
    case 'entrance':
      return {
        type,
        x: Math.max(8, Math.min(level.w - 9, x)),
        y: Math.max(10, Math.min(level.h - 1, y)),
        dir: 1,
      };
    case 'exit':
      return { type, x: clampX(x - 6, 12), y: clampY(y - 12, 12) };
    case 'water':
    case 'lava':
      return { type, x: clampX(x - 16, 32), y: clampY(y - 4, 8), w: 32, h: 8 };
    case 'trap':
      return { type, x: clampX(x - 5, 10), y: clampY(y - 10, 10) };
    case 'teleport': {
      const tx = Math.max(0, Math.min(level.w - 1, x + 48));
      return {
        type,
        x: clampX(x - 4, 8),
        y: clampY(y - 12, 12),
        tx,
        ty: Math.max(0, Math.min(level.h - 1, y)),
      };
    }
    case 'bounce':
      return { type, x: clampX(x - 6, 12), y: clampY(y - 4, 4) };
  }
}

/** Index of the topmost object under `p` (zones grown by `slop` world px), or −1. */
export function objectAtPoint(level: LevelDef, p: WorldPoint, slop = 4): number {
  for (let i = level.objects.length - 1; i >= 0; i--) {
    const r = objectRect(level.objects[i] as LevelObject);
    if (
      p.x >= r.x - slop &&
      p.x < r.x + r.w + slop &&
      p.y >= r.y - slop &&
      p.y < r.y + r.h + slop
    ) {
      return i;
    }
  }
  return -1;
}

/** The object moved by (dx, dy) world px (teleport targets move along), kept inside the level. */
export function moveObject(o: LevelObject, dx: number, dy: number, level: LevelDef): LevelObject {
  const r = objectRect(o);
  const mx = Math.max(-r.x, Math.min(level.w - r.x - r.w, Math.round(dx)));
  const my = Math.max(-r.y, Math.min(level.h - r.y - r.h, Math.round(dy)));
  if (o.type === 'teleport')
    return { ...o, x: o.x + mx, y: o.y + my, tx: o.tx + mx, ty: o.ty + my };
  return { ...o, x: o.x + mx, y: o.y + my };
}
