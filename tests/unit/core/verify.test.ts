import { describe, expect, it } from 'vitest';
import { encodeLevel } from '../../../src/core/code/levelCode';
import { loadLevelCode, verifyLevel } from '../../../src/core/code/verify';
import { type LevelDef, TICKS_PER_SECOND } from '../../../src/core/level';
import { runSolution } from '../../../src/core/replay';
import { SIM_VERSION } from '../../../src/core/version';
import { FIXTURE_LEVELS, cliff, digDown, perf, tunnel } from '../../../src/levels/test';

describe('level verification', () => {
  it('every fixture code loads as verified', () => {
    for (const l of FIXTURE_LEVELS) {
      const loaded = loadLevelCode(encodeLevel(l));
      expect(loaded.verify.status, l.id).toBe('verified');
      expect(loaded.verify.verified).toBe(true);
      expect(loaded.verify.saved).toBeGreaterThanOrEqual(l.required);
    }
  });

  it('a tampered solution is not verified', () => {
    const sol = tunnel.solution!;
    // A different assignment tick that still wins but ends in another state (Dig Down: the
    // shaft lands elsewhere, so the final terrain differs).
    const dd = digDown.solution!;
    let shifted: LevelDef | null = null;
    for (let t = 100; t <= 260 && !shifted; t++) {
      const cand: LevelDef = {
        ...digDown,
        solution: { ...dd, log: [{ kind: 'assign', tick: t, creature: 0, skill: 'delver' }] },
      };
      const r = runSolution(cand);
      if (r.won && !r.hashMatches) shifted = cand;
    }
    expect(shifted).not.toBeNull();
    expect(loadLevelCode(encodeLevel(shifted!)).verify.status).toBe('hashMismatch');
    // No assignment at all: the wall stops everyone.
    const empty: LevelDef = { ...tunnel, solution: { ...sol, log: [] } };
    expect(loadLevelCode(encodeLevel(empty)).verify.status).toBe('unsolved');
    // A forged hash.
    const forged: LevelDef = {
      ...tunnel,
      solution: { ...sol, finalHash: (sol.finalHash + 1) >>> 0 },
    };
    expect(loadLevelCode(encodeLevel(forged)).verify.status).toBe('hashMismatch');
  });

  it('a tampered terrain op is not verified', () => {
    const ops = tunnel.ops.map((op, i) =>
      i === 1 && op.op === 'rect' ? { ...op, m: 3 as const } : op,
    ); // the wall becomes metal
    const l: LevelDef = { ...tunnel, ops };
    expect(loadLevelCode(encodeLevel(l)).verify.verified).toBe(false);
    const moved: LevelDef = {
      ...tunnel,
      ops: tunnel.ops.map((op, i) => (i === 1 && op.op === 'rect' ? { ...op, x: op.x + 2 } : op)),
    };
    expect(loadLevelCode(encodeLevel(moved)).verify.verified).toBe(false);
  });

  it('an edited "required" is not verified', () => {
    const l: LevelDef = { ...cliff, required: cliff.creatures, master: cliff.creatures };
    const r = loadLevelCode(encodeLevel(l)).verify;
    expect(r.verified).toBe(false);
    expect(r.status).toBe('unsolved');
  });

  it('drafts and older engines are playable but not verified', () => {
    const draft: LevelDef = { ...tunnel };
    delete draft.solution;
    expect(verifyLevel(draft).status).toBe('noSolution');
    expect(verifyLevel(tunnel, SIM_VERSION - 1).status).toBe('olderVersion');
  });

  it('verifying a 5-minute level with 100 creatures takes < 300 ms', () => {
    const five = 5 * 60 * TICKS_PER_SECOND;
    const level: LevelDef = { ...perf, timeLimitTicks: five, solution: undefined };
    const hash = runSolution(level, { log: [], releaseChanges: [], finalHash: 0 }).hash;
    const withSolution: LevelDef = {
      ...level,
      solution: { log: [], releaseChanges: [], finalHash: hash },
    };
    const t0 = performance.now();
    const r = verifyLevel(withSolution);
    const ms = performance.now() - t0;
    expect(r.ticks).toBe(five);
    if (process.env.PATHLINGS_COVERAGE !== '1') expect(ms).toBeLessThan(300);
  });
});
