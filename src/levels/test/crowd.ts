import { type LevelDef, createLevel, emptySkillSet } from '../../core/level';
import { W, H, sideWalls } from './common';

/**
 * Selection test bed (no reference solution, not a fixture): ten Pathlings drop into a narrow
 * metal pit and walk back and forth in a tight crowd – used by the smart-selection e2e.
 */
export const crowd: LevelDef = createLevel({
  id: 'crowd',
  title: 'Crowd',
  w: W,
  h: H,
  ops: [
    { op: 'rect', m: 1, x: 0, y: 200, w: W, h: 40 },
    { op: 'rect', m: 3, x: 56, y: 192, w: 52, h: 32 },
    { op: 'rect', m: 0, x: 60, y: 192, w: 44, h: 28 },
    ...sideWalls(100, 200),
  ],
  objects: [
    { type: 'entrance', x: 82, y: 170, dir: 1 },
    { type: 'exit', x: 130, y: 188 },
  ],
  creatures: 10,
  required: 1,
  master: 1,
  frugal: 0,
  skills: { ...emptySkillSet(10) },
  timeLimitTicks: 7200,
  minReleaseTicks: 12,
});
