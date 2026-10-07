import type { KeyValueStore } from '../platform/storage';
import { DEFAULT_SETTINGS, type Settings, sanitizeSettings } from './settings';

/**
 * The save (T6.3): one versioned JSON record in the platform store with per-level progress
 * (stars, best result, fail counters and help state), settings and one-off flags. "My levels" and
 * the editor draft keep their own versioned keys (`myLevels.ts`): they hold whole level codes and
 * are validated entry by entry.
 *
 * Versions:
 * - v1 (before T6.3): no record; scattered keys `pathlings.help.v1` (fails / help per level) and
 *   `pathlings.tutorialSkipped.v1`.
 * - v2: `pathlings.save` = `{ version: 2, levels, settings, tutorialSkipped, offerSeen }`
 *   (`offerSeen` was added later; absent = false).
 *
 * Loading never throws: corrupt or unknown data falls back to safe defaults field by field. A save
 * written by a newer build is read as far as it is understood (and rewritten as the current
 * version only on the next change).
 */

export const SAVE_KEY = 'pathlings.save';
export const SAVE_VERSION = 2;
/** v1 keys (migrated into v2 and then removed). */
export const LEGACY_HELP_KEY = 'pathlings.help.v1';
export const LEGACY_TUTORIAL_KEY = 'pathlings.tutorialSkipped.v1';

export interface LevelProgress {
  /** Best star rating 0–3. */
  stars: number;
  /** Most creatures saved in one run. */
  bestSaved: number;
  /** Failed attempts (unlock hints / solution, §1.4). */
  fails: number;
  /** The solution was watched since the last win. */
  watched: boolean;
  solved: boolean;
  /** Won at least once without watching the solution first. */
  clean: boolean;
}

export interface SaveData {
  version: number;
  levels: Record<string, LevelProgress>;
  settings: Settings;
  tutorialSkipped: boolean;
  /** The full-game offer was shown after world 2 level 10 (it appears on its own only once). */
  offerSeen: boolean;
}

export const EMPTY_PROGRESS: LevelProgress = {
  stars: 0,
  bestSaved: 0,
  fails: 0,
  watched: false,
  solved: false,
  clean: false,
};

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    levels: {},
    settings: DEFAULT_SETTINGS,
    tutorialSkipped: false,
    offerSeen: false,
  };
}

function count(v: unknown, max = 1_000_000): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.max(0, Math.min(max, Math.floor(v)))
    : 0;
}

export function sanitizeProgress(raw: unknown): LevelProgress | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const stars = count(r.stars, 3);
  return {
    stars,
    bestSaved: count(r.bestSaved),
    fails: count(r.fails),
    watched: r.watched === true,
    // A level with stars has been solved, whatever the flag says.
    solved: r.solved === true || stars > 0,
    clean: r.clean === true,
  };
}

function sanitizeLevels(raw: unknown): Record<string, LevelProgress> {
  const out: Record<string, LevelProgress> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    const p = sanitizeProgress(v);
    if (p && id.length > 0 && id.length <= 64) out[id] = p;
  }
  return out;
}

function parse(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** v1 (scattered keys) → v2. */
function fromV1(store: KeyValueStore): SaveData {
  const save = defaultSave();
  save.levels = sanitizeLevels(parse(store.get(LEGACY_HELP_KEY)));
  save.tutorialSkipped = store.get(LEGACY_TUTORIAL_KEY) === '1';
  return save;
}

/** Reads (and migrates) the save; `migrated` is true when the stored form must be rewritten. */
export function loadSave(store: KeyValueStore): { save: SaveData; migrated: boolean } {
  const raw = parse(store.get(SAVE_KEY));
  if (raw === undefined) {
    const hasLegacy =
      store.get(LEGACY_HELP_KEY) !== null || store.get(LEGACY_TUTORIAL_KEY) !== null;
    return { save: fromV1(store), migrated: hasLegacy };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { save: defaultSave(), migrated: true };
  }
  const r = raw as Record<string, unknown>;
  const version = typeof r.version === 'number' ? r.version : 0;
  return {
    save: {
      version: SAVE_VERSION,
      levels: sanitizeLevels(r.levels),
      settings: sanitizeSettings(r.settings),
      tutorialSkipped: r.tutorialSkipped === true,
      offerSeen: r.offerSeen === true,
    },
    migrated: version < SAVE_VERSION,
  };
}

/** The live save: read once, every change written through immediately. */
export class SaveManager {
  private data: SaveData;

  constructor(private readonly store: KeyValueStore) {
    const { save, migrated } = loadSave(store);
    this.data = save;
    if (migrated) {
      this.write();
      store.remove(LEGACY_HELP_KEY);
      store.remove(LEGACY_TUTORIAL_KEY);
    }
  }

  get snapshot(): SaveData {
    return this.data;
  }

  get settings(): Settings {
    return this.data.settings;
  }

  level(id: string): LevelProgress {
    return { ...(this.data.levels[id] ?? EMPTY_PROGRESS) };
  }

  setLevel(id: string, p: LevelProgress): void {
    this.data = { ...this.data, levels: { ...this.data.levels, [id]: { ...p } } };
    this.write();
  }

  setSettings(patch: Partial<Settings>): Settings {
    this.data = { ...this.data, settings: sanitizeSettings({ ...this.data.settings, ...patch }) };
    this.write();
    return this.data.settings;
  }

  get tutorialSkipped(): boolean {
    return this.data.tutorialSkipped;
  }

  setTutorialSkipped(skipped: boolean): void {
    this.data = { ...this.data, tutorialSkipped: skipped };
    this.write();
  }

  get offerSeen(): boolean {
    return this.data.offerSeen;
  }

  setOfferSeen(): void {
    this.data = { ...this.data, offerSeen: true };
    this.write();
  }

  /** Clears progress (settings stay). */
  resetProgress(): void {
    this.data = { ...this.data, levels: {} };
    this.write();
  }

  private write(): void {
    this.store.set(SAVE_KEY, JSON.stringify(this.data));
  }
}
