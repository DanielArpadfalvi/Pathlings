import { Capacitor } from '@capacitor/core';

/**
 * Picks the platform implementations before the game starts: on iOS / Android the Capacitor
 * plugins (loaded lazily so the web build does not carry them up front), on the web the
 * defaults already in place.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function installPlatform(): Promise<void> {
  if (!isNative()) return;
  const native = await import('./capacitor');
  await native.installNative();
}

/** Called once the first frame is on screen. */
export async function platformReady(): Promise<void> {
  if (!isNative()) return;
  const native = await import('./capacitor');
  native.hideSplash();
}
