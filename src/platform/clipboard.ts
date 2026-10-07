/**
 * Clipboard behind the platform layer (level codes, §1.9). Web: the async Clipboard API with a
 * hidden-textarea fallback for copying; the native shell (T7.1) installs its own implementation.
 */
export interface Clipboard {
  /** Copies text; resolves to whether it worked. */
  write(text: string): Promise<boolean>;
  /** Reads text (may be refused by the browser): null when unavailable. */
  read(): Promise<string | null>;
}

export function createWebClipboard(): Clipboard {
  return {
    async write(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Older browsers / insecure contexts: copy via a temporary selection.
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          return ok;
        } catch {
          return false;
        }
      }
    },
    async read() {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return null;
      }
    },
  };
}

let current: Clipboard | null = null;

export function getClipboard(): Clipboard {
  current ??= createWebClipboard();
  return current;
}

/** Native shell (T7.1) or tests install their implementation here. */
export function setClipboard(c: Clipboard): void {
  current = c;
}
