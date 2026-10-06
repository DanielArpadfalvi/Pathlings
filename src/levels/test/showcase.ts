import { type LevelDef, createLevel, emptySkillSet } from '../../core/level';
import { W, H, sideWalls } from './common';

/**
 * Renderer showcase (no reference solution, not a fixture): every material, every object type,
 * two entrances and two exits on one small level – used for screenshot review (`?level=showcase`).
 */
export const showcase: LevelDef = createLevel({
  id: 'showcase',
  title: 'Showcase',
  theme: 'deep',
  w: W,
  h: H,
  ops: [
    { op: 'rect', m: 1, x: 0, y: 200, w: W, h: 40 },
    { op: 'rect', m: 2, x: 0, y: 218, w: W, h: 22 },
    { op: 'rect', m: 3, x: 0, y: 234, w: W, h: 6 },
    { op: 'rect', m: 0, x: 60, y: 200, w: 30, h: 12 },
    { op: 'rect', m: 4, x: 96, y: 176, w: 6, h: 24 },
    { op: 'rect', m: 5, x: 104, y: 176, w: 6, h: 24 },
    { op: 'rect', m: 2, x: 130, y: 160, w: 26, h: 40 },
    { op: 'ramp', m: 1, x: 110, y: 184, w: 20, h: 16, rise: 'right' },
    { op: 'rect', m: 6, x: 20, y: 150, w: 36, h: 4 },
    { op: 'rect', m: 1, x: 4, y: 110, w: 86, h: 8 },
    { op: 'circle', m: 1, x: 30, y: 118, r: 6 },
    { op: 'rect', m: 3, x: 96, y: 116, w: 60, h: 4 },
    { op: 'rect', m: 3, x: 96, y: 104, w: 4, h: 12 },
    ...sideWalls(60, 200),
  ],
  objects: [
    { type: 'entrance', x: 24, y: 190, dir: 1 },
    { type: 'entrance', x: 60, y: 100, dir: -1 },
    { type: 'bounce', x: 36, y: 196 },
    { type: 'teleport', x: 50, y: 188, tx: 80, ty: 110 },
    { type: 'water', x: 60, y: 202, w: 30, h: 10 },
    { type: 'trap', x: 112, y: 168 },
    { type: 'exit', x: 140, y: 148 },
    { type: 'lava', x: 110, y: 110, w: 30, h: 6 },
    { type: 'exit', x: 8, y: 98 },
  ],
  creatures: 12,
  required: 1,
  master: 1,
  frugal: 0,
  skills: { ...emptySkillSet(2), popper: 5 },
  timeLimitTicks: 7200,
  minReleaseTicks: 40,
});
