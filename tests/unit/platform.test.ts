import { describe, expect, it } from 'vitest';
import { type Clipboard, getClipboard, setClipboard } from '../../src/platform/clipboard';
import { createWebSharer } from '../../src/platform/share';
import { createMemoryStore, getStore, setStore } from '../../src/platform/storage';

function fakeClipboard(ok = true): Clipboard & { text: string | null } {
  const c = {
    text: null as string | null,
    async write(t: string) {
      if (ok) c.text = t;
      return ok;
    },
    async read() {
      return c.text;
    },
  };
  return c;
}

describe('platform: storage', () => {
  it('memory store get / set / remove', () => {
    const s = createMemoryStore({ a: '1' });
    expect(s.get('a')).toBe('1');
    expect(s.set('b', '2')).toBe(true);
    expect(s.get('b')).toBe('2');
    s.remove('a');
    expect(s.get('a')).toBeNull();
  });

  it('the active store can be replaced (native shell / tests)', () => {
    const mem = createMemoryStore();
    setStore(mem);
    getStore().set('k', 'v');
    expect(mem.get('k')).toBe('v');
  });
});

describe('platform: share', () => {
  it('uses the system share sheet when there is one', async () => {
    const calls: unknown[] = [];
    const sharer = createWebSharer({
      share: async (d: ShareData) => {
        calls.push(d);
      },
    } as unknown as Navigator);
    expect(await sharer.share('PL1-abc', 'Tunnel')).toBe('shared');
    expect(calls).toEqual([{ title: 'Tunnel', text: 'PL1-abc' }]);
  });

  it('reports a cancelled share sheet', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const sharer = createWebSharer({
      share: async () => {
        throw abort;
      },
    } as unknown as Navigator);
    expect(await sharer.share('PL1-abc', 'T')).toBe('cancelled');
  });

  it('falls back to copying, and reports failure when that fails too', async () => {
    const clip = fakeClipboard();
    setClipboard(clip);
    expect(await createWebSharer({} as Navigator).share('PL1-xyz', 'T')).toBe('copied');
    expect(clip.text).toBe('PL1-xyz');
    expect(await getClipboard().read()).toBe('PL1-xyz');
    setClipboard(fakeClipboard(false));
    expect(await createWebSharer(undefined).share('PL1-xyz', 'T')).toBe('failed');
  });
});
