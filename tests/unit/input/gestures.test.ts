import { describe, expect, it } from 'vitest';
import {
  DOUBLE_TAP_MS,
  type Gesture,
  GestureRecognizer,
  PAN_DEAD_ZONE,
  type PointerPhase,
} from '../../../src/input/gestures';

function feeder() {
  const rec = new GestureRecognizer();
  const out: Gesture[] = [];
  const f = (id: number, phase: PointerPhase, x: number, y: number, t = 0): Gesture[] => {
    const g = rec.feed({ id, phase, x, y, t });
    out.push(...g);
    return g;
  };
  return { rec, out, f };
}

describe('GestureRecognizer', () => {
  it('a touch released without moving is a tap', () => {
    const { f, out } = feeder();
    f(1, 'down', 100, 100);
    f(1, 'up', 100, 100);
    expect(out).toEqual([{ type: 'tap', x: 100, y: 100 }]);
  });

  it('movement inside the dead zone is still a tap, not a pan', () => {
    const { f, out } = feeder();
    f(1, 'down', 100, 100);
    f(1, 'move', 100 + PAN_DEAD_ZONE - 1, 100 + 2);
    f(1, 'up', 104, 102);
    expect(out).toEqual([{ type: 'tap', x: 104, y: 102 }]);
  });

  it('leaving the dead zone starts a pan without a jump', () => {
    const { f, out } = feeder();
    f(1, 'down', 100, 100);
    f(1, 'move', 110, 100);
    f(1, 'move', 115, 103);
    f(1, 'up', 115, 103);
    expect(out).toEqual([{ type: 'panStart' }, { type: 'pan', dx: 5, dy: 3 }, { type: 'panEnd' }]);
  });

  it('two quick taps close together are a double tap', () => {
    const { f, out } = feeder();
    f(1, 'down', 100, 100, 0);
    f(1, 'up', 100, 100, 50);
    f(2, 'down', 105, 102, 150);
    f(2, 'up', 105, 102, 200);
    expect(out).toEqual([
      { type: 'tap', x: 100, y: 100 },
      { type: 'doubleTap', x: 105, y: 102 },
    ]);
  });

  it('slow or distant second taps are separate taps', () => {
    const { f, out } = feeder();
    f(1, 'down', 100, 100, 0);
    f(1, 'up', 100, 100, 0);
    f(1, 'down', 100, 100, DOUBLE_TAP_MS + 100);
    f(1, 'up', 100, 100, DOUBLE_TAP_MS + 100);
    f(1, 'down', 200, 100, DOUBLE_TAP_MS + 150);
    f(1, 'up', 200, 100, DOUBLE_TAP_MS + 150);
    expect(out.map((g) => g.type)).toEqual(['tap', 'tap', 'tap']);
  });

  it('a third tap after a double tap starts over', () => {
    const { f, out } = feeder();
    for (const t of [0, 100, 200]) {
      f(1, 'down', 100, 100, t);
      f(1, 'up', 100, 100, t + 10);
    }
    expect(out.map((g) => g.type)).toEqual(['tap', 'doubleTap', 'tap']);
  });

  it('two fingers spreading apart pinch-zoom around their midpoint', () => {
    const { f, out } = feeder();
    f(1, 'down', 100, 100);
    f(2, 'down', 200, 100);
    f(2, 'move', 300, 100);
    expect(out).toEqual([
      { type: 'panStart' },
      { type: 'pan', dx: 50, dy: 0 },
      { type: 'pinch', x: 200, y: 100, factor: 2 },
    ]);
  });

  it('two fingers moving together pan without zooming', () => {
    const { f, out } = feeder();
    f(1, 'down', 100, 100);
    f(2, 'down', 200, 100);
    out.length = 0;
    f(1, 'move', 100, 120);
    f(2, 'move', 200, 120);
    expect(out.filter((g) => g.type === 'pinch')).toHaveLength(2);
    // Net zoom of the two half-steps is 1 (first stretches, second restores).
    const net = out
      .filter((g): g is Extract<Gesture, { type: 'pinch' }> => g.type === 'pinch')
      .reduce((a, g) => a * g.factor, 1);
    expect(net).toBeCloseTo(1);
    const dy = out
      .filter((g): g is Extract<Gesture, { type: 'pan' }> => g.type === 'pan')
      .reduce((a, g) => a + g.dy, 0);
    expect(dy).toBeCloseTo(20);
  });

  it('after a pinch the remaining finger keeps panning, and no tap fires', () => {
    const { f, out } = feeder();
    f(1, 'down', 100, 100);
    f(2, 'down', 200, 100);
    f(2, 'up', 200, 100);
    out.length = 0;
    f(1, 'move', 102, 100); // inside the dead zone, but already dragging
    f(1, 'up', 102, 100);
    expect(out).toEqual([{ type: 'pan', dx: 2, dy: 0 }, { type: 'panEnd' }]);
  });

  it('a two-finger tap is not a tap', () => {
    const { f, out } = feeder();
    f(1, 'down', 100, 100);
    f(2, 'down', 200, 100);
    f(2, 'up', 200, 100);
    f(1, 'up', 100, 100);
    expect(out.some((g) => g.type === 'tap')).toBe(false);
  });

  it('ignores a third finger and unknown pointers', () => {
    const { f, out, rec } = feeder();
    f(1, 'down', 100, 100);
    f(2, 'down', 200, 100);
    f(3, 'down', 300, 100);
    expect(rec.active).toBe(2);
    out.length = 0;
    f(3, 'move', 400, 100);
    f(9, 'up', 0, 0);
    expect(out).toEqual([]);
  });

  it('a cancelled touch is not a tap', () => {
    const { f, out } = feeder();
    f(1, 'down', 100, 100);
    f(1, 'cancel', 100, 100);
    expect(out).toEqual([]);
  });
});
