import type { Sim, SimEvent } from '../core/world';
import type { HapticKind, Haptics } from '../platform/haptics';
import { type AudioSink, SfxMapper } from './sfx';

/**
 * Turns each tick's events into sound and haptic feedback (§1.7: short tick on a successful
 * assignment, a double buzz on a refused one, stronger on homecomings and deaths).
 */
export class FeedbackDirector {
  private readonly sfx: SfxMapper;
  /** Haptics on/off (Settings, T6.2). */
  hapticsEnabled = true;

  constructor(
    sink: AudioSink,
    private readonly haptics: Haptics,
  ) {
    this.sfx = new SfxMapper(sink);
  }

  private buzz(kind: HapticKind): void {
    if (this.hapticsEnabled) this.haptics.trigger(kind);
  }

  onEvents(sim: Sim, events: readonly SimEvent[]): void {
    this.sfx.onEvents(sim, events);
    // At most one buzz per tick, the strongest that applies.
    let kind: HapticKind | null = null;
    for (const ev of events) {
      if (ev.type === 'died') kind = 'heavy';
      else if (ev.type === 'saved' && kind !== 'heavy') kind = 'medium';
      else if (ev.type === 'skillAssigned' && kind === null) kind = 'light';
    }
    if (kind) this.buzz(kind);
  }

  /** The player's tap was refused by the sim. */
  rejected(tick: number): void {
    this.sfx.rejected(tick);
    this.buzz('warning');
  }
}
