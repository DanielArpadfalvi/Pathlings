import { type LevelDef, createLevel, emptySkillSet } from '../../core/level';
import { W, H, sideWalls } from './common';

/**
 * Objects without skills: a bounce pad throws the walkers over a low wall, a teleporter lifts
 * them onto a platform, where a trap takes one of every few before the exit.
 */
export const clockwork: LevelDef = createLevel({
  id: 'test-clockwork',
  title: 'Clockwork',
  theme: 'clockworks',
  w: W,
  h: H,
  ops: [
    { op: 'rect', m: 1, x: 0, y: 200, w: W, h: 40 },
    { op: 'rect', m: 3, x: 56, y: 185, w: 4, h: 15 },
    { op: 'rect', m: 1, x: 90, y: 120, w: 66, h: 6 },
    ...sideWalls(60, 200),
  ],
  objects: [
    { type: 'entrance', x: 20, y: 190, dir: 1 },
    { type: 'bounce', x: 40, y: 196 },
    { type: 'teleport', x: 80, y: 188, tx: 100, ty: 120 },
    { type: 'trap', x: 110, y: 110 },
    { type: 'exit', x: 130, y: 108 },
  ],
  creatures: 6,
  required: 4,
  master: 4,
  frugal: 0,
  skills: emptySkillSet(),
  timeLimitTicks: 7200,
  minReleaseTicks: 60,
  solution: { log: [], releaseChanges: [], finalHash: 0xfd82a468 },
});
