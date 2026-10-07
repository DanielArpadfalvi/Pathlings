import { getClipboard } from './clipboard';

/**
 * System share sheet behind the platform layer (§1.9: share level codes as text). Web: the Web
 * Share API where available, otherwise the text is copied to the clipboard. The native shell
 * (T7.1) installs Capacitor Share via `setSharer`.
 */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface Sharer {
  share(text: string, title: string): Promise<ShareOutcome>;
}

export function createWebSharer(
  nav: Partial<Navigator> | undefined = globalThis.navigator,
): Sharer {
  return {
    async share(text, title) {
      if (nav?.share) {
        try {
          await nav.share({ title, text });
          return 'shared';
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
          // Fall through to copying.
        }
      }
      return (await getClipboard().write(text)) ? 'copied' : 'failed';
    },
  };
}

let current: Sharer | null = null;

export function getSharer(): Sharer {
  current ??= createWebSharer();
  return current;
}

export function setSharer(s: Sharer): void {
  current = s;
}
