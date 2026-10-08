import { DRAFT_KEY, MY_LEVELS_KEY } from './myLevels';
import type { KeyValueStore } from '../platform/storage';

/**
 * The save game (§3.3, T6.3): one versioned JSON document in platform storage holding level
 * progress (stars, fail counters, help marks), settings, the player's level collection, the
 * editor draft and small flags. Older formats are migrated step by step on load; anything
 * unreadable falls back to safe defaults (the damaged text is kept aside for support) and never
 * crashes the game.
 *
 * Version history:
 * - v1 (≤ T5.7): no save document; separate keys `pathlings.help.v1`,
 *   `pathlings.tutorialSkipped.v1`, `pathlings.myLevels.v1`, `pathlings.draft.v1`.
 * - v2: everything in `pathlings.save`.
 */

export const SAVE_KEY = 'pathlings.save';
export const SAVE_CORRUPT_KEY = 'pathlings.save.corrupt';
export const SAVE_VERSION = 2;

/** v1 keys, read once by the migration and then removed. */
export const LEGACY_KEYS = {
  help: 'pathlings.help.v1',
  tutorialSkipped: 'pathlings.tutorialSkipped.v1',
  myLevels: MY_LEVELS_KEY,
  draft: DRAFT_KEY,
} as const;

export type SolvedMark = 'no' | 'withHelp' | 'clean';

export interface LevelRecord {
  /** Best rating, 0 = never won. */
  stars: number;
  fails: number;
  /** The solution replay was watched since the last win. */
  watched: boolean;
  solved: SolvedMark;
}

export const TOUCH_RADII = [20, 28, 36] as const;
export const DEFAULT_SPEEDS = [0.5, 1, 2] as const;

export interface Settings {
  /** Volumes 0…1. */
  master: number;
  sfx: number;
  music: number;
  haptics: boolean;
  /** Game speed a level starts at. */
  speed: (typeof DEFAULT_SPEEDS)[number];
  autoPause: boolean;
  /** Smart-selection radius in pt (§1.7, §1.10). */
  touchRadius: (typeof TOUCH_RADII)[number];
  leftHanded: boolean;
  highContrast: boolean;
  /** null: follow the system preference. */
  reducedMotion: boolean | null;
  largeText: boolean;
  /** null: follow the device language. */
  language: 'en' | 'hu' | null;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  sfx: 1,
  music: 0.5,
  haptics: true,
  speed: 1,
  autoPause: false,
  touchRadius: 28,
  leftHanded: false,
  highContrast: false,
  reducedMotion: null,
  largeText: false,
  language: null,
};

export interface SaveData {
  v: typeof SAVE_VERSION;
  levels: Record<string, LevelRecord>;
  settings: Settings;
  tutorialSkipped: boolean;
  /** My levels (`MyLevels` entries) and the editor draft, as their modules store them. */
  myLevels: unknown[];
  draft: unknown;
}

export function defaultSave(): SaveData {
  return {
    v: SAVE_VERSION,
    levels: {},
    settings: { ...DEFAULT_SETTINGS },
    tutorialSkipped: false,
    myLevels: [],
    draft: null,
  };
}

// --- Sanitizing -------------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function count(v: unknown, max = 1_000_000): number {
  return Number.isInteger(v) && (v as number) >= 0 ? Math.min(v as number, max) : 0;
}

