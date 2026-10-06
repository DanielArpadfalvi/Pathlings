import { type LevelDef, createLevel, emptySkillSet } from '../../../src/core/level';
import { H, W } from './common';

/**
 * A tall cliff and a deep drop behind it: one "all-rounder" (Scaler + Glider) climbs over and
 * glides down to the exit; then everyone left is popped to end the level.
 */
export const cliff: LevelDef = createLevel({
  id: 'test-cliff',
  title: 'Cliff',
  theme: 'skyreach',
  w: W,
  h: H,
  ops: [
    { op: 'rect', m: 1, x: 0, y: 200, w: 80, h: 40 },
    { op: 'rect', m: 1, x: 80, y: 230, w: 80, h: 10 },
    { op: 'rect', m: 2, x: 60, y: 120, w: 20, h: 80 },
    { op: 'rect', m: 3, x: 0, y: 100, w: 4, h: 100 },
    { op: 'rect', m: 3, x: 156, y: 100, w: 4, h: 130 },
  ],
  objects: [
    { type: 'entrance', x: 30, y: 190, dir: 1 },
    { type: 'exit', x: 130, y: 218 },
  ],
  creatures: 3,
  required: 1,
  master: 1,
  frugal: 3,
  skills: { ...emptySkillSet(), scaler: 1, glider: 1 },
  timeLimitTicks: 7200,
  minReleaseTicks: 60,
  solution: {
    log: [
      { kind: 'assign', tick: 31, creature: 0, skill: 'scaler' },
      { kind: 'assign', tick: 31, creature: 0, skill: 'glider' },
      { kind: 'popAll', tick: 979 },
    ],
    releaseChanges: [],
    finalHash: 0x83fddcd8,
  },
});
