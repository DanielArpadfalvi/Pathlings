import { hideSplash, installNativePlatform, isNative } from './native';

/**
 * Boot-time platform selection (T7.1): inside the iOS / Android shell the Capacitor
 * implementations are installed (and the save data preloaded) before the game starts; on the web
 * the default web implementations stay and nothing waits.
 */
export async function installPlatform(): Promise<{ native: boolean }> {
  if (!isNative()) return { native: false };
  await installNativePlatform();
  return { native: true };
}

/** The first frame is up: drop the native launch screen. */
export function platformReady(): void {
  hideSplash();
}
