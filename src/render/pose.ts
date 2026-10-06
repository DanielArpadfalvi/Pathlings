import type { Creature } from '../core/creature';
import { CreatureState, EXIT_TICKS } from '../core/creature';
import type { PoseId } from './creatureArt';

export interface PoseFrame {
  pose: PoseId;
  frame: number;
}

/**
 * Which sprite frame a creature shows at `tick` (render-only; the animation clock is the sim
 * tick, so a paused or replayed game shows exactly the same frames). Saved and dead creatures
 * have no sprite (null).
 */
export function creaturePose(c: Creature, tick: number): PoseFrame | null {
  switch (c.state) {
    case CreatureState.Walk:
      return { pose: 'walk', frame: Math.floor(tick / 6) & 3 };
    case CreatureState.Fall:
    case CreatureState.Bounce:
      return { pose: 'fall', frame: Math.floor(tick / 8) & 1 };
    case CreatureState.Glide:
      return { pose: 'glide', frame: Math.floor(tick / 16) & 1 };
    case CreatureState.Climb:
      return { pose: 'climb', frame: Math.floor(tick / 8) & 1 };
    case CreatureState.Warden:
      return { pose: 'warden', frame: Math.floor(tick / 32) & 1 };
    case CreatureState.Build:
      return { pose: 'build', frame: Math.floor(tick / 8) & 1 };
    case CreatureState.Burrow:
      return { pose: 'burrow', frame: Math.floor(tick / 4) & 1 };
    case CreatureState.Slope:
      return { pose: 'slope', frame: Math.floor(tick / 6) & 1 };
    case CreatureState.Delve:
      return { pose: 'delve', frame: Math.floor(tick / 8) & 1 };
    case CreatureState.Exiting:
      // Hop into the door: arms up for the first half, then a front view.
      return c.timer > EXIT_TICKS / 2 ? { pose: 'fall', frame: 0 } : { pose: 'warden', frame: 1 };
    default:
      return null;
  }
}

/** Opacity while entering an exit (fades out over `EXIT_TICKS`), 1 otherwise. */
export function creatureAlpha(c: Creature): number {
  if (c.state !== CreatureState.Exiting) return 1;
  return Math.max(0, Math.min(1, c.timer / EXIT_TICKS));
}
