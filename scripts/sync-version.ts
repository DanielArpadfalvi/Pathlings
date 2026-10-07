/**
 * Copies the app version from package.json (the single source) into the iOS project's
 * MARKETING_VERSION. Android reads package.json in `android/app/build.gradle` directly.
 * Build numbers come from CI (VERSION_CODE / CURRENT_PROJECT_VERSION). Run: `npm run version:sync`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  version: string;
};
const pbx = join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj');
const before = readFileSync(pbx, 'utf8');
const after = before.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
writeFileSync(pbx, after);
console.log(`iOS MARKETING_VERSION = ${version}${before === after ? ' (unchanged)' : ''}`);
