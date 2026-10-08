import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MyLevels, loadDraft } from '../../../src/app/myLevels';
import {
  DEFAULT_SETTINGS,
  LEGACY_KEYS,
  SAVE_CORRUPT_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  SaveGame,
  sanitizeSettings,
} from '../../../src/app/save';
import { type KeyValueStore, createMemoryStore } from '../../../src/platform/storage';

function fixture(name: string): KeyValueStore {
  const path = join(import.meta.dirname, '..', '..', 'fixtures', 'save', `${name}.json`);
  return createMemoryStore(JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>);
}

describe('save game', () => {
  it('starts with defaults when nothing is stored', () => {
    const store = createMemoryStore();
    const save = new SaveGame(store);
    expect(save.outcome).toBe('new');
    expect(save.settings).toEqual(DEFAULT_SETTINGS);
    expect(save.level('w1-01')).toEqual({ stars: 0, fails: 0, watched: false, solved: 'no' });
    save.recordStars('w1-01', 2);
    expect(JSON.parse(store.get(SAVE_KEY)!).v).toBe(SAVE_VERSION);
  });

  it('migrates a full v1 storage and removes the old keys', () => {
    const store = fixture('v1-full');
    const save = new SaveGame(store);
    expect(save.outcome).toBe('migrated');
    expect(save.level('w1-03')).toEqual({ stars: 0, fails: 4, watched: false, solved: 'no' });
    // A level solved before stars were saved counts as one star.
    expect(save.level('w1-09')).toEqual({ stars: 1, fails: 6, watched: true, solved: 'withHelp' });
    expect(save.level('daily:2026-10-08').stars).toBe(1);
    expect(save.tutorialSkipped).toBe(true);
    for (const k of Object.values(LEGACY_KEYS)) expect(store.get(k)).toBeNull();
    // The collection and the draft are reachable through the save's key-value view.
    const reloaded = new SaveGame(store);
    expect(reloaded.outcome).toBe('loaded');
    const my = new MyLevels(reloaded.store, () => 0);
    expect(my.list().map((e) => [e.id, e.title, e.favourite])).toEqual([
      ['0badc0de', 'Mine', true],
    ]);
    expect(loadDraft(reloaded.store)).toBeNull(); // not a valid level: the draft loader rejects it
    expect(reloaded.data.draft).toMatchObject({ title: 'Draft' });
  });

  it('migrates partial and damaged v1 data to safe values', () => {
    const partial = new SaveGame(fixture('v1-partial'));
    expect(partial.level('w2-01')).toMatchObject({ fails: 2, solved: 'no' });
    expect(partial.data.myLevels).toEqual([]);
    expect(partial.tutorialSkipped).toBe(false);
    const damaged = new SaveGame(fixture('v1-damaged'));
    expect(damaged.level('a')).toEqual({ stars: 0, fails: 0, watched: false, solved: 'no' });
    expect(damaged.data.levels.b).toBeUndefined();
    expect(damaged.level('c').fails).toBe(0);
    expect(damaged.tutorialSkipped).toBe(false);
  });

  it('falls back to defaults on a corrupted save and keeps the damaged text aside', () => {
    for (const bad of ['{oops', '[]', '"text"', '{"v":"two"}', '{"v":1}', 'null']) {
      const store = createMemoryStore({ [SAVE_KEY]: bad });
      const save = new SaveGame(store);
      expect(save.outcome).toBe('corrupt');
      expect(save.settings).toEqual(DEFAULT_SETTINGS);
      expect(store.get(SAVE_CORRUPT_KEY)).toBe(bad);
      expect(new SaveGame(store).outcome).toBe('loaded');
    }
  });

  it('sanitizes every field of a stored v2 document', () => {
    const store = createMemoryStore({
      [SAVE_KEY]: JSON.stringify({
        v: 2,
        levels: { x: { stars: 9, fails: 3 }, y: 4, z: { stars: 2, solved: 'clean' } },
        settings: {
          master: 7,
          music: -1,
          speed: 3,
          touchRadius: 36,
          language: 'de',
          leftHanded: 1,
        },
        tutorialSkipped: 'yes',
        myLevels: {},
      }),
    });
    const save = new SaveGame(store);
    expect(save.level('x')).toMatchObject({ stars: 3, fails: 3, solved: 'clean' });
    expect(save.data.levels.y).toBeUndefined();
    expect(save.level('z').stars).toBe(2);
    expect(save.settings).toMatchObject({
      master: 1,
      music: 0,
      speed: 1,
      touchRadius: 36,
      language: null,
      leftHanded: false,
    });
    expect(save.tutorialSkipped).toBe(false);
    expect(save.data.myLevels).toEqual([]);
  });

  it('never overwrites a save from a newer app version', () => {
    const newer = JSON.stringify({ v: SAVE_VERSION + 1, levels: { a: { stars: 3 } } });
    const store = createMemoryStore({ [SAVE_KEY]: newer });
    const save = new SaveGame(store);
    expect(save.outcome).toBe('newer');
    save.recordStars('w1-01', 3);
    save.updateSettings({ haptics: false });
    expect(store.get(SAVE_KEY)).toBe(newer);
  });

  it('keeps the best stars, persists settings and survives a failing storage', () => {
    const store = createMemoryStore();
    const save = new SaveGame(store);
    save.recordStars('w1-02', 2);
    save.recordStars('w1-02', 1);
    save.updateSettings({ haptics: false, touchRadius: 20 });
    const again = new SaveGame(store);
    expect(again.level('w1-02').stars).toBe(2);
    expect(again.settings).toMatchObject({ haptics: false, touchRadius: 20 });
    const broken: KeyValueStore = { get: () => null, set: () => false, remove: () => {} };
    expect(() => new SaveGame(broken).recordStars('a', 1)).not.toThrow();
  });

  it('settings sanitizer accepts exactly the documented values', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ reducedMotion: true, language: 'hu', speed: 0.5 })).toMatchObject({
      reducedMotion: true,
      language: 'hu',
      speed: 0.5,
    });
  });
});
