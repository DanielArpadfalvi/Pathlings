import { describe, expect, it } from 'vitest';
import {
  MY_LEVELS_KEY,
  MyLevels,
  clearDraft,
  codeId,
  loadDraft,
  saveDraft,
} from '../../../src/app/myLevels';
import { encodeLevel } from '../../../src/core/code/levelCode';
import { createMemoryStore } from '../../../src/platform/storage';
import { cliff, digDown, tunnel } from '../../../src/levels/test';

function clock(): () => number {
  let t = 1000;
  return () => (t += 10);
}

describe('MyLevels', () => {
  it('adds, lists (favourites first, newest first), persists and reloads', () => {
    const store = createMemoryStore();
    const now = clock();
    const a = new MyLevels(store, now);
    const t = a.add(encodeLevel(tunnel), 'mine');
    const d = a.add(encodeLevel(digDown), 'received');
    const c = a.add(encodeLevel(cliff), 'received');
    expect(t.title).toBe('Tunnel');
    expect(t.verified).toBe(true);
    expect(a.list().map((e) => e.id)).toEqual([c.id, d.id, t.id]);
    a.toggleFavourite(t.id);
    expect(a.list()[0]!.id).toBe(t.id);
    expect(a.list('received').map((e) => e.id)).toEqual([c.id, d.id]);
    const b = new MyLevels(store, now);
    expect(b.list().map((e) => e.id)).toEqual(a.list().map((e) => e.id));
    expect(b.get(t.id)!.favourite).toBe(true);
  });

  it('never duplicates a code; re-publishing a received code makes it mine', () => {
    const levels = new MyLevels(createMemoryStore(), clock());
    const code = encodeLevel(tunnel);
    const first = levels.add(code, 'received');
    const again = levels.add(`  ${code.slice(0, 10)}\n${code.slice(10)} `, 'received');
    expect(again.id).toBe(first.id);
    expect(levels.list()).toHaveLength(1);
    levels.add(code, 'mine');
    expect(levels.get(first.id)!.source).toBe('mine');
    expect(codeId(code)).toBe(first.id);
  });

  it('removes entries and decodes their level', () => {
    const levels = new MyLevels(createMemoryStore(), clock());
    const e = levels.add(encodeLevel(tunnel), 'mine');
    expect(levels.level(e.id)!.title).toBe('Tunnel');
    levels.remove(e.id);
    expect(levels.list()).toEqual([]);
    expect(levels.level(e.id)).toBeNull();
    levels.remove('nope');
    levels.toggleFavourite('nope');
  });

  it('rejects bad codes and survives corrupted storage', () => {
    const levels = new MyLevels(createMemoryStore(), clock());
    expect(() => levels.add('PL1-garbage', 'received')).toThrow();
    const broken = createMemoryStore({ [MY_LEVELS_KEY]: '{not json' });
    expect(new MyLevels(broken, clock()).list()).toEqual([]);
    const mixed = createMemoryStore({ [MY_LEVELS_KEY]: JSON.stringify([{ id: 1 }, null, 'x']) });
    expect(new MyLevels(mixed, clock()).list()).toEqual([]);
  });
});

describe('editor draft autosave', () => {
  it('saves, loads and clears a draft; ignores junk', () => {
    const store = createMemoryStore();
    expect(loadDraft(store)).toBeNull();
    saveDraft(store, tunnel);
    expect(loadDraft(store)).toEqual(JSON.parse(JSON.stringify(tunnel)));
    clearDraft(store);
    expect(loadDraft(store)).toBeNull();
    store.set('pathlings.draft.v1', '{"w":"x"}');
    expect(loadDraft(store)).toBeNull();
    store.set('pathlings.draft.v1', 'nope');
    expect(loadDraft(store)).toBeNull();
  });
});
