import { type LevelDef, createLevel, emptySkillSet } from '../../core/level';
import { W, H, sideWalls } from './common';

/** Flat floor from the entrance to the exit: no skills needed, everyone walks home. */
export const walkHome: LevelDef = createLevel({
  id: 'test-walk-home',
  title: 'Walk Home',
  w: W,
  h: H,
  ops: [{ op: 'rect', m: 1, x: 0, y: 200, w: W, h: 40 }, ...sideWalls(120, 200)],
  objects: [
    { type: 'entrance', x: 30, y: 190, dir: 1 },
    { type: 'exit', x: 130, y: 188 },
  ],
  creatures: 5,
  required: 5,
  master: 5,
  frugal: 0,
  skills: emptySkillSet(),
  timeLimitTicks: 7200,
  minReleaseTicks: 30,
  solution: { log: [], releaseChanges: [{ tick: 40, interval: 15 }], finalHash: 0x0f4d76de },
});
