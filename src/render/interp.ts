import type { Creature } from '../core/creature';

/** Moves longer than this (px per tick) are jumps (teleport, rewind) and are not interpolated. */
export const MAX_INTERP_DISTANCE = 4;

/**
 * Creature positions of the last two simulated ticks, so frames between ticks can be drawn at
 * `prev + (cur − prev) · alpha`. Call `capture` after every sim step; render with the clock's
 * alpha (0 = previous tick, 1 = latest tick).
 */
export class PositionHistory {
  private prevX = new Int32Array(0);
  private prevY = new Int32Array(0);
  private curX = new Int32Array(0);
  private curY = new Int32Array(0);
  /** Number of creatures captured in `cur`; ids ≥ `prevCount` have no previous position. */
  private curCount = 0;
  private prevCount = 0;

  capture(creatures: readonly Creature[]): void {
    [this.prevX, this.curX] = [this.curX, this.prevX];
    [this.prevY, this.curY] = [this.curY, this.prevY];
    this.prevCount = this.curCount;
    const n = creatures.length;
    if (this.curX.length < n) {
      const size = Math.max(16, n * 2);
      this.curX = grow(this.curX, size);
      this.curY = grow(this.curY, size);
      this.prevX = grow(this.prevX, size);
      this.prevY = grow(this.prevY, size);
    }
    for (let i = 0; i < n; i++) {
      const c = creatures[i] as Creature;
      this.curX[i] = c.x;
      this.curY[i] = c.y;
    }
    this.curCount = n;
  }

  /** Forget the history (after a rewind or level restart): the next capture starts fresh. */
  reset(): void {
    this.curCount = 0;
    this.prevCount = 0;
  }

  /** Interpolated foot point of creature `c` (its current position when there is no history). */
  position(c: Creature, alpha: number): { x: number; y: number } {
    const i = c.id;
    if (i >= this.curCount || i >= this.prevCount) return { x: c.x, y: c.y };
    const px = this.prevX[i] as number;
    const py = this.prevY[i] as number;
    const cx = this.curX[i] as number;
    const cy = this.curY[i] as number;
    if (Math.abs(cx - px) > MAX_INTERP_DISTANCE || Math.abs(cy - py) > MAX_INTERP_DISTANCE) {
      return { x: cx, y: cy };
    }
    const a = Math.max(0, Math.min(1, alpha));
    return { x: px + (cx - px) * a, y: py + (cy - py) * a };
  }
}

function grow(a: Int32Array, size: number): Int32Array<ArrayBuffer> {
  const b = new Int32Array(size);
  b.set(a.subarray(0, Math.min(a.length, size)));
  return b;
}
