import { describe, expect, it } from 'vitest';
import {
  LEGACY_HELP_KEY,
  LEGACY_TUTORIAL_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  SaveManager,
  defaultSave,
  loadSave,
} from '../../../src/app/save';
import { DEFAULT_SETTINGS } from '../../../src/app/settings';
import { createMemoryStore } from '../../../src/platform/storage';

/** What a pre-T6.3 build (save v1) left in storage. */
const V1_FIXTURE = {
  [LEGACY_HELP_KEY]: JSON.stringify({
    'w1-03': { fails: 4, watched: false, solved: false, clean: false },
    'w2-10': { fails: 6, watched: true, solved: true, clean: false },
    'daily:2026-10-07': { fails: 1 },
  }),
  [LEGACY_TUTORIAL_KEY]: '1',
  'pathlings.myLevels.v1': '[]',
};

describe('save', () => {
  it('starts with defaults on an empty store and writes nothing', () => {
    const store = createMemoryStore();
    expect(loadSave(store)).toEqual({ save: defaultSave(), migrated: false });
    new SaveManager(store);
    expect(store.get(SAVE_KEY)).toBeNull();
  });

  it('migrates v1 keys into the v2 record and removes them', () => {
    const store = createMemoryStore(V1_FIXTURE);
    const save = new SaveManager(store);
    expect(save.tutorialSkipped).toBe(true);
    expect(save.level('w1-03')).toEqual({
      stars: 0,
      bestSaved: 0,
      fails: 4,
      watched: false,
      solved: false,
      clean: false,
    });
    expect(save.level('w2-10')).toMatchObject({ fails: 6, watched: true, solved: true });
    expect(save.level('daily:2026-10-07').fails).toBe(1);
    expect(save.settings).toEqual(DEFAULT_SETTINGS);
    const written = JSON.parse(store.get(SAVE_KEY)!);
    expect(written.version).toBe(SAVE_VERSION);
    expect(store.get(LEGACY_HELP_KEY)).toBeNull();
    expect(store.get(LEGACY_TUTORIAL_KEY)).toBeNull();
    // Other modules' keys are left alone.
    expect(store.get('pathlings.myLevels.v1')).toBe('[]');
    // Loading again is stable.
    expect(new SaveManager(store).snapshot).toEqual(save.snapshot);
  });

  it('falls back to safe defaults on a corrupt save', () => {
    for (const bad of ['{oops', 'null', '42', '"text"', '[1,2]']) {
      const store = createMemoryStore({ [SAVE_KEY]: bad });
      const save = new SaveManager(store);
      expect(save.snapshot).toEqual(defaultSave());
    }
  });

  it('repairs bad fields one by one', () => {
    const store = createMemoryStore({
      [SAVE_KEY]: JSON.stringify({
        version: 2,
        levels: {
          ok: { stars: 2, bestSaved: 8, fails: 1, solved: true, clean: true },
          weird: { stars: 9, bestSaved: -3, fails: 'many' },
          nope: 'x',
          '': { stars: 1 },
        },
        settings: { touchRadius: 99, haptics: 'yes', audio: { master: 7 }, language: 'hu' },
        tutorialSkipped: 'true',
      }),
    });
    const s = new SaveManager(store);
    expect(s.level('ok')).toMatchObject({ stars: 2, bestSaved: 8, solved: true, clean: true });
    expect(s.level('weird')).toMatchObject({ stars: 3, bestSaved: 0, fails: 0, solved: true });
    expect(Object.keys(s.snapshot.levels).sort()).toEqual(['ok', 'weird']);
    expect(s.settings).toMatchObject({ touchRadius: 28, haptics: true, language: 'hu' });
    expect(s.settings.audio.master).toBe(1);
    expect(s.tutorialSkipped).toBe(false);
  });

  it('reads a newer save as far as it understands it', () => {
    const store = createMemoryStore({
      [SAVE_KEY]: JSON.stringify({
        version: 99,
        levels: { 'w1-01': { stars: 3, solved: true, future: 1 } },
        cloud: { id: 'x' },
      }),
    });
    const { save, migrated } = loadSave(store);
    expect(migrated).toBe(false);
    expect(save.levels['w1-01']!.stars).toBe(3);
  });

  it('persists settings and progress changes immediately', () => {
    const store = createMemoryStore();
    const s = new SaveManager(store);
    s.setSettings({ touchRadius: 36, leftHanded: true });
    s.setTutorialSkipped(true);
    s.setLevel('w1-01', { ...s.level('w1-01'), stars: 2, solved: true });
    const again = new SaveManager(store);
    expect(again.settings).toMatchObject({ touchRadius: 36, leftHanded: true });
    expect(again.tutorialSkipped).toBe(true);
    expect(again.level('w1-01').stars).toBe(2);
    again.resetProgress();
    expect(new SaveManager(store).level('w1-01').stars).toBe(0);
    expect(new SaveManager(store).settings.touchRadius).toBe(36);
  });
});
