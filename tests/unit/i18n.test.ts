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
