import { looksLikeCode, normalizeCode } from '../core/code/levelCode';

/**
 * Level-code links (T7.4): `https://<site>/l#PL1-…` (web and Android App Links / iOS Universal
 * Links) and the custom scheme `pathlings://l/PL1-…`. Returns the code or null for anything else.
 */
export const LINK_SCHEME = 'pathlings';

export function codeFromUrl(url: string): string | null {
  let candidate: string | null = null;
  try {
    const u = new URL(url);
    if (u.protocol === `${LINK_SCHEME}:`) {
      // pathlings://l/PL1-…  → host "l", path "/PL1-…"
      const rest = `${u.host}${u.pathname}`.replace(/^\/+/, '');
      candidate = rest.startsWith('l/') ? rest.slice(2) : null;
    } else if (u.protocol === 'https:' || u.protocol === 'http:') {
      if (/\/l\/?$/.test(u.pathname) || u.pathname === '/' || u.pathname.endsWith('/index.html')) {
        candidate = u.hash.replace(/^#/, '') || null;
      }
    }
  } catch {
    return null;
  }
  if (!candidate) return null;
  const code = normalizeCode(decodeURIComponent(candidate));
  return looksLikeCode(code) ? code : null;
}

/** The share link of a code (`base` = the site, e.g. `https://example.com`). */
export function linkForCode(code: string, base: string): string {
  return `${base.replace(/\/+$/, '')}/l#${normalizeCode(code)}`;
}
