import { CreatureState } from '../core/creature';
import type { Sim, SimEvent } from '../core/world';

/**
 * Sound effects from the sim's event stream (§1.11). Pure mapping: events (+ a tiny bit of
 * throttling state) → `SoundCue`s for an `AudioSink`. The Web Audio synthesizer lives in
 * `synth.ts`; tests use a fake sink.
 */

export type SfxId =
  | 'step'
  | 'dig'
  | 'plank'
  | 'plankLow'
  | 'pop'
  | 'save'
  | 'assign'
  | 'no'
  | 'splash'
  | 'sizzle'
  | 'thud'
  | 'trap'
  | 'teleport'
  | 'bounce'
  | 'win'
  | 'lose';

export interface SoundCue {
  id: SfxId;
  /** Playback pitch multiplier (1 = base). */
  pitch: number;
  /** 0…1 before the volume settings. */
  gain: number;
}

export interface AudioSink {
  play(cue: SoundCue): void;
}

/** Minimum ticks between two cues of a busy, repetitive kind. */
export const THROTTLE_TICKS: Partial<Record<SfxId, number>> = {
  step: 18,
  dig: 6,
  splash: 4,
  thud: 4,
  pop: 3,
  save: 3,
};

/** Mason planks rise in pitch as the staircase grows (12 planks → an octave and a bit). */
export function plankPitch(planksLeft: number): number {
  const laid = Math.max(0, 12 - planksLeft);
  return Math.pow(2, laid / 10);
}

export class SfxMapper {
  private readonly last = new Map<SfxId, number>();

  constructor(private readonly sink: AudioSink) {}

  private cue(tick: number, id: SfxId, pitch = 1, gain = 1): void {
    const gap = THROTTLE_TICKS[id];
    if (gap !== undefined) {
      const prev = this.last.get(id);
      if (prev !== undefined && tick - prev < gap && tick >= prev) return;
      this.last.set(id, tick);
    }
    this.sink.play({ id, pitch, gain });
  }

  /** Cues for one simulated tick. */
  onEvents(sim: Sim, events: readonly SimEvent[]): void {
    let dug = false;
    for (const ev of events) {
      switch (ev.type) {
        case 'skillAssigned':
          this.cue(ev.tick, 'assign');
          break;
        case 'plank':
          this.cue(ev.tick, ev.planksLeft <= 3 ? 'plankLow' : 'plank', plankPitch(ev.planksLeft));
          break;
        case 'saved':
          this.cue(ev.tick, 'save', 1 + (sim.saved % 5) * 0.06);
          break;
        case 'died':
          if (ev.cause === 'popped') this.cue(ev.tick, 'pop');
          else if (ev.cause === 'water') this.cue(ev.tick, 'splash');
          else if (ev.cause === 'lava') this.cue(ev.tick, 'sizzle');
          else if (ev.cause === 'trap') this.cue(ev.tick, 'trap');
          else this.cue(ev.tick, 'thud');
          break;
        case 'teleported':
          this.cue(ev.tick, 'teleport');
          break;
        case 'bounced':
          this.cue(ev.tick, 'bounce');
          break;
        case 'terrainChanged':
          dug = true;
          break;
        case 'levelEnded':
          this.cue(ev.tick, ev.won ? 'win' : 'lose');
          break;
        case 'rewound':
          this.last.clear();
          break;
        default:
          break;
      }
    }
    if (dug && !events.some((e) => e.type === 'died' && e.cause === 'popped')) {
      this.cue(sim.tick, 'dig', 0.9 + (sim.tick % 3) * 0.08, 0.6);
    }
    // Footsteps: a soft chirp while anyone walks (throttled to a gentle pulse).
    if (sim.creatures.some((c) => c.state === CreatureState.Walk))
      this.cue(sim.tick, 'step', 1, 0.25);
  }

  /** A tap the sim refused (wrong creature for the skill, no stock): the quiet "no". */
  rejected(tick: number): void {
    this.cue(tick, 'no');
  }
}
