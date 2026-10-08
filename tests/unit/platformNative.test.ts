import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ID } from '../../src/config';
import { createLifecycleCore, createWebLifecycle } from '../../src/platform/lifecycle';
import { type AsyncKeyValueBackend, createPreloadedStore } from '../../src/platform/storage';

const ROOT = join(import.meta.dirname, '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

function fakeBackend(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const ops: string[] = [];
  let release: (() => void) | null = null;
  const backend: AsyncKeyValueBackend & {
    data: Map<string, string>;
    ops: string[];
    hold(): void;
    go(): void;
  } = {
    data,
    ops,
    load: async () => Object.fromEntries(data),
    async set(k, v) {
      if (release === null && held) await new Promise<void>((r) => (release = r));
      ops.push(`set ${k}=${v}`);
      data.set(k, v);
    },
    async remove(k) {
      ops.push(`remove ${k}`);
      data.delete(k);
    },
    hold: () => {
      held = true;
    },
    go: () => {
      held = false;
      release?.();
    },
  };
  let held = false;
  return backend;
}

describe('preloaded native storage', () => {
  it('reads synchronously from memory and writes through in order', async () => {
    const backend = fakeBackend({ 'pathlings.save': '{"v":2}' });
    const store = await createPreloadedStore(backend);
    expect(store.get('pathlings.save')).toBe('{"v":2}');
    backend.hold();
    store.set('a', '1');
    store.set('a', '2');
    store.remove('b');
    // Memory is updated at once, before the backend catches up.
    expect(store.get('a')).toBe('2');
    backend.go();
    await store.flushed();
    expect(backend.ops).toEqual(['set a=1', 'set a=2', 'remove b']);
    expect(backend.data.get('a')).toBe('2');
  });

  it('never throws into the game when the backend fails', async () => {
    const broken: AsyncKeyValueBackend = {
      load: () => Promise.reject(new Error('no plugin')),
      set: () => Promise.reject(new Error('disk full')),
      remove: () => Promise.reject(new Error('disk full')),
    };
    const store = await createPreloadedStore(broken);
    expect(store.get('x')).toBeNull();
    expect(store.set('x', 'y')).toBe(true);
    store.remove('x');
    await expect(store.flushed()).resolves.toBeUndefined();
  });
});

describe('lifecycle', () => {
  it('asks back handlers newest first and exits when nobody handles it', () => {
    let exits = 0;
    const lc = createLifecycleCore(() => exits++);
    const calls: string[] = [];
    lc.onBack(() => {
      calls.push('game');
      return false;
    });
    const off = lc.onBack(() => {
      calls.push('dialog');
      return true;
    });
    expect(lc.back()).toBe(true);
    expect(calls).toEqual(['dialog']);
    off();
    expect(lc.back()).toBe(false);
    expect(calls).toEqual(['dialog', 'game']);
    expect(exits).toBe(1);
  });

  it('web: tab visibility is pause / resume and Escape is back', () => {
    const listeners = new Map<string, (e: unknown) => void>();
    let state = 'visible';
    const doc = {
      get visibilityState() {
        return state;
      },
      addEventListener: (type: string, l: (e: unknown) => void) => listeners.set(type, l),
    } as unknown as Document;
    const lc = createWebLifecycle(doc);
    const seen: string[] = [];
    lc.onPause(() => seen.push('pause'));
    lc.onResume(() => seen.push('resume'));
    lc.onBack(() => {
      seen.push('back');
      return true;
    });
    state = 'hidden';
    listeners.get('visibilitychange')?.({});
    state = 'visible';
    listeners.get('visibilitychange')?.({});
    let prevented = false;
    listeners.get('keydown')?.({
      key: 'Escape',
      repeat: false,
      preventDefault: () => (prevented = true),
    });
    listeners.get('keydown')?.({ key: 'a', repeat: false, preventDefault: () => undefined });
    expect(seen).toEqual(['pause', 'resume', 'back']);
    expect(prevented).toBe(true);
  });
});

describe('native shell boundaries', () => {
  it('only src/platform/native.ts imports @capacitor/*', () => {
    const owners = files(join(ROOT, 'src'))
      .filter((f) => /from '@capacitor\//.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(ROOT.length + 1));
    expect(owners).toEqual(['src/platform/native.ts']);
  });

  it('the native projects carry the bundle id of src/config.ts (generated from it)', () => {
    const cap = readFileSync(join(ROOT, 'capacitor.config.ts'), 'utf8');
    expect(cap).toMatch(/appId: APP_ID/);
    const gradle = readFileSync(join(ROOT, 'android/app/build.gradle'), 'utf8');
    expect(gradle).toContain(`applicationId "${APP_ID}"`);
    expect(gradle).toContain(`namespace = "${APP_ID}"`);
    const pbx = readFileSync(join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
    const ids = new Set(
      [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]),
    );
    expect([...ids]).toEqual([APP_ID]);
  });

  it('locks the app to portrait on both platforms', () => {
    const manifest = readFileSync(join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('android:screenOrientation="portrait"');
    const plist = readFileSync(join(ROOT, 'ios/App/App/Info.plist'), 'utf8');
    expect(plist).not.toMatch(/Landscape/);
    expect(plist).toMatch(/<key>UIRequiresFullScreen<\/key>\s*<true\/>/);
  });
});
