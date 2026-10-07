import { crc32 } from '../core/code/crc32';
import { utf8Encode } from '../core/code/bytes';
import { normalizeCode } from '../core/code/levelCode';
import { loadLevelCode } from '../core/code/verify';
import type { LevelDef } from '../core/level';
import type { KeyValueStore } from '../platform/storage';

/**
 * "My levels" (§1.9 / T4.5): the codes the player published ("mine") or received, with
 * favourites, persisted through the platform store. Codes are the storage format (§3.3), so an
 * entry is just a code plus a little metadata; ids are derived from the code (no duplicates).
 */

export const MY_LEVELS_KEY = 'pathlings.myLevels.v1';
export const DRAFT_KEY = 'pathlings.draft.v1';

export type LevelSource = 'mine' | 'received';

export interface MyLevel {
  id: string;
  code: string;
  title: string;
  author: string;
  source: LevelSource;
  favourite: boolean;
  verified: boolean;
  /** Milliseconds since the epoch (sorting only). */
  addedAt: number;
}

function isEntry(v: unknown): v is MyLevel {
  const e = v as Partial<MyLevel> | null;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof e.id === 'string' &&
    typeof e.code === 'string' &&
    typeof e.title === 'string' &&
    (e.source === 'mine' || e.source === 'received')
  );
}

export function codeId(code: string): string {
  return crc32(utf8Encode(normalizeCode(code)))
    .toString(16)
    .padStart(8, '0');
}

export class MyLevels {
  private entries: MyLevel[];

  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number,
  ) {
    this.entries = this.read();
  }

  private read(): MyLevel[] {
    try {
      const parsed: unknown = JSON.parse(this.store.get(MY_LEVELS_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch {
      return []; // corrupted storage: start empty rather than crash
    }
  }

  private write(): void {
    this.store.set(MY_LEVELS_KEY, JSON.stringify(this.entries));
  }

  /** Favourites first, then newest first; optionally only one source. */
  list(source?: LevelSource): MyLevel[] {
    return this.entries
      .filter((e) => !source || e.source === source)
      .sort((a, b) => Number(b.favourite) - Number(a.favourite) || b.addedAt - a.addedAt);
  }

  get(id: string): MyLevel | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /**
   * Adds a code (decoded and verified first; throws `LevelCodeError` for bad codes). A code
   * already in the collection is not duplicated; a received code the player re-publishes
   * becomes "mine".
   */
  add(code: string, source: LevelSource): MyLevel {
    const clean = normalizeCode(code);
    const id = codeId(clean);
    const existing = this.get(id);
    if (existing) {
      if (source === 'mine' && existing.source !== 'mine') {
        existing.source = 'mine';
        this.write();
      }
      return existing;
    }
    const { level, verify } = loadLevelCode(clean);
    const entry: MyLevel = {
      id,
      code: clean,
      title: level.title,
      author: level.author,
      source,
      favourite: false,
      verified: verify.verified,
      addedAt: this.now(),
    };
    this.entries.push(entry);
    this.write();
    return entry;
  }

  toggleFavourite(id: string): void {
    const e = this.get(id);
    if (!e) return;
    e.favourite = !e.favourite;
    this.write();
  }

  remove(id: string): void {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    if (this.entries.length !== before) this.write();
  }

  /** The decoded level of an entry (for playing or editing). */
  level(id: string): LevelDef | null {
    const e = this.get(id);
    if (!e) return null;
    try {
      return loadLevelCode(e.code).level;
    } catch {
      return null;
    }
  }
}

// --- Editor draft autosave --------------------------------------------------------------------

function looksLikeLevel(v: unknown): v is LevelDef {
  const l = v as Partial<LevelDef> | null;
  return (
    typeof l === 'object' &&
    l !== null &&
    typeof l.w === 'number' &&
    typeof l.h === 'number' &&
    Array.isArray(l.ops) &&
    Array.isArray(l.objects) &&
    typeof l.skills === 'object'
  );
}

export function saveDraft(store: KeyValueStore, level: LevelDef): void {
  store.set(DRAFT_KEY, JSON.stringify(level));
}

export function loadDraft(store: KeyValueStore): LevelDef | null {
  try {
    const parsed: unknown = JSON.parse(store.get(DRAFT_KEY) ?? 'null');
    return looksLikeLevel(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft(store: KeyValueStore): void {
  store.remove(DRAFT_KEY);
}
