import { describe, expect, it } from 'vitest';
import {
  FINAL_GATE,
  OPEN_AHEAD,
  accessOf,
  canPlay,
  progressView,
} from '../../../src/app/progression';
import type { WorldId } from '../../../src/levels/validate';

const ids = (w: WorldId, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${w}-${String(i + 1).padStart(2, '0')}`);
const WORLDS = (['w1', 'w2', 'w3', 'w4'] as const).map((id) => ({ id, levels: ids(id, 20) }));
const ALL = [...WORLDS, { id: 'bonus' as const, levels: ids('bonus', 30) }];

function view(solved: readonly string[], fullGame = false) {
  const set = new Set(solved);
  return progressView({ worlds: ALL, stars: (id) => (set.has(id) ? 2 : 0), fullGame });
}

function access(v: ReturnType<typeof view>, w: WorldId): string {
  const short = { solved: 'S', open: 'o', locked: '.', paid: '$' } as const;
  return v
    .find((x) => x.id === w)!
    .levels.map((l) => short[l.access])
    .join('');
}

describe('progression', () => {
  it('opens three levels of world 1 at the start; the rest is locked, paid parts priced', () => {
    expect(OPEN_AHEAD).toBe(3);
    const v = view([]);
    expect(access(v, 'w1')).toBe('ooo.................');
    expect(access(v, 'w2')).toBe('..........$$$$$$$$$$');
    expect(access(v, 'w3')).toBe('$'.repeat(20));
    expect(access(v, 'bonus')).toBe('$'.repeat(30));
    expect(v.find((w) => w.id === 'w1')).toMatchObject({ open: true, paid: false, maxStars: 60 });
    expect(v.find((w) => w.id === 'w2')).toMatchObject({ open: false, paid: true });
  });

  it('keeps three unsolved levels open, also when the player skips some', () => {
    expect(access(view(ids('w1', 2)), 'w1')).toBe('SSooo...............');
    // Solving 1, 3 and 4 while 2 stays open: 2, 5 and 6 are the three open ones.
    expect(access(view(['w1-01', 'w1-03', 'w1-04']), 'w1')).toBe('SoSSoo..............');
  });

  it('opens the last level at 17 solved, the next world when the last level is solved', () => {
    expect(FINAL_GATE).toBe(17);
    const sixteen = ids('w1', 16);
    expect(access(view(sixteen), 'w1')).toBe(`${'S'.repeat(16)}ooo.`);
    const seventeen = ids('w1', 17);
    expect(access(view(seventeen), 'w1')).toBe(`${'S'.repeat(17)}ooo`);
    expect(access(view(seventeen), 'w2')).toBe('..........$$$$$$$$$$');
    const done = [...seventeen, 'w1-20'];
    expect(access(view(done), 'w2')).toBe('ooo.......$$$$$$$$$$');
    expect(view(done).find((w) => w.id === 'w2')?.open).toBe(true);
  });

  it('with the full game: the paid levels follow the normal rules, the bonus pool is open', () => {
    const w1 = ids('w1', 20);
    const v = view([...w1, ...ids('w2', 12)], true);
    expect(access(v, 'w2')).toBe(`${'S'.repeat(12)}ooo.....`);
    expect(access(v, 'w3')).toBe('.'.repeat(20));
    expect(access(v, 'bonus')).toBe('o'.repeat(30));
    expect(access(view(['bonus-02'], true), 'bonus')).toBe(`oS${'o'.repeat(28)}`);
  });

  it('sums stars and answers per-level questions', () => {
    const v = view(['w1-01', 'w1-02']);
    expect(v[0]).toMatchObject({ solved: 2, stars: 4 });
    expect(accessOf(v, 'w1-02')).toBe('solved');
    expect(accessOf(v, 'w3-01')).toBe('paid');
    expect(accessOf(v, 'nope')).toBeUndefined();
    expect([canPlay('open'), canPlay('solved'), canPlay('locked'), canPlay('paid')]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});
