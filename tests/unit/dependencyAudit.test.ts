import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T9.2 / CLAUDE.md: no analytics, crash-reporting, advertising or attribution SDK may enter the
 * app (the privacy answers in docs/store-privacy-answers.md depend on it).
 */

const ROOT = join(import.meta.dirname, '..', '..');
const BANNED =
  /(firebase|crashlytics|sentry|bugsnag|datadog|newrelic|appcenter|admob|google-mobile-ads|applovin|unity-?ads|ironsource|chartboost|vungle|amplitude|mixpanel|segment|posthog|appsflyer|adjust-sdk|@adjust|branch-sdk|react-native-branch|facebook|fbsdk|onesignal|analytics)/i;

describe('dependency audit', () => {
  it('package.json has no analytics / crash / ad SDK', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const names = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)];
    expect(names.filter((n) => BANNED.test(n))).toEqual([]);
  });

  it('nor does any installed (transitive) runtime package', () => {
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { dev?: boolean }>;
    };
    const runtime = Object.entries(lock.packages)
      .filter(([path, p]) => path.startsWith('node_modules/') && !p.dev)
      .map(([path]) => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length));
    expect(runtime.filter((n) => BANNED.test(n))).toEqual([]);
  });

  it('the native projects carry no such SDK either', () => {
    for (const f of ['android/app/build.gradle', 'ios/App/CapApp-SPM/Package.swift']) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      expect(BANNED.test(text), f).toBe(false);
    }
  });
});
