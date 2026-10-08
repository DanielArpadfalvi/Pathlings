import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LINK_SCHEME, codeFromUrl } from '../../src/app/deepLink';
import { createDeepLinkHub } from '../../src/platform/deepLinks';

const CODE = 'PL1-AbCdEf_GhIj-KlMnOp';
const ROOT = join(import.meta.dirname, '..', '..');

describe('level-code links (T7.4)', () => {
  it('finds the code in web links, query strings and the app scheme', () => {
    for (const url of [
      `https://pathlings.example/l#${CODE}`,
      `https://pathlings.example/any/path/#${CODE}`,
      `https://pathlings.example/l?code=${CODE}`,
      `https://pathlings.example/l?code=${encodeURIComponent(CODE)}&x=1`,
      `pathlings://l#${CODE}`,
      `pathlings://l/${CODE}`,
      `PATHLINGS://${CODE}`,
    ]) {
      expect(codeFromUrl(url), url).toBe(CODE);
    }
  });

  it('ignores links without a code', () => {
    for (const url of [
      'https://pathlings.example/',
      'https://pathlings.example/#top',
      'pathlings://settings',
      'https://pathlings.example/l#PL1-',
      '%E0%A4%A',
      '',
    ]) {
      expect(codeFromUrl(url), url).toBeNull();
    }
  });

  it('keeps links that arrive before anyone listens', () => {
    const hub = createDeepLinkHub();
    hub.emit('a');
    const seen: string[] = [];
    const off = hub.onUrl((u) => seen.push(u));
    hub.emit('b');
    off();
    hub.emit('c');
    expect(seen).toEqual(['a', 'b']);
  });

  it('the native projects register the app scheme', () => {
    const manifest = readFileSync(join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain(`android:scheme="${LINK_SCHEME}"`);
    const plist = readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8');
    expect(plist).toMatch(
      new RegExp(`CFBundleURLSchemes</key>\\s*<array>\\s*<string>${LINK_SCHEME}</string>`),
    );
  });
});
