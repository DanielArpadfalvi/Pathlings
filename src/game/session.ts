import type { LevelDef, SkillId } from '../core/level';
import type { InputLog } from '../core/replay';
import { playLog } from '../core/replay';
import { assign, createSim, drainEvents, step } from '../core/sim';
import type { Sim, SimEvent } from '../core/world';
import { FixedClock } from './clock';

export type StepListener = (sim: Sim, events: SimEvent[]) => void;

export interface SessionOptions {
  /** Replay this input log while playing (attract mode, solution viewer, e2e screenshots). */
  autoplay?: InputLog;
}

/**
 * One level being played: owns the sim, drives it from real time through a fixed 60 Hz clock and
 * hands every tick's events to listeners (renderer, later audio / HUD). The only place outside
 * `src/core` that advances the sim.
 */
export class GameSession {
  readonly sim: Sim;
  readonly clock = new FixedClock();
  paused = false;
  speed = 1;
  private readonly listeners: StepListener[] = [];
  private readonly autoplay: InputLog | undefined;

  constructor(
    readonly level: LevelDef,
    options: SessionOptions = {},
  ) {
    this.sim = createSim(level);
    this.autoplay = options.autoplay;
  }

  onStep(listener: StepListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** Advances by a real-time frame; returns the number of ticks simulated. */
  frame(dtMs: number): number {
    if (this.paused || this.sim.ended) return 0;
    const steps = this.clock.advance(dtMs, this.speed);
    for (let i = 0; i < steps && !this.sim.ended; i++) this.stepOnce();
    return steps;
  }

  /** Simulates exactly one tick (applying autoplay input for it) and notifies listeners. */
  stepOnce(): void {
    if (this.sim.ended) return;
    if (this.autoplay) playLog(this.sim, this.autoplay, this.sim.tick + 1);
    else step(this.sim);
    const events = drainEvents(this.sim);
    for (const l of this.listeners) l(this.sim, events);
  }

  /**
   * Player command: give `skill` to creature `id` now (works while paused; logged for replay).
   * Returns false – consuming nothing – when the creature cannot take it.
   */
  assign(id: number, skill: SkillId): boolean {
    return assign(this.sim, id, skill);
  }

  /** Fast-forwards to `tick` (or the level end) without waiting for real time. */
  seek(tick: number): void {
    while (this.sim.tick < tick && !this.sim.ended) this.stepOnce();
    this.clock.reset();
  }

  /** Render interpolation factor between the previous and the latest tick. */
  get alpha(): number {
    return this.paused || this.sim.ended ? 1 : this.clock.alpha;
  }
}
