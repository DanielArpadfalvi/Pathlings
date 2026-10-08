/**
 * Key-value storage behind the platform layer (§3.3: Capacitor Preferences on devices,
 * localStorage on the web). Values are strings; callers serialize. Every call is wrapped so a
 * blocked or full storage never crashes the game (it just does not persist).
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

/** In-memory store (tests, private mode fallback). */
export function createMemoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => {
      map.set(k, v);
      return true;
    },
    remove: (k) => {
      map.delete(k);
    },
  };
}

export function createWebStore(): KeyValueStore {
  const ls = (): Storage | null => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  };
  const memory = createMemoryStore();
  return {
    get(k) {
      try {
        return ls()?.getItem(k) ?? memory.get(k);
      } catch {
        return memory.get(k);
      }
    },
    set(k, v) {
      memory.set(k, v);
      try {
        ls()?.setItem(k, v);
        return true;
      } catch {
        return false;
      }
    },
    remove(k) {
      memory.remove(k);
      try {
        ls()?.removeItem(k);
      } catch {
        // ignore
      }
    },
  };
}

/** An asynchronous key-value store (Capacitor Preferences on devices). */
export interface AsyncKeyValueBackend {
  /** Every stored entry the game owns. */
  load(): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * The game reads storage synchronously, devices store asynchronously: everything is loaded into
 * memory once at boot, reads come from memory, writes update memory at once and are written
 * through in order (per key, the last write wins). A failing backend never throws into the game.
 */
export async function createPreloadedStore(backend: AsyncKeyValueBackend): Promise<
  KeyValueStore & {
    /** Resolves when every write so far has reached the backend (tests, app pause). */
    flushed(): Promise<void>;
  }
> {
  let initial: Record<string, string>;
  try {
    initial = await backend.load();
  } catch {
    initial = {};
  }
  const memory = createMemoryStore(initial);
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (op: () => Promise<void>): void => {
    queue = queue.then(op).catch(() => undefined);
  };
  return {
    get: (k) => memory.get(k),
    set(k, v) {
      memory.set(k, v);
      enqueue(() => backend.set(k, v));
      return true;
    },
    remove(k) {
      memory.remove(k);
      enqueue(() => backend.remove(k));
    },
    flushed: () => queue,
  };
}

let current: KeyValueStore | null = null;

export function getStore(): KeyValueStore {
  current ??= createWebStore();
  return current;
}

/** Native shell (T7.1) or tests install their implementation here. */
export function setStore(s: KeyValueStore): void {
  current = s;
}
