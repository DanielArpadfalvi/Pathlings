import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** T9.3 / T9.4: package.json is the single source of the app version. */
const ROOT = join(import.meta.dirname, '..', '..');
const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8');

describe('app version', () => {
  const { version } = JSON.parse(read('package.json')) as { version: string };

  it('is a release version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('iOS MARKETING_VERSION matches (npm run version:sync)', () => {
    const found = [
      ...read('ios/App/App.xcodeproj/project.pbxproj').matchAll(/MARKETING_VERSION = ([^;]+);/g),
    ];
    expect(found.length).toBeGreaterThan(0);
    for (const m of found) expect(m[1]).toBe(version);
  });

  it('Android reads it from package.json', () => {
    const gradle = read('android/app/build.gradle');
    expect(gradle).toContain("parse(file('../../package.json')).version");
    expect(gradle).toMatch(/versionName appVersion/);
  });
});
