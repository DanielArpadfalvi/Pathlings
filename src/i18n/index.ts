import { en, type TranslationKey } from './en';
import { hu } from './hu';

export type { TranslationKey };

export const LANGUAGES = ['en', 'hu'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

export const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { en, hu };

const listeners = new Set<(language: Language) => void>();
let current: Language = detectLanguage(navigatorLanguages());

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Picks the first supported language from BCP 47 tags (e.g. `navigator.languages`). */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

/** The device's preferred supported language (the "automatic" language setting). */
export function systemLanguage(): Language {
  return detectLanguage(navigatorLanguages());
}

function navigatorLanguages(): string[] {
  const nav = globalThis.navigator as Navigator | undefined;
  if (!nav) return [];
  if (nav.languages && nav.languages.length > 0) return [...nav.languages];
  return nav.language ? [nav.language] : [];
}

export function getLanguage(): Language {
  return current;
}

/** Switches the UI language (persistence arrives with the save system, T6.3). */
export function setLanguage(language: Language): void {
  if (language === current) return;
  current = language;
  for (const l of [...listeners]) l(language);
}

export function onLanguageChange(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Translate `key`, substituting `{name}` placeholders from `params`. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  return format(DICTIONARIES[current][key] ?? en[key], params);
}

export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}
