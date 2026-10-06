import { describe, expect, it } from 'vitest';
import {
  BOUNCE_H,
  BOUNCE_W,
  ENTRANCE_H,
  ENTRANCE_W,
  EXIT_H,
  EXIT_W,
  TELEPORT_H,
  TELEPORT_W,
  TRAP_H,
  TRAP_W,
} from '../../../src/core/level';
import {
  BADGE_KEY,
  CREATURE_FRAMES,
  CREATURE_KEY,
  DIGITS,
  DIGIT_KEY,
  GLIDER_BADGE,
  SCALER_BADGE,
} from '../../../src/render/creatureArt';
import {
  BOUNCE_ART,
  ENTRANCE_ART,
  EXIT_ART,
  OBJECT_KEY,
  TELEPORT_ART,
  TELEPORT_TARGET_ART,
  TRAP_ART,
  TRAP_RELOADING_ART,
} from '../../../src/render/objectArt';
import { gridProblems, gridSize, gridToRgba } from '../../../src/render/pixelArt';

describe('pixel art helpers', () => {
  it('converts a grid to RGBA with transparent dots', () => {
    const px = gridToRgba({ rows: ['a.', '.a'], ox: 0 }, { a: 0x102030 });
    expect(Array.from(px)).toEqual([16, 32, 48, 255, 0, 0, 0, 0, 0, 0, 0, 0, 16, 32, 48, 255]);
  });

  it('reports ragged rows, unknown colours and a bad anchor', () => {
    const problems = gridProblems({ rows: ['aa', 'a', 'ax'], ox: 5 }, { a: 1 });
    expect(problems.some((p) => p.includes('length'))).toBe(true);
    expect(problems.some((p) => p.includes("'x'"))).toBe(true);
    expect(problems.some((p) => p.includes('anchor'))).toBe(true);
  });
});

describe('creature frames', () => {
  for (const [pose, frames] of Object.entries(CREATURE_FRAMES)) {
    it(`${pose}: valid frames standing on the bottom row`, () => {
      expect(frames.length).toBeGreaterThan(0);
      for (const f of frames) {
        expect(gridProblems(f, CREATURE_KEY)).toEqual([]);
        const { w, h } = gridSize(f);
        expect(f.rows[h - 1]!.replace(/\./g, '').length).toBeGreaterThan(0);
        // The foot column is the horizontal centre, so mirroring keeps the creature in place.
        expect(f.ox).toBe((w - 1) / 2);
      }
    });
  }

  it('digits and badges are valid', () => {
    expect(DIGITS).toHaveLength(10);
    for (const d of DIGITS) expect(gridProblems(d, DIGIT_KEY)).toEqual([]);
    expect(gridProblems(SCALER_BADGE, BADGE_KEY)).toEqual([]);
    expect(gridProblems(GLIDER_BADGE, BADGE_KEY)).toEqual([]);
  });

  it('permanent-skill badges differ in shape, not only colour (§1.10)', () => {
    const shape = (rows: readonly string[]): string => rows.join('/').replace(/[^.]/g, 'x');
    expect(shape(SCALER_BADGE.rows)).not.toBe(shape(GLIDER_BADGE.rows));
  });
});

describe('object art', () => {
  const cases = [
    ['entrance', ENTRANCE_ART, ENTRANCE_W, ENTRANCE_H],
    ['exit', EXIT_ART, EXIT_W, EXIT_H],
    ['trap', TRAP_ART, TRAP_W, TRAP_H],
    ['trap (reloading)', TRAP_RELOADING_ART, TRAP_W, TRAP_H],
    ['teleport', TELEPORT_ART, TELEPORT_W, TELEPORT_H],
    ['bounce', BOUNCE_ART, BOUNCE_W, BOUNCE_H],
  ] as const;
  for (const [name, art, w, h] of cases) {
    it(`${name}: valid and exactly the size of its zone`, () => {
      expect(gridProblems(art, OBJECT_KEY)).toEqual([]);
      expect(gridSize(art)).toEqual({ w, h });
    });
  }

  it('teleport target marker is valid', () => {
    expect(gridProblems(TELEPORT_TARGET_ART, OBJECT_KEY)).toEqual([]);
  });

  it('a reloading trap looks different from an armed one', () => {
    expect(TRAP_RELOADING_ART.rows).not.toEqual(TRAP_ART.rows);
  });
});
