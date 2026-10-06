import { TICKS_PER_SECOND } from '../core/level';

/** Real-time milliseconds per sim tick at 1× speed. */
export const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Longest frame gap that is caught up (a background tab must not trigger a burst of ticks). */
export const MAX_FRAME_MS = 250;

/**
 * Fixed-timestep accumulator: converts variable frame times into whole 60 Hz sim ticks and the
 * leftover fraction (`alpha`) used for render interpolation. The sim itself never sees time.
 */
export class FixedClock {
  private accMs = 0;

  /**
   * Adds a frame of `dtMs` real milliseconds at `speed` (0.5 / 1 / 2 / 4…) and returns how many
   * ticks to simulate now.
   */
  advance(dtMs: number, speed = 1): number {
    if (!Number.isFinite(dtMs) || dtMs <= 0 || speed <= 0) return 0;
    this.accMs += Math.min(dtMs, MAX_FRAME_MS) * speed;
    const steps = Math.floor(this.accMs / TICK_MS);
    this.accMs -= steps * TICK_MS;
    return steps;
  }

  /** Fraction of the next tick already elapsed (0 … <1). */
  get alpha(): number {
    return this.accMs / TICK_MS;
  }

  reset(): void {
    this.accMs = 0;
  }
}
