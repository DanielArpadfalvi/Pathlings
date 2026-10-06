import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ID } from '../../src/config';

const SRC = join(import.meta.dirname, '../../src');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

describe('app id', () => {
  it('is the expected reverse-DNS id', () => {
    expect(APP_ID).toBe('com.arpadfalvi.pathlings');
  });

  it('is defined in exactly one source file', () => {
    const owners = listFiles(SRC).filter((f) => readFileSync(f, 'utf8').includes(APP_ID));
    expect(owners.map((f) => f.slice(SRC.length + 1))).toEqual(['config.ts']);
  });
});
