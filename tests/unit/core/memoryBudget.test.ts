import { describe, expect, it } from 'vitest';
import { keyframeBytes } from '../../../src/core/keyframes';
import { MAX_TIME_LIMIT_TICKS, createLevel, emptySkillSet } from '../../../src/core/level';
import { assign, canAssign, createSim, step } from '../../../src/core/sim';

/**
 * T3.2: rewind keyframes for a 10-minute run with 100 creatures must stay under 30 MB. A big
 * soil arena with no reachable exit keeps everyone alive until the time limit; skills are handed
 * out all the time so the terrain keeps changing (the expensive case for terrain diffs).
 */
describe('rewind memory budget', () => {
  it('10-minute run, 100 creatures, constant digging: keyframes < 30 MB', () => {
    const level = createLevel({
      w: 640,
      h: 960,
      ops: [
        { op: 'rect', m: 1, x: 0, y: 300, w: 640, h: 640 },
        { op: 'rect', m: 3, x: 0, y: 940, w: 640, h: 20 },
        { op: 'rect', m: 3, x: 0, y: 0, w: 8, h: 960 },
        { op: 'rect', m: 3, x: 632, y: 0, w: 8, h: 960 },
        { op: 'rect', m: 3, x: 560, y: 20, w: 40, h: 4 },
        { op: 'rect', m: 3, x: 556, y: 0, w: 4, h: 24 },
        { op: 'rect', m: 3, x: 600, y: 0, w: 4, h: 24 },
      ],
      objects: [
        { type: 'entrance', x: 320, y: 290, dir: 1 },
        { type: 'exit', x: 570, y: 8 },
      ],
      creatures: 100,
      required: 1,
      master: 1,
      frugal: 0,
      skills: emptySkillSet(99),
      timeLimitTicks: MAX_TIME_LIMIT_TICKS,
      minReleaseTicks: 12,
    });
    const sim = createSim(level);
    const rotation = ['burrower', 'sloper', 'delver', 'mason'] as const;
    let k = 0;
    while (!sim.ended) {
      if (sim.tick % 45 === 0) {
        for (const c of sim.creatures) {
          const skill = rotation[(c.id + k) % rotation.length]!;
          if (canAssign(sim, c.id, skill)) {
            assign(sim, c.id, skill);
            k++;
            break;
          }
        }
      }
      step(sim);
    }
    expect(sim.tick).toBe(MAX_TIME_LIMIT_TICKS);
    expect(sim.spawned).toBe(100);
    const mb = keyframeBytes(sim.keyframes!) / (1024 * 1024);
    expect(mb).toBeLessThan(30);
  }, 60_000);
});
