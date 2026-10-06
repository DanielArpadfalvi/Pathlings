import { describe, expect, it } from 'vitest';
import {
  CreatureState,
  type CreatureStateCode,
  EXIT_TICKS,
  createCreature,
} from '../../../src/core/creature';
import { CREATURE_FRAMES } from '../../../src/render/creatureArt';
import { MAX_INTERP_DISTANCE, PositionHistory } from '../../../src/render/interp';
import { creatureAlpha, creaturePose } from '../../../src/render/pose';

function creature(
  state: CreatureStateCode,
  extra: Partial<{ timer: number; x: number; y: number }> = {},
) {
  const c = createCreature(0, extra.x ?? 10, extra.y ?? 20, 1);
  c.state = state;
  c.timer = extra.timer ?? 0;
  return c;
}

describe('creaturePose', () => {
  it('maps every live state to an existing frame', () => {
    for (let s = CreatureState.Walk; s <= CreatureState.Exiting; s++) {
      for (const tick of [0, 5, 17, 100, 999]) {
        const pf = creaturePose(creature(s as CreatureStateCode, { timer: 10 }), tick);
        expect(pf, `state ${s}`).not.toBeNull();
        const frames = CREATURE_FRAMES[pf!.pose];
        expect(pf!.frame).toBeGreaterThanOrEqual(0);
        expect(pf!.frame).toBeLessThan(frames.length);
      }
    }
  });

  it('draws nothing for saved and dead creatures', () => {
    expect(creaturePose(creature(CreatureState.Saved), 0)).toBeNull();
    expect(creaturePose(creature(CreatureState.Dead), 0)).toBeNull();
  });

  it('picks the pose of each skill', () => {
    expect(creaturePose(creature(CreatureState.Glide), 0)?.pose).toBe('glide');
    expect(creaturePose(creature(CreatureState.Warden), 0)?.pose).toBe('warden');
    expect(creaturePose(creature(CreatureState.Build), 0)?.pose).toBe('build');
    expect(creaturePose(creature(CreatureState.Burrow), 0)?.pose).toBe('burrow');
    expect(creaturePose(creature(CreatureState.Slope), 0)?.pose).toBe('slope');
    expect(creaturePose(creature(CreatureState.Delve), 0)?.pose).toBe('delve');
    expect(creaturePose(creature(CreatureState.Climb), 0)?.pose).toBe('climb');
    expect(creaturePose(creature(CreatureState.Bounce), 0)?.pose).toBe('fall');
  });

  it('cycles the walk through all four frames', () => {
    const frames = new Set<number>();
    for (let t = 0; t < 24; t++) frames.add(creaturePose(creature(CreatureState.Walk), t)!.frame);
    expect(frames).toEqual(new Set([0, 1, 2, 3]));
  });

  it('fades out while entering an exit', () => {
    expect(creatureAlpha(creature(CreatureState.Walk))).toBe(1);
    expect(creatureAlpha(creature(CreatureState.Exiting, { timer: EXIT_TICKS }))).toBe(1);
    expect(creatureAlpha(creature(CreatureState.Exiting, { timer: EXIT_TICKS / 2 }))).toBe(0.5);
    expect(creatureAlpha(creature(CreatureState.Exiting, { timer: 0 }))).toBe(0);
  });
});

describe('PositionHistory', () => {
  it('returns the current position before there is any history', () => {
    const h = new PositionHistory();
    const c = creature(CreatureState.Walk, { x: 5, y: 7 });
    expect(h.position(c, 0.5)).toEqual({ x: 5, y: 7 });
    h.capture([c]);
    expect(h.position(c, 0.5)).toEqual({ x: 5, y: 7 });
  });

  it('interpolates between the last two captures', () => {
    const h = new PositionHistory();
    const c = creature(CreatureState.Fall, { x: 5, y: 7 });
    h.capture([c]);
    c.y = 8;
    c.x = 6;
    h.capture([c]);
    expect(h.position(c, 0)).toEqual({ x: 5, y: 7 });
    expect(h.position(c, 0.5)).toEqual({ x: 5.5, y: 7.5 });
    expect(h.position(c, 1)).toEqual({ x: 6, y: 8 });
    expect(h.position(c, 3)).toEqual({ x: 6, y: 8 });
  });

  it('snaps on jumps (teleport) instead of sliding', () => {
    const h = new PositionHistory();
    const c = creature(CreatureState.Walk, { x: 5, y: 7 });
    h.capture([c]);
    c.x = 5 + MAX_INTERP_DISTANCE + 1;
    h.capture([c]);
    expect(h.position(c, 0.25)).toEqual({ x: c.x, y: 7 });
  });

  it('handles creatures spawned since the previous capture and grows past its capacity', () => {
    const h = new PositionHistory();
    const list = [creature(CreatureState.Walk)];
    h.capture(list);
    for (let i = 1; i < 40; i++) {
      const c = createCreature(i, i, 50, 1);
      list.push(c);
      h.capture(list);
      expect(h.position(c, 0.5)).toEqual({ x: i, y: 50 });
    }
    list[0]!.x = 11;
    h.capture(list);
    expect(h.position(list[0]!, 0.5)).toEqual({ x: 10.5, y: 20 });
  });

  it('reset forgets the history', () => {
    const h = new PositionHistory();
    const c = creature(CreatureState.Walk, { x: 5, y: 7 });
    h.capture([c]);
    c.x = 6;
    h.capture([c]);
    h.reset();
    expect(h.position(c, 0)).toEqual({ x: 6, y: 7 });
  });
});
