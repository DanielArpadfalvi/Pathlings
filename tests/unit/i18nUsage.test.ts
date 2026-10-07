import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES, LANGUAGES } from '../../src/i18n';
import { en } from '../../src/i18n/en';
import { SKILLS, THEMES } from '../../src/core/level';
import { WORLDS } from '../../src/levels/validate';
import { TOUCH_RADII } from '../../src/app/settings';

/**
 * T6.4: every key the UI builds at run time exists, translations keep the placeholders of the
 * English text, and the DOM overlay contains no hard-coded user-visible text.
 */

const keys = new Set(Object.keys(en));
const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('i18n usage', () => {
  it('has every dynamically built key', () => {
    const dynamic = [
      ...SKILLS.map((s) => `skill.${s}`),
      ...THEMES.map((th) => `theme.${th}`),
      ...WORLDS.map((w) => `world.${w.id}`),
      ...TOUCH_RADII.map((r) => `settings.radius.${r}`),
      ...['system', 'on', 'off'].map((m) => `settings.motion.${m}`),
      ...['auto', 'en', 'hu'].map((l) => `settings.lang.${l}`),
      ...['both', 'left', 'right'].map((f) => `filter.${f}`),
      ...['skillMinus', 'timeMinus', 'requiredPlus'].map((m) => `daily.mod.${m}`),
    ];
    for (const k of dynamic) expect(keys.has(k), k).toBe(true);
  });

  it('keeps the placeholders in every language', () => {
    for (const lang of LANGUAGES) {
      const dict = DICTIONARIES[lang] as Record<string, string>;
      for (const [k, v] of Object.entries(en)) {
        expect(placeholders(dict[k] ?? ''), `${lang}: ${k}`).toEqual(placeholders(v));
      }
    }
  });

  it('the overlay has no hard-coded user-visible text', () => {
    const dir = join(import.meta.dirname, '..', '..', 'src', 'ui');
    const offenders: string[] = [];
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.tsx'))) {
      const lines = readFileSync(join(dir, name), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const where = `${name}:${i + 1}: ${line.trim()}`;
        // Text between tags on one line: >Some words<
        if (/>\s*[A-Za-zÀ-ž]{2,}[^<>{}]*</.test(line)) offenders.push(where);
        // A line holding only words (JSX text spanning lines).
        if (
          /^\s+[A-Za-zÀ-ž][A-Za-zÀ-ž ’'.!?-]*[A-Za-zÀ-ž.!?]$/.test(line) &&
          / /.test(line.trim())
        ) {
          offenders.push(where);
        }
        // Literal accessible names.
        if (/(aria-label|title|placeholder)="[^"]*[A-Za-z]{2,}/.test(line)) offenders.push(where);
      });
    }
    expect(offenders).toEqual([]);
  });
});
