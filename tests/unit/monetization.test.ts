import { describe, expect, it } from 'vitest';
import { DICTIONARIES, LANGUAGES } from '../../src/i18n';

/** CLAUDE.md: never "Lite", "Demo" or "Trial" in the app (EN or HU). */
describe('monetization wording', () => {
  it('no user-visible text calls the free part Lite / Demo / Trial', () => {
    for (const lang of LANGUAGES) {
      for (const [key, text] of Object.entries(DICTIONARIES[lang])) {
        expect(/\b(lite|demo|trial|próbaverzió)\b/i.test(text), `${lang}:${key}`).toBe(false);
      }
    }
  });
});
