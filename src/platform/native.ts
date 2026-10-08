import { App } from '@capacitor/app';
import { Clipboard as CapClipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';
import { Haptics as CapHaptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { setClipboard } from './clipboard';
import { type HapticKind, setHaptics } from './haptics';
import { createLifecycleCore, setLifecycle } from './lifecycle';
import { setSharer } from './share';
import { type AsyncKeyValueBackend, createPreloadedStore, setStore } from './storage';

/**
 * The Capacitor (iOS / Android) implementations of the platform services (T7.1). This is the only
 * module that imports `@capacitor/*` (enforced by a unit test); `installPlatform` picks it at
 * boot. Every plugin call is guarded: a missing plugin or OS feature degrades to "no effect".
 */

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

async function safely<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await op();
  } catch {
    return fallback;
  }
}

/** Only the game's own keys are loaded into memory at boot. */
const KEY_PREFIX = 'pathlings.';

const preferencesBackend: AsyncKeyValueBackend = {
  async load() {
    const { keys } = await Preferences.keys();
    const out: Record<string, string> = {};
    for (const key of keys.filter((k) => k.startsWith(KEY_PREFIX))) {
      const { value } = await Preferences.get({ key });
      if (value !== null) out[key] = value;
    }
    return out;
  },
  set: (key, value) => Preferences.set({ key, value }),
  remove: (key) => Preferences.remove({ key }),
};

const IMPACT: Record<Exclude<HapticKind, 'warning'>, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

/** Installs every native service; resolves once the save data is in memory. */
export async function installNativePlatform(): Promise<void> {
  setStore(await createPreloadedStore(preferencesBackend));

  setHaptics({
    trigger(kind) {
      void safely(
        () =>
          kind === 'warning'
            ? CapHaptics.notification({ type: NotificationType.Warning })
            : CapHaptics.impact({ style: IMPACT[kind] }),
        undefined,
      );
    },
  });

  setClipboard({
    write: (text) =>
      safely(async () => {
        await CapClipboard.write({ string: text });
        return true;
      }, false),
    read: () =>
      safely(async () => {
        const r = await CapClipboard.read();
        return r.type.startsWith('text') ? r.value : null;
      }, null),
  });

  setSharer({
    async share(text, title) {
      try {
        await Share.share({ title, text, dialogTitle: title });
        return 'shared';
      } catch (e) {
        // Both plugins report a dismissed sheet as an error ("Share canceled").
        return e instanceof Error && /cancel/i.test(e.message) ? 'cancelled' : 'failed';
      }
    },
  });

  const lifecycle = createLifecycleCore(() => void safely(() => App.exitApp(), undefined));
  void safely(() => App.addListener('pause', () => lifecycle.emitPause()), undefined);
  void safely(() => App.addListener('resume', () => lifecycle.emitResume()), undefined);
  // A backButton listener replaces Android's default; the stack decides (exit when unhandled).
  void safely(() => App.addListener('backButton', () => void lifecycle.back()), undefined);
  setLifecycle(lifecycle);
}

/** The first frame is on screen: drop the launch screen. */
export function hideSplash(): void {
  if (isNative()) void safely(() => SplashScreen.hide({ fadeOutDuration: 200 }), undefined);
}
