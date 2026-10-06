import { type LevelDef, createLevel, emptySkillSet } from '../../core/level';
import { W, H, sideWalls } from './common';

/** The exit is below a 10-px soil platform: one Delver opens the way for everyone. */
export const digDown: LevelDef = createLevel({
  id: 'test-dig-down',
  title: 'Dig Down',
  w: W,
  h: H,
  ops: [
    { op: 'rect', m: 1, x: 0, y: 180, w: W, h: 60 },
    { op: 'rect', m: 1, x: 4, y: 120, w: W - 8, h: 10 },
    ...sideWalls(40, 180),
  ],
  objects: [
    { type: 'entrance', x: 40, y: 110, dir: 1 },
    { type: 'exit', x: 120, y: 168 },
  ],
  creatures: 10,
  required: 10,
  master: 10,
  frugal: 1,
  skills: { ...emptySkillSet(), delver: 1 },
  timeLimitTicks: 7200,
  minReleaseTicks: 40,
  solution: {
    log: [{ kind: 'assign', tick: 161, creature: 0, skill: 'delver' }],
    releaseChanges: [],
    finalHash: 0x0d8b89a9,
  },
});
