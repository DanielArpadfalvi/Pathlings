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

let current: KeyValueStore | null = null;

export function getStore(): KeyValueStore {
  current ??= createWebStore();
  return current;
}

/** Native shell (T7.1) or tests install their implementation here. */
export function setStore(s: KeyValueStore): void {
  current = s;
}
