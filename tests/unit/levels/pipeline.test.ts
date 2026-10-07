import { describe, expect, it } from 'vitest';
import type { LevelDef } from '../../../src/core/level';
import { runSolution } from '../../../src/core/replay';
import { BUILTIN_LEVELS } from '../../../src/levels/catalog';
import { compilePlan } from '../../../src/levels/plan';
import { cliff, digDown, tunnel } from '../../../src/levels/test';
import { WORLDS, checkBuiltIn, levelId, levelKeys } from '../../../src/levels/validate';

function withoutSolution(l: LevelDef): LevelDef {
  const copy = { ...l };
  delete copy.solution;
  return copy;
}

/** A fixture dressed up as built-in level w1-01 with its texts. */
function asBuiltIn(base: LevelDef, over: Partial<LevelDef> = {}): LevelDef {
  const keys = levelKeys('w1-01');
  return {
    ...base,
    id: 'w1-01',
    theme: 'glade',
    difficulty: 2,
    titleKey: keys.title,
    hintKeys: [keys.hints[0]],
    ...over,
  };
}

const dicts = {
  en: { 'level.w1-01.title': 'Tunnel', 'level.w1-01.hint1': 'Dig through.' },
  hu: { 'level.w1-01.title': 'Alagút', 'level.w1-01.hint1': 'Áss át rajta.' },
};

describe('compilePlan', () => {
  it('turns conditions into the exact solution (matches the hand-made one)', () => {
    const level = withoutSolution(tunnel);
    // Burrower as soon as creature 0 walks at x ≥ 70 − 8 (the wall is 8 px ahead).
    const r = compilePlan(level, [
      { assign: 'burrower', creature: 0, when: { xGte: 62, state: 'walk' } },
    ]);
    expect(r.won).toBe(true);
    expect(r.unfired).toEqual([]);
    expect(r.solution.log).toHaveLength(1);
    const replay = runSolution(level, r.solution);
    expect(replay.hashMatches).toBe(true);
    expect(replay.won).toBe(true);
  });

  it('fires several steps in one tick, pop-all and release changes', () => {
    const level = withoutSolution(cliff);
    const r = compilePlan(level, [
      { assign: 'scaler', creature: 0, when: { tick: 31 } },
      { assign: 'glider', creature: 0, when: { tick: 31 } },
      { popAll: true, when: { tick: 979 } },
    ]);
    expect(r.solution.log.map((c) => c.tick)).toEqual([31, 31, 979]);
    expect(r.solution.finalHash).toBe(cliff.solution!.finalHash);
    const rel = compilePlan(level, [{ release: 20, when: { tick: 40 } }]);
    expect(rel.solution.releaseChanges[0]).toMatchObject({ tick: 40 });
  });

  it('reports steps whose condition never holds', () => {
    const level = withoutSolution(digDown);
    const r = compilePlan(level, [{ assign: 'delver', creature: 0, when: { xGte: 10_000 } }]);
    expect(r.unfired).toEqual([0]);
    expect(r.won).toBe(false);
  });
});

describe('checkBuiltIn', () => {
  it('accepts a correct built-in level', () => {
    const r = checkBuiltIn(asBuiltIn(tunnel), 'w1', 1, dicts);
    expect(r.problems).toEqual([]);
    expect(r.stars).toBe(3);
  });

  it('flags id, theme, difficulty and missing texts', () => {
    const r = checkBuiltIn(
      asBuiltIn(tunnel, { id: 'x', theme: 'deep', difficulty: 9, hintKeys: ['level.w1-01.hint2'] }),
      'w1',
      1,
      { en: {}, hu: {} },
    );
    const text = r.problems.join('\n');
    expect(text).toContain('id must be');
    expect(text).toContain('theme must be glade');
    expect(text).toContain('difficulty 9 outside 1–6');
    expect(text).toContain('hintKeys[0] must be');
    expect(text).toContain('missing en text');
    expect(text).toContain('missing hu text');
    expect(
      checkBuiltIn(asBuiltIn(tunnel, { difficulty: undefined }), 'w1', 1, dicts).problems,
    ).toContain('difficulty tag missing');
  });

  it('fails on an unsolvable level or a drifted solution (the CI gate)', () => {
    const noSolution = asBuiltIn(tunnel, { solution: undefined });
    expect(checkBuiltIn(noSolution, 'w1', 1, dicts).problems).toContain(
      'reference solution missing',
    );
    const drifted = asBuiltIn(tunnel, {
      solution: { ...tunnel.solution!, finalHash: (tunnel.solution!.finalHash + 1) >>> 0 },
    });
    expect(checkBuiltIn(drifted, 'w1', 1, dicts).problems.join()).toContain('hash drifted');
    const unsolved = asBuiltIn(tunnel, { solution: { ...tunnel.solution!, log: [] } });
    expect(checkBuiltIn(unsolved, 'w1', 1, dicts).problems.join()).toContain('solution saves');
  });

  it('requires the reference solution to earn every star', () => {
    // Frugal 0 cannot be met by a solution that needs one Burrower.
    const r = checkBuiltIn(asBuiltIn(tunnel, { frugal: 0 }), 'w1', 1, dicts);
    expect(r.problems.join()).toContain('earns 2★');
  });

  it('ids and worlds', () => {
    expect(levelId('w2', 7)).toBe('w2-07');
    expect(WORLDS.map((w) => w.count).reduce((a, b) => a + b, 0)).toBe(110);
  });
});

describe('catalog', () => {
  it('every bundled built-in level passes the checks', () => {
    for (const [world, list] of Object.entries(BUILTIN_LEVELS)) {
      list.forEach((level, i) => {
        expect(level.id).toBe(levelId(world as never, i + 1));
        expect((level as { plan?: unknown }).plan).toBeUndefined();
      });
    }
  });
});
