import type { Rect } from '../core/terrain';

/**
 * The view onto a level (§1.6): which world point is in the middle of the screen and how many
 * CSS px one world pixel takes. Pure math, no Pixi – `WorldRenderer.applyCamera` turns it into
 * the world container's transform. Camera moves are never part of the input log.
 *
 * Scale rules: the default shows ~`DEFAULT_VIEW_WIDTH` world px across the screen; pinch zoom
 * ranges from 1× to 4× (CSS px per world px), and further out only as far as needed to show the
 * whole level ("whole level" button). When the view is larger than the level on an axis the
 * level is centred on that axis; otherwise the view never leaves the level.
 */

export const DEFAULT_VIEW_WIDTH = 200;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** Double-tap zooms in by this factor (from the default) and back. */
export const DOUBLE_TAP_ZOOM = 2;
/** Duration of animated camera moves (double tap, whole level), ms. */
export const CAMERA_ANIM_MS = 220;

export interface CameraState {
  /** World point at the centre of the viewport. */
  cx: number;
  cy: number;
  /** CSS px per world px. */
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Camera {
  cx = 0;
  cy = 0;
  scale = 1;
  private viewW = 1;
  private viewH = 1;
  private anim: { from: CameraState; to: CameraState; t: number } | null = null;

  constructor(
    readonly worldW: number,
    readonly worldH: number,
  ) {
    this.cx = worldW / 2;
    this.cy = worldH / 2;
  }

  get viewport(): { w: number; h: number } {
    return { w: this.viewW, h: this.viewH };
  }

  get state(): CameraState {
    return { cx: this.cx, cy: this.cy, scale: this.scale };
  }

  /** Scale at which the whole level fits the viewport. */
  get fitScale(): number {
    return Math.min(this.viewW / this.worldW, this.viewH / this.worldH);
  }

  /** ~200 world px across, within the zoom limits. */
  get defaultScale(): number {
    return clamp(this.viewW / DEFAULT_VIEW_WIDTH, this.minScale, this.maxScale);
  }

  get minScale(): number {
    return Math.min(MIN_ZOOM, this.fitScale);
  }

  /** 4×, or more on big screens whose default view already exceeds it (tablets). */
  get maxScale(): number {
    return Math.max(MAX_ZOOM, this.viewW / DEFAULT_VIEW_WIDTH);
  }

  /** Whether the whole level is visible. */
  get showsWholeLevel(): boolean {
    return this.scale <= this.fitScale + 1e-6;
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  /** New viewport size (CSS px): keeps the centre, re-applies the limits. */
  setViewport(w: number, h: number): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.set(this.state);
  }

  /** Jumps to a state (clamped); cancels any animation. */
  set(s: CameraState): void {
    this.anim = null;
    const c = this.clamped(s);
    this.cx = c.cx;
    this.cy = c.cy;
    this.scale = c.scale;
  }

  /** The state `s` after applying scale limits and keeping the view on the level. */
  clamped(s: CameraState): CameraState {
    const scale = clamp(s.scale, this.minScale, this.maxScale);
    const halfW = this.viewW / scale / 2;
    const halfH = this.viewH / scale / 2;
    const cx = halfW * 2 >= this.worldW ? this.worldW / 2 : clamp(s.cx, halfW, this.worldW - halfW);
    const cy = halfH * 2 >= this.worldH ? this.worldH / 2 : clamp(s.cy, halfH, this.worldH - halfH);
    return { cx, cy, scale };
  }

  toWorld(p: Point): Point {
    return {
      x: this.cx + (p.x - this.viewW / 2) / this.scale,
      y: this.cy + (p.y - this.viewH / 2) / this.scale,
    };
  }

  toScreen(p: Point): Point {
    return {
      x: (p.x - this.cx) * this.scale + this.viewW / 2,
      y: (p.y - this.cy) * this.scale + this.viewH / 2,
    };
  }

  /** Drag by a screen-space delta (content follows the finger). */
  panBy(dx: number, dy: number): void {
    this.set({ cx: this.cx - dx / this.scale, cy: this.cy - dy / this.scale, scale: this.scale });
  }

  /** Zoom by `factor` keeping the world point under screen point `at` fixed (pinch / wheel). */
  zoomAt(at: Point, factor: number): void {
    if (!(factor > 0)) return;
    this.set(this.zoomedState(at, this.scale * factor));
  }

  private zoomedState(at: Point, scale: number): CameraState {
    const s = clamp(scale, this.minScale, this.maxScale);
    const w = this.toWorld(at);
    return {
      cx: w.x - (at.x - this.viewW / 2) / s,
      cy: w.y - (at.y - this.viewH / 2) / s,
      scale: s,
    };
  }

  /** Double tap: zoom in around `at`, or back to the default zoom when already zoomed in. */
  doubleTap(at: Point): void {
    const zoomedIn = this.scale > this.defaultScale * 1.05;
    const target = zoomedIn
      ? { ...this.state, scale: this.defaultScale }
      : this.zoomedState(at, this.defaultScale * DOUBLE_TAP_ZOOM);
    this.animateTo(target);
  }

  /** "Whole level" button: show everything, or go back to the default zoom if already there. */
  toggleWholeLevel(): void {
    if (this.showsWholeLevel && this.fitScale < this.defaultScale - 1e-6) {
      this.animateTo({ ...this.state, scale: this.defaultScale });
    } else {
      this.animateTo({ cx: this.worldW / 2, cy: this.worldH / 2, scale: this.fitScale });
    }
  }

  /**
   * Start framing: default zoom centred on the first entrance; if an exit fits on screen together
   * with it, centred on both (the nearest such exit).
   */
  frameStart(entrance: Rect | undefined, exits: readonly Rect[]): void {
    const scale = this.defaultScale;
    if (!entrance) {
      this.set({ cx: this.worldW / 2, cy: this.worldH / 2, scale });
      return;
    }
    const viewW = this.viewW / scale;
    const viewH = this.viewH / scale;
    let box = entrance;
    let best = Infinity;
    for (const e of exits) {
      const x0 = Math.min(entrance.x, e.x);
      const y0 = Math.min(entrance.y, e.y);
      const x1 = Math.max(entrance.x + entrance.w, e.x + e.w);
      const y1 = Math.max(entrance.y + entrance.h, e.y + e.h);
      const fits = x1 - x0 <= viewW && y1 - y0 <= viewH;
      const area = (x1 - x0) * (y1 - y0);
      if (fits && area < best) {
        best = area;
        box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
    }
    this.set({ cx: box.x + box.w / 2, cy: box.y + box.h / 2, scale });
  }

  /** Smoothly moves to `target` (clamped) over `CAMERA_ANIM_MS`; see `update`. */
  animateTo(target: CameraState): void {
    const to = this.clamped(target);
    this.anim = { from: this.state, to, t: 0 };
  }

  /** Advances an animation by `dtMs` real milliseconds. */
  update(dtMs: number): void {
    const a = this.anim;
    if (!a) return;
    a.t = Math.min(1, a.t + Math.max(0, dtMs) / CAMERA_ANIM_MS);
    const k = 1 - (1 - a.t) * (1 - a.t) * (1 - a.t); // ease-out cubic
    const mix = (p: number, q: number): number => p + (q - p) * k;
    // Interpolate the scale geometrically so zooming feels even.
    const scale = a.from.scale * Math.pow(a.to.scale / a.from.scale, k);
    const c = this.clamped({ cx: mix(a.from.cx, a.to.cx), cy: mix(a.from.cy, a.to.cy), scale });
    this.cx = c.cx;
    this.cy = c.cy;
    this.scale = c.scale;
    if (a.t >= 1) {
      this.anim = null;
      this.cx = a.to.cx;
      this.cy = a.to.cy;
      this.scale = a.to.scale;
    }
  }
}
