import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DICTIONARIES,
  LANGUAGES,
  detectLanguage,
  format,
  getLanguage,
  onLanguageChange,
  setLanguage,
  t,
} from '../../src/i18n';
import { en } from '../../src/i18n/en';

describe('i18n', () => {
  it('every language has exactly the English keys, all non-empty', () => {
    const keys = Object.keys(en).sort();
    for (const lang of LANGUAGES) {
      const dict = DICTIONARIES[lang];
      expect(Object.keys(dict).sort(), lang).toEqual(keys);
      for (const value of Object.values(dict)) expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it('detects the device language with English fallback', () => {
    expect(detectLanguage(['hu-HU', 'en-US'])).toBe('hu');
    expect(detectLanguage(['de-DE', 'en-GB'])).toBe('en');
    expect(detectLanguage(['fr'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });

  it('switches language and notifies listeners', () => {
    // Start from English whatever the host locale is (Node 22 exposes `navigator.language`,
    // so on a Hungarian machine the detected start language is already 'hu').
    setLanguage('en');
    const seen: string[] = [];
    const off = onLanguageChange((l) => seen.push(l));
    setLanguage('hu');
    expect(getLanguage()).toBe('hu');
    expect(t('app.tagline')).toBe('Vezesd haza őket!');
    setLanguage('en');
    expect(t('app.tagline')).toBe('Guide them home.');
    off();
    setLanguage('hu');
    expect(seen).toEqual(['hu', 'en']);
    setLanguage('en');
  });

  it('formats placeholders', () => {
    expect(format('{a} of {b}', { a: 3, b: 'ten' })).toBe('3 of ten');
    expect(format('{missing}', { a: 1 })).toBe('{missing}');
  });
});

describe('i18n audit (T6.4)', () => {
  it('every translation uses exactly the placeholders of the English text', () => {
    const names = (text: string): string[] =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const lang of LANGUAGES) {
      for (const [key, value] of Object.entries(DICTIONARIES[lang])) {
        expect(names(value), `${lang} ${key}`).toEqual(names(en[key as keyof typeof en]));
      }
    }
  });

  it('the UI has no hard-coded user-visible text (everything goes through t())', () => {
    const dir = join(import.meta.dirname, '..', '..', 'src', 'ui');
    // Language names are shown in their own language on purpose.
    const allowed = new Set(['English', 'Magyar']);
    const found: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      const lines = readFileSync(join(dir, file), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const at = `${file}:${i + 1}`;
        // Literal accessible names / tooltips / placeholders.
        for (const m of line.matchAll(
          /(?:aria-label|title|placeholder|alt)="([^"]*[A-Za-z][^"]*)"/g,
        )) {
          found.push(`${at} ${m[0]}`);
        }
        // Text nodes on their own line inside JSX (after a line ending in '>').
        const text = line.trim();
        const prev = (lines[i - 1] ?? '').trim();
        if (
          /^[A-Za-zÀ-ű][^<>{}=;()]*$/.test(text) &&
          prev.endsWith('>') &&
          !prev.endsWith('=>') &&
          !allowed.has(text)
        ) {
          found.push(`${at} ${text}`);
        }
        // Inline text nodes: >Some words<
        for (const m of line.matchAll(/>([^<>{}():;=]*[A-Za-z]{2,}[^<>{}():;=]*)</g)) {
          if (!allowed.has(m[1]!.trim())) found.push(`${at} ${m[1]}`);
        }
      });
    }
    expect(found).toEqual([]);
  });
});
