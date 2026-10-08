/**
 * Opened links behind the platform layer (T7.4). Web: the page URL at start-up and later
 * `hashchange`s; native: the launch URL and `appUrlOpen` (installed by `platform/native.ts`).
 * A listener added after a link arrived still receives it (the app subscribes after boot).
 */
export interface DeepLinks {
  onUrl(listener: (url: string) => void): () => void;
}

export interface DeepLinkHub extends DeepLinks {
  emit(url: string): void;
}

export function createDeepLinkHub(): DeepLinkHub {
  const listeners = new Set<(url: string) => void>();
  const pending: string[] = [];
  return {
    onUrl(listener) {
      listeners.add(listener);
      for (const url of pending.splice(0)) listener(url);
      return () => listeners.delete(listener);
    },
    emit(url) {
      if (listeners.size === 0) pending.push(url);
      for (const l of [...listeners]) l(url);
    },
  };
}

export function createWebDeepLinks(win: Window | undefined = globalThis.window): DeepLinks {
  const hub = createDeepLinkHub();
  if (win) {
    hub.emit(win.location.href);
    win.addEventListener('hashchange', () => hub.emit(win.location.href));
  }
  return hub;
}

let current: DeepLinks | null = null;

export function getDeepLinks(): DeepLinks {
  current ??= createWebDeepLinks();
  return current;
}

export function setDeepLinks(d: DeepLinks): void {
  current = d;
}
