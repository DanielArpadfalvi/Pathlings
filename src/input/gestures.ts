/**
 * Pointer gestures on the play field (§1.7): one finger = tap or (after a 5-pt dead zone) pan,
 * two fingers = pinch zoom + pan, two quick taps = double tap. Pure state machine fed with
 * pointer samples in CSS px and a timestamp; returns the gestures recognised by each sample.
 *
 * A one-finger touch that lands on a creature (the `hitTest` callback says so) is a *press*
 * instead: no pan, no tap – `pressStart` / `pressMove` / `pressEnd` let the selection follow the
 * finger (§1.7: pre-highlight, loupe, assign on release). A second finger cancels the press.
 */

/** Movement (CSS px ≈ pt) before a touch counts as a drag instead of a tap. */
export const PAN_DEAD_ZONE = 5;
/** Max time and distance between two taps of a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_DISTANCE = 30;

export type PointerPhase = 'down' | 'move' | 'up' | 'cancel';

export interface PointerSample {
  id: number;
  phase: PointerPhase;
  x: number;
  y: number;
  /** Milliseconds (any monotonic clock). */
  t: number;
}

export type Gesture =
  | { type: 'tap'; x: number; y: number }
  | { type: 'doubleTap'; x: number; y: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'pinch'; x: number; y: number; factor: number }
  | { type: 'panStart' }
  | { type: 'panEnd' }
  | { type: 'pressStart'; x: number; y: number; t: number }
  | { type: 'pressMove'; x: number; y: number; t: number }
  | { type: 'pressEnd'; x: number; y: number; t: number }
  | { type: 'pressCancel' };

/** Whether a one-finger touch at (x, y) CSS px starts on something selectable. */
export type HitTest = (x: number, y: number) => boolean;

interface Touch {
  x: number;
  y: number;
  startX: number;
  startY: number;
}

export class GestureRecognizer {
  private readonly touches = new Map<number, Touch>();
  /** The current one-finger touch has left the dead zone (or followed a pinch). */
  private dragging = false;
  /** A second finger took part since the first one went down: the release is not a tap. */
  private multi = false;
  private lastTap: { x: number; y: number; t: number } | null = null;
  /** The current one-finger touch is a press on a creature. */
  private pressing = false;

  constructor(private readonly hitTest: HitTest = () => false) {}

  /** Number of fingers currently down. */
  get active(): number {
    return this.touches.size;
  }

  feed(s: PointerSample): Gesture[] {
    switch (s.phase) {
      case 'down':
        return this.down(s);
      case 'move':
        return this.move(s);
      case 'up':
        return this.up(s, false);
      case 'cancel':
        return this.up(s, true);
    }
  }

  private down(s: PointerSample): Gesture[] {
    if (this.touches.size >= 2) return []; // a third finger is ignored
    this.touches.set(s.id, { x: s.x, y: s.y, startX: s.x, startY: s.y });
    const out: Gesture[] = [];
    if (this.touches.size === 2) {
      if (this.pressing) out.push({ type: 'pressCancel' });
      this.pressing = false;
      if (!this.dragging) out.push({ type: 'panStart' });
      this.multi = true;
      this.dragging = true;
    } else {
      this.multi = false;
      this.dragging = false;
      this.pressing = this.hitTest(s.x, s.y);
      if (this.pressing) out.push({ type: 'pressStart', x: s.x, y: s.y, t: s.t });
    }
    return out;
  }

  private move(s: PointerSample): Gesture[] {
    const t = this.touches.get(s.id);
    if (!t) return [];
    if (this.touches.size === 1 && this.pressing) {
      t.x = s.x;
      t.y = s.y;
      return [{ type: 'pressMove', x: s.x, y: s.y, t: s.t }];
    }
    if (this.touches.size === 1) {
      const dx = s.x - t.x;
      const dy = s.y - t.y;
      if (!this.dragging) {
        if (Math.hypot(s.x - t.startX, s.y - t.startY) <= PAN_DEAD_ZONE) return [];
        this.dragging = true;
        // The dead zone is swallowed: the view starts moving from here, without a jump.
        t.x = s.x;
        t.y = s.y;
        return [{ type: 'panStart' }];
      }
      t.x = s.x;
      t.y = s.y;
      return dx || dy ? [{ type: 'pan', dx, dy }] : [];
    }
    // Two fingers: midpoint movement pans, distance change zooms around the midpoint.
    const [a, b] = [...this.touches.values()] as [Touch, Touch];
    const before = {
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
      d: Math.hypot(a.x - b.x, a.y - b.y),
    };
    t.x = s.x;
    t.y = s.y;
    const after = { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    const out: Gesture[] = [];
    const dx = after.mx - before.mx;
    const dy = after.my - before.my;
    if (dx || dy) out.push({ type: 'pan', dx, dy });
    if (before.d > 0 && after.d > 0 && after.d !== before.d) {
      out.push({ type: 'pinch', x: after.mx, y: after.my, factor: after.d / before.d });
    }
    return out;
  }

  private up(s: PointerSample, cancelled: boolean): Gesture[] {
    const t = this.touches.get(s.id);
    if (!t) return [];
    this.touches.delete(s.id);
    if (this.touches.size === 1) return []; // pinch → the remaining finger keeps panning
    const out: Gesture[] = [];
    if (this.pressing) {
      out.push(cancelled ? { type: 'pressCancel' } : { type: 'pressEnd', x: s.x, y: s.y, t: s.t });
      this.lastTap = null;
    } else if (this.dragging) {
      out.push({ type: 'panEnd' });
    } else if (!cancelled && !this.multi) {
      const last = this.lastTap;
      if (
        last &&
        s.t - last.t <= DOUBLE_TAP_MS &&
        Math.hypot(s.x - last.x, s.y - last.y) <= DOUBLE_TAP_DISTANCE
      ) {
        out.push({ type: 'doubleTap', x: s.x, y: s.y });
        this.lastTap = null;
      } else {
        out.push({ type: 'tap', x: s.x, y: s.y });
        this.lastTap = { x: s.x, y: s.y, t: s.t };
      }
    }
    this.dragging = false;
    this.multi = false;
    this.pressing = false;
    return out;
  }
}
