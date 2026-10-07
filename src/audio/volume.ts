/**
 * Volume settings (§1.11: separately adjustable). Persisted with the save system (T6.3); edited
 * in Settings (T6.2). Pure helpers so the mapping is testable without Web Audio.
 */
export interface AudioSettings {
  /** 0…1 each. */
  master: number;
  sfx: number;
  music: number;
}

export const DEFAULT_AUDIO: AudioSettings = { master: 0.8, sfx: 1, music: 0.5 };

function unit(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

export function sanitizeAudio(s: Partial<AudioSettings>): AudioSettings {
  return {
    master: unit(s.master ?? DEFAULT_AUDIO.master),
    sfx: unit(s.sfx ?? DEFAULT_AUDIO.sfx),
    music: unit(s.music ?? DEFAULT_AUDIO.music),
  };
}

/** Final linear gain of a sound of `kind` with its own `gain`. */
export function effectiveGain(s: AudioSettings, kind: 'sfx' | 'music', gain: number): number {
  return unit(s.master) * unit(kind === 'sfx' ? s.sfx : s.music) * unit(gain);
}
