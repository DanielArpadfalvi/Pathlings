import { describe, expect, it } from 'vitest';
import { createLevel, type LevelDef } from '../../../src/core/level';
import {
  canPlay,
  isFreeLevel,
  levelStates,
  progressionStates,
  worldOpen,
  type WorldsInput,
} from '../../../src/app/progression';
import type { WorldId } from '../../../src/levels/validate';

const ids = (w: string, n = 20): string[] =>
  Array.from({ length: n }, (_, i) => `${w}-${String(i + 1).padStart(2, '0')}`);
const levels = Object.fromEntries(
  (['w1', 'w2', 'w3', 'w4', 'bonus'] as WorldId[]).map((w) => [
    w,
    ids(w, w === 'bonus' ? 30 : 20).map((id) => createLevel({ id })),
  ]),
) as Record<WorldId, LevelDef[]>;

function input(solved: string[], fullGame = false): WorldsInput {
  const set = new Set(solved);
  return { levels, solved: (id) => set.has(id), fullGame };
}

describe('progression', () => {
  it('keeps three unsolved levels open', () => {
    expect(progressionStates(ids('w1'), () => false, true).slice(0, 5)).toEqual([
      'open',
      'open',
      'open',
      'locked',
      'locked',
    ]);
    // Skipping a hard level: 1, 2 and 4 solved → 3, 5, 6 open.
    const s = progressionStates(ids('w1'), (id) => ['w1-01', 'w1-02', 'w1-04'].includes(id), true);
    expect(s.slice(0, 7)).toEqual(['solved', 'solved', 'open', 'solved', 'open', 'open', 'locked']);
  });

  it('opens the last level of a world at 17 of 20', () => {
    const first16 = ids('w1').slice(0, 16);
    const s16 = progressionStates(ids('w1'), (id) => first16.includes(id), true);
    expect(s16.slice(16)).toEqual(['open', 'open', 'open', 'locked']);
    const first17 = ids('w1').slice(0, 17);
    const s17 = progressionStates(ids('w1'), (id) => first17.includes(id), true);
    expect(s17.slice(17)).toEqual(['open', 'open', 'open']);
    // Any 17, not necessarily in order.
    const any17 = ids('w1').filter((_, i) => i !== 2 && i !== 5 && i !== 19);
    expect(progressionStates(ids('w1'), (id) => any17.includes(id), true)[19]).toBe('open');
  });

  it('opens the next world with the previous world’s last level', () => {
    expect(worldOpen('w1', input([]))).toBe(true);
    expect(worldOpen('w2', input(ids('w1').slice(0, 19)))).toBe(false);
    expect(worldOpen('w2', input(['w1-20']))).toBe(true);
    expect(levelStates('w3', input([], true)).every((s) => s === 'locked')).toBe(true);
    expect(worldOpen('bonus', input([]))).toBe(true);
  });

  it('marks paid levels with a lock from the first minute', () => {
    expect(isFreeLevel('w1-20')).toBe(true);
    expect(isFreeLevel('w2-10')).toBe(true);
    expect(isFreeLevel('w2-11')).toBe(false);
    expect(isFreeLevel('w3-01')).toBe(false);
    expect(isFreeLevel('bonus-01')).toBe(false);
    expect(isFreeLevel('test-tunnel')).toBe(true);
    const w2 = input([...ids('w1'), ...ids('w2').slice(0, 10)]);
    expect(levelStates('w2', w2).slice(9, 14)).toEqual(['solved', 'paid', 'paid', 'paid', 'paid']);
    expect(levelStates('w3', input([])).every((s) => s === 'paid')).toBe(true);
    expect(levelStates('bonus', input([])).every((s) => s === 'paid')).toBe(true);
  });

  it('unlocks paid levels with the full game, keeping progression', () => {
    const w2 = input([...ids('w1'), ...ids('w2').slice(0, 10)], true);
    expect(levelStates('w2', w2).slice(9, 14)).toEqual([
      'solved',
      'open',
      'open',
      'open',
      'locked',
    ]);
    expect(levelStates('bonus', input([], true)).every((s) => s === 'open')).toBe(true);
  });

  it('canPlay follows the states', () => {
    expect(canPlay('w1-01', input([]))).toBe(true);
    expect(canPlay('w1-04', input([]))).toBe(false);
    expect(canPlay('w2-11', input([...ids('w1'), ...ids('w2').slice(0, 10)]))).toBe(false);
    expect(canPlay('w2-11', input([...ids('w1'), ...ids('w2').slice(0, 10)], true))).toBe(true);
    expect(canPlay('test-tunnel', input([]))).toBe(true);
  });
});