function unit(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

export function sanitizeLevelRecord(v: unknown): LevelRecord | null {
  if (!isObject(v)) return null;
  const solved = oneOf<SolvedMark>(v.solved, ['no', 'withHelp', 'clean'], 'no');
  let stars = Math.min(3, count(v.stars));
  if (solved !== 'no' && stars === 0) stars = 1;
  return {
    stars,
    fails: count(v.fails),
    watched: v.watched === true,
    solved: stars > 0 && solved === 'no' ? 'clean' : solved,
  };
}

export function sanitizeSettings(v: unknown): Settings {
  const s = isObject(v) ? v : {};
  const d = DEFAULT_SETTINGS;
  return {
    master: unit(s.master, d.master),
    sfx: unit(s.sfx, d.sfx),
    music: unit(s.music, d.music),
    haptics: bool(s.haptics, d.haptics),
    speed: oneOf(s.speed, DEFAULT_SPEEDS, d.speed),
    autoPause: bool(s.autoPause, d.autoPause),
    touchRadius: oneOf(s.touchRadius, TOUCH_RADII, d.touchRadius),
    leftHanded: bool(s.leftHanded, d.leftHanded),
    highContrast: bool(s.highContrast, d.highContrast),
    reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : d.reducedMotion,
    largeText: bool(s.largeText, d.largeText),
    language: oneOf(s.language, ['en', 'hu', null] as const, d.language),
  };
}

/** A v2 document with every field checked (unknown / bad fields → defaults). */
export function sanitizeSave(v: Record<string, unknown>): SaveData {
  const levels: Record<string, LevelRecord> = {};
  if (isObject(v.levels)) {
    for (const [id, r] of Object.entries(v.levels)) {
      const rec = sanitizeLevelRecord(r);
      if (rec) levels[id] = rec;
    }
  }
  return {
    v: SAVE_VERSION,
    levels,
    settings: sanitizeSettings(v.settings),
    tutorialSkipped: v.tutorialSkipped === true,
    myLevels: Array.isArray(v.myLevels) ? v.myLevels : [],
    draft: v.draft ?? null,
  };
}

// --- Migrations -------------------------------------------------------------------------------

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** v1 → v2: gathers the separate keys into one document. */
export function migrateV1(store: KeyValueStore): SaveData {
  const save = defaultSave();
  const help = parseJson(store.get(LEGACY_KEYS.help));
  if (isObject(help)) {
    for (const [id, r] of Object.entries(help)) {
      const rec = sanitizeLevelRecord(r);
      if (rec) save.levels[id] = rec;
    }
  }
  save.tutorialSkipped = store.get(LEGACY_KEYS.tutorialSkipped) === '1';
  const my = parseJson(store.get(LEGACY_KEYS.myLevels));
  if (Array.isArray(my)) save.myLevels = my;
  save.draft = parseJson(store.get(LEGACY_KEYS.draft)) ?? null;
  return save;
}

export type LoadOutcome = 'new' | 'loaded' | 'migrated' | 'corrupt' | 'newer';

/**
 * Reads the save from `store`, migrating older formats. A save from a newer app version is not
 * understood: defaults are used and the newer document is left untouched (never overwritten).
 */
export function loadSave(store: KeyValueStore): { data: SaveData; outcome: LoadOutcome } {
  const text = store.get(SAVE_KEY);
  if (text === null) {
    const hasLegacy = Object.values(LEGACY_KEYS).some((k) => store.get(k) !== null);
    return hasLegacy
      ? { data: migrateV1(store), outcome: 'migrated' }
      : { data: defaultSave(), outcome: 'new' };
  }
  const raw = parseJson(text);
  if (!isObject(raw) || !Number.isInteger(raw.v))
    return { data: defaultSave(), outcome: 'corrupt' };
  const v = raw.v as number;
  if (v > SAVE_VERSION) return { data: defaultSave(), outcome: 'newer' };
  if (v < 2) return { data: defaultSave(), outcome: 'corrupt' };
  return { data: sanitizeSave(raw), outcome: 'loaded' };
}

// --- The save game ----------------------------------------------------------------------------

/**
 * Live save: read once, every change written through. Modules that keep their own key-value
 * format (`MyLevels`, the editor draft) use `store` – a key-value view whose two keys live inside
 * the save document.
 */
export class SaveGame {
  readonly data: SaveData;
  readonly outcome: LoadOutcome;
  /** False when a newer app's save is present: nothing is written over it. */
  private readonly writable: boolean;

  constructor(private readonly backing: KeyValueStore) {
    const { data, outcome } = loadSave(backing);
    this.data = data;
    this.outcome = outcome;
    this.writable = outcome !== 'newer';
    if (outcome === 'corrupt') {
      backing.set(SAVE_CORRUPT_KEY, backing.get(SAVE_KEY) ?? '');
      this.flush();
    } else if (outcome === 'migrated') {
      if (this.flush()) for (const k of Object.values(LEGACY_KEYS)) backing.remove(k);
    }
  }

  flush(): boolean {
    if (!this.writable) return false;
    return this.backing.set(SAVE_KEY, JSON.stringify(this.data));
  }

  level(id: string): LevelRecord {
    const r = this.data.levels[id];
    return r ? { ...r } : { stars: 0, fails: 0, watched: false, solved: 'no' };
  }

  setLevel(id: string, record: LevelRecord): void {
    this.data.levels[id] = { ...record };
    this.flush();
  }

  /** Keeps the best star count of a won run. */
  recordStars(id: string, stars: number): void {
    const r = this.level(id);
    if (stars <= r.stars) return;
    this.setLevel(id, { ...r, stars: Math.min(3, stars) });
  }

  get settings(): Settings {
    return this.data.settings;
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.data.settings = sanitizeSettings({ ...this.data.settings, ...patch });
    this.flush();
    return this.data.settings;
  }

  get tutorialSkipped(): boolean {
    return this.data.tutorialSkipped;
  }

  set tutorialSkipped(skipped: boolean) {
    this.data.tutorialSkipped = skipped;
    this.flush();
  }

  /** Key-value view for `MyLevels` and the editor draft. */
  readonly store: KeyValueStore = {
    get: (key) => {
      if (key === MY_LEVELS_KEY) return JSON.stringify(this.data.myLevels);
      if (key === DRAFT_KEY)
        return this.data.draft == null ? null : JSON.stringify(this.data.draft);
      return null;
    },
    set: (key, value) => {
      const parsed = parseJson(value);
      if (key === MY_LEVELS_KEY) this.data.myLevels = Array.isArray(parsed) ? parsed : [];
      else if (key === DRAFT_KEY) this.data.draft = parsed ?? null;
      else return false;
      return this.flush();
    },
    remove: (key) => {
      if (key === MY_LEVELS_KEY) this.data.myLevels = [];
      else if (key === DRAFT_KEY) this.data.draft = null;
      else return;
      this.flush();
    },
  };
}
