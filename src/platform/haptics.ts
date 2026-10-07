/**
 * Haptic feedback behind the platform layer (CLAUDE.md: no other module touches native APIs).
 * The web implementation uses the Vibration API where it exists (Android browsers); the native
 * Capacitor Haptics implementation is plugged in with the mobile shell (T7.1) via
 * `setHaptics`. Feedback can be switched off in Settings.
 */

export type HapticKind =
  /** Successful skill assignment: a short tick. */
  | 'light'
  /** A creature got home. */
  | 'medium'
  /** A creature died / a crater. */
  | 'heavy'
  /** Refused assignment: a double buzz. */
  | 'warning';

export interface Haptics {
  trigger(kind: HapticKind): void;
}

/** Vibration patterns (ms) for the web implementation. */
export const VIBRATION_PATTERNS: Readonly<Record<HapticKind, number | number[]>> = {
  light: 8,
  medium: 18,
  heavy: 35,
  warning: [12, 60, 12],
};

export function createWebHaptics(
  nav: Partial<Navigator> | undefined = globalThis.navigator,
): Haptics {
  return {
    trigger(kind) {
      try {
        nav?.vibrate?.(VIBRATION_PATTERNS[kind]);
      } catch {
        // Vibration may be blocked (no user gesture yet, iframe policy): feedback is optional.
      }
    },
  };
}

let current: Haptics = createWebHaptics();

export function getHaptics(): Haptics {
  return current;
}

/** Native shell (T7.1) installs its implementation here. */
export function setHaptics(h: Haptics): void {
  current = h;
}
