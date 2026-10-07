import { Capacitor } from '@capacitor/core';
import {
  type MockBehaviour,
  createMockBackend,
  createPurchases,
  createUnavailableBackend,
  setPurchases,
} from './purchases';
import { getStore } from './storage';

/**
 * Picks the platform implementations before the game starts: on iOS / Android the Capacitor
 * plugins and RevenueCat (loaded lazily so the web build does not carry them up front), on the
 * web the defaults already in place. Purchases on the web: unavailable, or a scripted mock with
 * `?iap=mock` (buys succeed) / `?iap=owned` (the store already knows the full game; for restore).
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function webBackend(search: string) {
  const iap = new URLSearchParams(search).get('iap');
  const behaviour: MockBehaviour | null =
    iap === 'mock'
      ? {}
      : iap === 'owned'
        ? { owned: ['full_game'] }
        : iap === 'cancel'
          ? { next: 'cancel' }
          : null;
  return behaviour ? createMockBackend(behaviour) : createUnavailableBackend();
}

export async function installPlatform(search = globalThis.location?.search ?? ''): Promise<void> {
  if (!isNative()) {
    setPurchases(createPurchases(webBackend(search), getStore()));
    return;
  }
  const native = await import('./capacitor');
  await native.installNative();
  const { createRevenueCatBackend } = await import('./revenuecat');
  const key =
    Capacitor.getPlatform() === 'ios'
      ? import.meta.env.VITE_REVENUECAT_IOS_KEY
      : import.meta.env.VITE_REVENUECAT_ANDROID_KEY;
  setPurchases(createPurchases(createRevenueCatBackend(key), getStore()));
}

/** Called once the first frame is on screen. */
export async function platformReady(): Promise<void> {
  if (!isNative()) return;
  const native = await import('./capacitor');
  native.hideSplash();
}
