import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES, LANGUAGES } from '../../src/i18n';

/**
 * T9.1: store texts fit the App Store / Play limits, the first line says what is free and the
 * price, and nothing names the reference game, its creatures or skills, or calls the free part a
 * Lite / Demo / Trial (CLAUDE.md, App Review 2.2 / 2.3.7).
 */

interface Listing {
  name: string;
  appStoreSubtitle: string;
  appStorePromo: string;
  playShortDescription: string;
  keywords: string;
  description: string;
}

const listing = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../docs/store/listing.json'), 'utf8'),
) as Record<'en' | 'hu', Listing>;

const LIMITS: Record<keyof Listing, number> = {
  name: 30,
  appStoreSubtitle: 30,
  appStorePromo: 170,
  playShortDescription: 80,
  keywords: 100,
  description: 4000,
};

/** Words that must never appear (reference game, its creatures and skill names, gating words). */
const BANNED = [
  /lemming/i,
  /\b(lite|demo|trial|próbaverzió)\b/i,
  /\b(Climbers?|Floaters?|Bombers?|Blockers?|Builders?|Bashers?|Miners?|Diggers?)\b/,
];

describe('store listing', () => {
  for (const lang of ['en', 'hu'] as const) {
    it(`${lang}: fits every store limit`, () => {
      for (const [field, max] of Object.entries(LIMITS) as [keyof Listing, number][]) {
        expect([...listing[lang][field]].length, `${lang}.${field}`).toBeLessThanOrEqual(max);
        expect(listing[lang][field].trim().length, `${lang}.${field}`).toBeGreaterThan(0);
      }
    });

    it(`${lang}: the first line states what is free and the unlock price`, () => {
      const first = listing[lang].description.split('\n')[0]!;
      expect(first).toMatch(lang === 'en' ? /free/i : /ingyen/i);
      expect(first).toMatch(/30/);
      expect(first).toMatch(/2[.,]99/);
    });

    it(`${lang}: no banned names or words`, () => {
      for (const text of Object.values(listing[lang])) {
        for (const re of BANNED)
          expect(re.test(text), `${re} in "${text.slice(0, 60)}…"`).toBe(false);
      }
    });
  }

  it('the app texts avoid the reference game too', () => {
    for (const lang of LANGUAGES) {
      for (const [key, text] of Object.entries(DICTIONARIES[lang])) {
        for (const re of BANNED) expect(re.test(text), `${lang}:${key}`).toBe(false);
      }
    }
  });
});
