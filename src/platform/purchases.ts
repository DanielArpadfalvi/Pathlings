import type { KeyValueStore } from './storage';

/**
 * In-app purchases behind the platform layer (§2, T8.1). Two non-consumable entitlements:
 * `full_game` (all worlds, the bonus pool and the daily archive) and `supporter` (cosmetic only).
 * `createPurchases` wraps a store backend (RevenueCat on devices, a mock on the web and in tests)
 * with what the game needs: localized prices, buy / restore with plain outcomes and an
 * offline-safe entitlement cache (an owned entitlement is never lost because the store is
 * unreachable; only a successful answer from the store can change it).
 */

export const ENTITLEMENTS = ['full_game', 'supporter'] as const;
export type EntitlementId = (typeof ENTITLEMENTS)[number];

/** Store product ids (App Store Connect / Play Console) of each entitlement. */
export const PRODUCT_IDS: Readonly<Record<EntitlementId, string>> = {
  full_game: 'pathlings_full_game',
  supporter: 'pathlings_supporter',
};

/** Shown until the store answers (and on the web, where nothing can be bought). */
export const FALLBACK_PRICE = '$2.99';

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending' | 'offline' | 'failed';

/** A store error, classified by the backend. */
export class StoreError extends Error {
  constructor(
    readonly kind: 'cancelled' | 'pending' | 'offline' | 'unavailable' | 'failed',
    message: string = kind,
  ) {
    super(message);
  }
}

/** The thin store adapter (RevenueCat or a mock). Every call may throw `StoreError`. */
export interface StoreBackend {
  /** Whether buying is possible at all on this platform. */
  readonly available: boolean;
  configure(): Promise<void>;
  /** Localized price strings by entitlement (missing: unknown). */
  prices(): Promise<Partial<Record<EntitlementId, string>>>;
  /** Active entitlements according to the store. */
  active(): Promise<EntitlementId[]>;
  buy(id: EntitlementId): Promise<EntitlementId[]>;
  restore(): Promise<EntitlementId[]>;
}

export interface Purchases {
  readonly available: boolean;
  /** Owned entitlements (cached; usable offline right away). */
  owns(id: EntitlementId): boolean;
  price(id: EntitlementId): string;
  /** Talks to the store once: prices and a fresh entitlement check. Never throws. */
  init(): Promise<void>;
  buy(id: EntitlementId): Promise<PurchaseOutcome>;
  /** Resolves to the owned entitlements, or null when the store could not be reached. */
  restore(): Promise<EntitlementId[] | null>;
  onChange(listener: () => void): () => void;
}

export const ENTITLEMENT_CACHE_KEY = 'pathlings.entitlements.v1';

function readCache(store: KeyValueStore): Set<EntitlementId> {
  try {
    const raw = JSON.parse(store.get(ENTITLEMENT_CACHE_KEY) ?? '[]') as unknown;
    return new Set(
      Array.isArray(raw) ? raw.filter((x): x is EntitlementId => ENTITLEMENTS.includes(x)) : [],
    );
  } catch {
    return new Set();
  }
}

function outcome(e: unknown): PurchaseOutcome {
  if (e instanceof StoreError) {
    if (e.kind === 'unavailable') return 'failed';
    return e.kind;
  }
  return 'failed';
}

export function createPurchases(backend: StoreBackend, store: KeyValueStore): Purchases {
  let owned = readCache(store);
  const prices: Partial<Record<EntitlementId, string>> = {};
  const listeners = new Set<() => void>();
  let configured: Promise<void> | null = null;

  const setOwned = (ids: readonly EntitlementId[], merge: boolean): void => {
    const next = new Set<EntitlementId>(merge ? [...owned, ...ids] : ids);
    const changed = next.size !== owned.size || [...next].some((x) => !owned.has(x));
    owned = next;
    store.set(ENTITLEMENT_CACHE_KEY, JSON.stringify([...owned].sort()));
    if (changed) for (const l of [...listeners]) l();
  };
  const ready = (): Promise<void> => (configured ??= backend.configure());

  return {
    get available() {
      return backend.available;
    },
    owns: (id) => owned.has(id),
    price: (id) => prices[id] ?? FALLBACK_PRICE,
    async init() {
      if (!backend.available) return;
      try {
        await ready();
        Object.assign(prices, await backend.prices());
        // Non-consumables are never revoked by "not found" answers on a flaky network: the
        // cached set only grows here; a restore is the explicit, authoritative refresh.
        setOwned(await backend.active(), true);
        for (const l of [...listeners]) l();
      } catch {
        // Offline or store trouble: keep the cache.
      }
    },
    async buy(id) {
      if (owned.has(id)) return 'purchased';
      if (!backend.available) return 'failed';
      try {
        await ready();
        const now = await backend.buy(id);
        setOwned(now, true);
        return owned.has(id) ? 'purchased' : 'pending';
      } catch (e) {
        return outcome(e);
      }
    },
    async restore() {
      if (!backend.available) return [...owned];
      try {
        await ready();
        setOwned(await backend.restore(), false);
        return [...owned];
      } catch {
        return null;
      }
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Scripted backend for the web build, e2e (`?iap=mock`) and unit tests. */
export interface MockBehaviour {
  available?: boolean;
  /** What the next purchase does. */
  next?: 'succeed' | 'cancel' | 'offline' | 'pending' | 'fail';
  /** Entitlements the store already knows (restore / init return them). */
  owned?: EntitlementId[];
  prices?: Partial<Record<EntitlementId, string>>;
  /** Every call fails as offline. */
  offline?: boolean;
}

export function createMockBackend(
  b: MockBehaviour = {},
): StoreBackend & { behaviour: MockBehaviour } {
  const behaviour: MockBehaviour = { available: true, next: 'succeed', owned: [], ...b };
  const check = (): void => {
    if (behaviour.offline) throw new StoreError('offline');
  };
  return {
    behaviour,
    get available() {
      return behaviour.available !== false;
    },
    async configure() {},
    async prices() {
      check();
      return { full_game: '$2.99', supporter: '$2.99', ...behaviour.prices };
    },
    async active() {
      check();
      return [...(behaviour.owned ?? [])];
    },
    async buy(id) {
      check();
      switch (behaviour.next) {
        case 'cancel':
          throw new StoreError('cancelled');
        case 'offline':
          throw new StoreError('offline');
        case 'fail':
          throw new StoreError('failed');
        case 'pending':
          throw new StoreError('pending');
        default:
          behaviour.owned = [...new Set([...(behaviour.owned ?? []), id])];
          return [...behaviour.owned];
      }
    },
    async restore() {
      check();
      return [...(behaviour.owned ?? [])];
    },
  };
}

/** No store (plain web build): nothing can be bought, prices show the fallback. */
export function createUnavailableBackend(): StoreBackend {
  const no = async (): Promise<never> => {
    throw new StoreError('unavailable');
  };
  return {
    available: false,
    configure: async () => {},
    prices: async () => ({}),
    active: async () => [],
    buy: no,
    restore: no,
  };
}

let current: Purchases | null = null;

export function getPurchases(): Purchases {
  if (!current) throw new Error('purchases not installed');
  return current;
}

export function setPurchases(p: Purchases): void {
  current = p;
}

export function hasPurchases(): boolean {
  return current !== null;
}
