import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_CACHE_KEY,
  FALLBACK_PRICE,
  createMockBackend,
  createPurchases,
  createUnavailableBackend,
} from '../../../src/platform/purchases';
import { createMemoryStore } from '../../../src/platform/storage';

describe('purchases', () => {
  it('buys the full game and keeps it across restarts', async () => {
    const store = createMemoryStore();
    const backend = createMockBackend({ prices: { full_game: '2,99 €' } });
    const p = createPurchases(backend, store);
    let changes = 0;
    p.onChange(() => changes++);
    expect(p.price('full_game')).toBe(FALLBACK_PRICE);
    await p.init();
    expect(p.price('full_game')).toBe('2,99 €');
    expect(p.owns('full_game')).toBe(false);
    expect(await p.buy('full_game')).toBe('purchased');
    expect(p.owns('full_game')).toBe(true);
    expect(p.owns('supporter')).toBe(false);
    expect(changes).toBeGreaterThan(0);
    // A new session (offline even) still has it.
    const again = createPurchases(createMockBackend({ offline: true }), store);
    expect(again.owns('full_game')).toBe(true);
    await again.init();
    expect(again.owns('full_game')).toBe(true);
    expect(await again.buy('full_game')).toBe('purchased');
  });

  it('reports cancel, offline, pending and failure without granting anything', async () => {
    for (const [next, result] of [
      ['cancel', 'cancelled'],
      ['offline', 'offline'],
      ['pending', 'pending'],
      ['fail', 'failed'],
    ] as const) {
      const p = createPurchases(createMockBackend({ next }), createMemoryStore());
      expect(await p.buy('full_game'), next).toBe(result);
      expect(p.owns('full_game')).toBe(false);
    }
  });

  it('restores what the store knows; offline restore keeps the cache', async () => {
    const store = createMemoryStore();
    const backend = createMockBackend({ owned: ['full_game', 'supporter'] });
    const p = createPurchases(backend, store);
    expect(await p.restore()).toEqual(['full_game', 'supporter']);
    expect(p.owns('supporter')).toBe(true);
    backend.behaviour.offline = true;
    expect(await p.restore()).toBeNull();
    expect(p.owns('full_game')).toBe(true);
    // A successful restore is authoritative (e.g. a refund removed the supporter pack).
    backend.behaviour.offline = false;
    backend.behaviour.owned = ['full_game'];
    expect(await p.restore()).toEqual(['full_game']);
    expect(p.owns('supporter')).toBe(false);
  });

  it('init picks up entitlements bought elsewhere but never drops cached ones', async () => {
    const store = createMemoryStore({ [ENTITLEMENT_CACHE_KEY]: '["supporter"]' });
    const p = createPurchases(createMockBackend({ owned: ['full_game'] }), store);
    await p.init();
    expect(p.owns('full_game') && p.owns('supporter')).toBe(true);
  });

  it('survives a corrupt cache', () => {
    for (const bad of ['{', '"x"', '["full_game", 3, "hack"]']) {
      const p = createPurchases(
        createMockBackend(),
        createMemoryStore({ [ENTITLEMENT_CACHE_KEY]: bad }),
      );
      expect(p.owns('supporter')).toBe(false);
    }
    const ok = createPurchases(
      createMockBackend(),
      createMemoryStore({ [ENTITLEMENT_CACHE_KEY]: '["full_game", 3, "hack"]' }),
    );
    expect(ok.owns('full_game')).toBe(true);
  });

  it('without a store nothing can be bought', async () => {
    const p = createPurchases(createUnavailableBackend(), createMemoryStore());
    expect(p.available).toBe(false);
    await p.init();
    expect(await p.buy('full_game')).toBe('failed');
    expect(await p.restore()).toEqual([]);
    expect(p.price('full_game')).toBe(FALLBACK_PRICE);
  });
});
