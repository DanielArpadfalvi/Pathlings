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

  it('the generated native projects carry the same id (from capacitor.config.ts)', () => {
    const root = join(SRC, '..');
    const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
    expect([...gradle.matchAll(/applicationId "([^"]+)"/g)].map((m) => m[1])).toEqual([APP_ID]);
    const pbx = readFileSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
    const ids = new Set(
      [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]),
    );
    expect([...ids]).toEqual([APP_ID]);
    expect(readFileSync(join(root, 'capacitor.config.ts'), 'utf8')).toContain('appId: APP_ID');
  });
});
