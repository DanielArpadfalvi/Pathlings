/**
 * App lifecycle behind the platform layer (T7.1): going to the background, coming back, the
 * Android back button and deep links (T7.4). Web: `visibilitychange`, Escape as "back" and the
 * page URL; the native shell installs Capacitor App via `setLifecycle`.
 */
export interface Lifecycle {
  /** The app went to the background (or the tab was hidden). */
  onPause(listener: () => void): void;
  onResume(listener: () => void): void;
  /** System back. The listener returns true when it handled it (closed something). */
  onBack(listener: () => boolean): void;
  /** A link opened the app (`https://…/l#PL1-…` or `pathlings://l/PL1-…`). */
  onOpenUrl(listener: (url: string) => void): void;
  /** Leave the app (Android back on the main menu); no-op on the web. */
  exit(): void;
}

export function createWebLifecycle(win: Window | undefined = globalThis.window): Lifecycle {
  return {
    onPause(listener) {
      win?.document.addEventListener('visibilitychange', () => {
        if (win.document.visibilityState === 'hidden') listener();
      });
    },
    onResume(listener) {
      win?.document.addEventListener('visibilitychange', () => {
        if (win.document.visibilityState === 'visible') listener();
      });
    },
    onBack(listener) {
      win?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') listener();
      });
    },
    onOpenUrl(listener) {
      if (win?.location.hash) listener(win.location.href);
      win?.addEventListener('hashchange', () => listener(win.location.href));
    },
    exit() {},
  };
}

let current: Lifecycle | null = null;

export function getLifecycle(): Lifecycle {
  current ??= createWebLifecycle();
  return current;
}

export function setLifecycle(l: Lifecycle): void {
  current = l;
}
