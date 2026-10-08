import { looksLikeCode } from '../core/code/levelCode';

/**
 * Level-code links (§1.9, T7.4): a shared link opens "Play a code" with the level loaded.
 * Accepted forms (the code is base64url, so it survives URLs unescaped):
 * - `https://<site>/l#PL1-…` (any path; the code in the fragment never reaches a server),
 * - `…?code=PL1-…`,
 * - the app's own scheme: `pathlings://l#PL1-…`, `pathlings://l/PL1-…`, `pathlings://PL1-…`.
 */
export const LINK_SCHEME = 'pathlings';

export function codeFromUrl(url: string): string | null {
  let text = url.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    // Keep the raw text: a stray "%" must not hide the code.
  }
  const candidates: string[] = [];
  const hash = text.indexOf('#');
  if (hash >= 0) candidates.push(text.slice(hash + 1));
  const query = /[?&]code=([^&#]+)/i.exec(text);
  if (query?.[1]) candidates.push(query[1]);
  const scheme = new RegExp(`^${LINK_SCHEME}://(?:l/)?([^#?]+)$`, 'i').exec(text);
  if (scheme?.[1]) candidates.push(scheme[1]);
  return candidates.find((c) => looksLikeCode(c)) ?? null;
}
