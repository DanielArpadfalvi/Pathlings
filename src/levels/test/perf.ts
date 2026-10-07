import { type LevelDef, MAX_TIME_LIMIT_TICKS, createLevel, emptySkillSet } from '../../core/level';

/**
 * Performance test bed (no reference solution, not a fixture): the biggest level size with the
 * maximum of 100 creatures released fast onto terraced soil, so most of them are on screen and
 * moving at once (T3.4 FPS probe, `?level=perf`).
 */
export const perf: LevelDef = createLevel({
  id: 'perf',
  title: 'Stress',
  theme: 'deep',
  w: 640,
  h: 960,
  ops: [
    // A walled arena: everyone stays alive and walks back and forth across steps and bumps.
    { op: 'rect', m: 1, x: 0, y: 880, w: 640, h: 80 },
    { op: 'rect', m: 2, x: 0, y: 920, w: 640, h: 40 },
    { op: 'rect', m: 3, x: 0, y: 700, w: 8, h: 180 },
    { op: 'rect', m: 3, x: 632, y: 700, w: 8, h: 180 },
    { op: 'rect', m: 1, x: 160, y: 875, w: 80, h: 5 },
    { op: 'rect', m: 1, x: 400, y: 875, w: 80, h: 5 },
    { op: 'rect', m: 3, x: 316, y: 860, w: 8, h: 20 },
    // An exit sealed in metal on a high ledge: the level runs until the time limit.
    { op: 'rect', m: 3, x: 560, y: 600, w: 40, h: 4 },
    { op: 'rect', m: 3, x: 556, y: 580, w: 4, h: 24 },
    { op: 'rect', m: 3, x: 596, y: 580, w: 4, h: 24 },
    { op: 'rect', m: 3, x: 556, y: 576, w: 44, h: 4 },
  ],
  objects: [
    { type: 'entrance', x: 120, y: 840, dir: 1 },
    { type: 'entrance', x: 520, y: 840, dir: -1 },
    { type: 'exit', x: 570, y: 588 },
  ],
  creatures: 100,
  required: 1,
  master: 1,
  frugal: 0,
  skills: emptySkillSet(20),
  timeLimitTicks: MAX_TIME_LIMIT_TICKS,
  minReleaseTicks: 4,
});
