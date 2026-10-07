import { type AudioSettings, DEFAULT_AUDIO, sanitizeAudio } from '../audio/volume';

/**
 * Player settings (§1.10, T6.2), stored in the save (T6.3). `sanitizeSettings` turns anything
 * (old or corrupt data) into a complete, valid object.
 */

export const TOUCH_RADII = [20, 28, 36] as const;
export type TouchRadius = (typeof TOUCH_RADII)[number];
export type MotionSetting = 'system' | 'on' | 'off';
export type LanguageSetting = 'auto' | 'en' | 'hu';
export const DEFAULT_SPEEDS = [1, 2] as const;

export interface Settings {
  audio: AudioSettings;
  haptics: boolean;
  /** Game speed a level starts at. */
  defaultSpeed: (typeof DEFAULT_SPEEDS)[number];
  /** Pause while a finger is selecting (§1.7). */
  autoPause: boolean;
  /** Smart-selection radius in points (§1.7). */
  touchRadius: TouchRadius;
  leftHanded: boolean;
  highContrast: boolean;
  /** Reduced motion: follow the system, or force on / off. */
  reducedMotion: MotionSetting;
  largeText: boolean;
  language: LanguageSetting;
}

export const DEFAULT_SETTINGS: Settings = {
  audio: DEFAULT_AUDIO,
  haptics: true,
  defaultSpeed: 1,
  autoPause: false,
  touchRadius: 28,
  leftHanded: false,
  highContrast: false,
  reducedMotion: 'system',
  largeText: false,
  language: 'auto',
};

function oneOf<T>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const audio = (r.audio && typeof r.audio === 'object' ? r.audio : {}) as Record<string, unknown>;
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  return {
    audio: sanitizeAudio({
      master: num(audio.master),
      sfx: num(audio.sfx),
      music: num(audio.music),
    }),
    haptics: bool(r.haptics, d.haptics),
    defaultSpeed: oneOf(r.defaultSpeed, DEFAULT_SPEEDS, d.defaultSpeed),
    autoPause: bool(r.autoPause, d.autoPause),
    touchRadius: oneOf(r.touchRadius, TOUCH_RADII, d.touchRadius),
    leftHanded: bool(r.leftHanded, d.leftHanded),
    highContrast: bool(r.highContrast, d.highContrast),
    reducedMotion: oneOf<MotionSetting>(r.reducedMotion, ['system', 'on', 'off'], d.reducedMotion),
    largeText: bool(r.largeText, d.largeText),
    language: oneOf<LanguageSetting>(r.language, ['auto', 'en', 'hu'], d.language),
  };
}
