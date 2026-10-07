import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../../src/app/settings';

describe('settings', () => {
  it('fills defaults for missing or invalid fields', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({
        defaultSpeed: 4,
        touchRadius: 21,
        reducedMotion: 'maybe',
        language: 'de',
        audio: { master: -1, sfx: 'loud' },
      }),
    ).toEqual({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, master: 0 } });
  });

  it('keeps valid values', () => {
    const s = {
      audio: { master: 0.2, sfx: 0.4, music: 0 },
      haptics: false,
      defaultSpeed: 2,
      autoPause: true,
      touchRadius: 36,
      leftHanded: true,
      highContrast: true,
      reducedMotion: 'on',
      largeText: true,
      language: 'hu',
    } as const;
    expect(sanitizeSettings(s)).toEqual(s);
  });
});
