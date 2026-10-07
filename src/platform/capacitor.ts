import { App } from '@capacitor/app';
import { Clipboard as CapClipboard } from '@capacitor/clipboard';
import { Haptics as CapHaptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { type Clipboard, setClipboard } from './clipboard';
import { type HapticKind, type Haptics, setHaptics } from './haptics';
import { type Lifecycle, setLifecycle } from './lifecycle';
import { type Sharer, setSharer } from './share';
import { type KeyValueStore, createMemoryStore, setStore } from './storage';

/**
 * Native implementations (Capacitor 8) of the platform interfaces, installed by
 * `installPlatform` on iOS / Android only. The only module that imports `@capacitor/*` plugins.
 */

/** Our keys all start with this; nothing else is preloaded from Preferences. */
const KEY_PREFIX = 'pathlings.';

/**
 * Preferences is async while the game reads its save synchronously, so every key is preloaded
 * once at start and writes go through in the background (order is preserved per call).
 * On the very first native start, data a web build left in the WebView's localStorage is copied.
 */
export async function createNativeStore(): Promise<KeyValueStore> {
  const memory = createMemoryStore();
  const { keys } = await Preferences.keys();
  const ours = keys.filter((k) => k.startsWith(KEY_PREFIX));
  for (const key of ours) {
    const { value } = await Preferences.get({ key });
    if (value !== null) memory.set(key, value);
  }
  if (ours.length === 0) {
    try {
      const ls = globalThis.localStorage;
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        const v = k ? ls.getItem(k) : null;
        if (k?.startsWith(KEY_PREFIX) && v !== null) {
          memory.set(k, v);
          void Preferences.set({ key: k, value: v });
        }
      }
    } catch {
      // No localStorage: nothing to migrate.
    }
  }
  let queue = Promise.resolve();
  const later = (job: () => Promise<void>): void => {
    queue = queue.then(job).catch(() => undefined);
  };
  return {
    get: (k) => memory.get(k),
    set(k, v) {
      memory.set(k, v);
      later(() => Preferences.set({ key: k, value: v }));
      return true;
    },
    remove(k) {
      memory.remove(k);
      later(() => Preferences.remove({ key: k }));
    },
  };
}

const IMPACT: Record<Exclude<HapticKind, 'warning'>, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

export function createNativeHaptics(): Haptics {
  return {
    trigger(kind) {
      const done =
        kind === 'warning'
          ? CapHaptics.notification({ type: NotificationType.Warning })
          : CapHaptics.impact({ style: IMPACT[kind] });
      done.catch(() => undefined);
    },
  };
}

export function createNativeClipboard(): Clipboard {
  return {
    async write(text) {
      try {
        await CapClipboard.write({ string: text });
        return true;
      } catch {
        return false;
      }
    },
    async read() {
      try {
        const r = await CapClipboard.read();
        return r.type === 'text/plain' || typeof r.value === 'string' ? r.value : null;
      } catch {
        return null;
      }
    },
  };
}

export function createNativeSharer(): Sharer {
  return {
    async share(text, title) {
      try {
        await Share.share({ title, text, dialogTitle: title });
        return 'shared';
      } catch (e) {
        const msg = e instanceof Error ? e.message.toLowerCase() : '';
        return msg.includes('cancel') ? 'cancelled' : 'failed';
      }
    },
  };
}

export function createNativeLifecycle(): Lifecycle {
  return {
    onPause(listener) {
      void App.addListener('pause', listener);
    },
    onResume(listener) {
      void App.addListener('resume', listener);
    },
    onBack(listener) {
      void App.addListener('backButton', () => {
        if (!listener()) void App.minimizeApp();
      });
    },
    onOpenUrl(listener) {
      void App.addListener('appUrlOpen', (e) => listener(e.url));
      void App.getLaunchUrl().then((r) => {
        if (r?.url) listener(r.url);
      });
    },
    exit() {
      void App.minimizeApp();
    },
  };
}

/** Installs every native implementation; resolves once the save is preloaded. */
export async function installNative(): Promise<void> {
  setStore(await createNativeStore());
  setHaptics(createNativeHaptics());
  setClipboard(createNativeClipboard());
  setSharer(createNativeSharer());
  setLifecycle(createNativeLifecycle());
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // Status bar control is not available everywhere (e.g. some tablets): keep the default.
  }
}

/** Hide the launch splash once the first frame is ready. */
export function hideSplash(): void {
  SplashScreen.hide().catch(() => undefined);
}
