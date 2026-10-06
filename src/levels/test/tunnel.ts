import { type LevelDef, createLevel, emptySkillSet } from '../../core/level';
import { W, H, sideWalls } from './common';

/** A tall soil wall between entrance and exit: one Burrower digs the tunnel. */
export const tunnel: LevelDef = createLevel({
  id: 'test-tunnel',
  title: 'Tunnel',
  w: W,
  h: H,
  ops: [
    { op: 'rect', m: 1, x: 0, y: 200, w: W, h: 40 },
    { op: 'rect', m: 1, x: 70, y: 100, w: 20, h: 100 },
    ...sideWalls(100, 200),
  ],
  objects: [
    { type: 'entrance', x: 30, y: 190, dir: 1 },
    { type: 'exit', x: 130, y: 188 },
  ],
  creatures: 10,
  required: 10,
  master: 10,
  frugal: 1,
  skills: { ...emptySkillSet(), burrower: 1 },
  timeLimitTicks: 7200,
  minReleaseTicks: 40,
  solution: {
    log: [{ kind: 'assign', tick: 152, creature: 0, skill: 'burrower' }],
    releaseChanges: [],
    finalHash: 0x893df3e3,
  },
});
