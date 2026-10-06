import { describe, expect, it } from 'vitest';
import { GestureRecognizer } from '../../../src/input/gestures';
import {
  LOUPE_CANCEL_DISTANCE,
  LOUPE_DELAY_MS,
  SelectionController,
} from '../../../src/input/selectionController';

/** Picker over a 1-D world: creature k sits at x = 100 + 20 k (k = 0…4), radius 8. */
const pick = (x: number): number | null => {
  const k = Math.round((x - 100) / 20);
  return k >= 0 && k <= 4 && Math.abs(x - (100 + 20 * k)) <= 8 ? k : null;
};

describe('SelectionController', () => {
  it('highlights under the finger and assigns on release', () => {
    const s = new SelectionController((x) => pick(x));
    s.start(120, 50, 0);
    expect(s.view.target).toBe(1);
    expect(s.end(121, 50, 100)).toBe(1);
    expect(s.view.target).toBeNull();
  });

  it('dragging the finger switches the candidate before release', () => {
    const s = new SelectionController((x) => pick(x));
    s.start(120, 50, 0);
    s.move(140, 50, 50);
    expect(s.view.target).toBe(2);
    expect(s.end(160, 50, 100)).toBe(3);
  });

  it('releasing over nobody assigns nothing', () => {
    const s = new SelectionController((x) => pick(x));
    s.start(120, 50, 0);
    expect(s.end(130, 50, 50)).toBeNull();
  });

  it('opens the loupe after 250 ms of holding', () => {
    const s = new SelectionController((x) => pick(x));
    s.start(120, 50, 1000);
    s.update(1000 + LOUPE_DELAY_MS - 1);
    expect(s.view.loupe).toBeNull();
    s.update(1000 + LOUPE_DELAY_MS);
    expect(s.view.loupe).toEqual({ x: 120, y: 50 });
  });

  it('dragging out of the loupe cancels; release then assigns nothing', () => {
    const s = new SelectionController((x) => pick(x));
    s.start(120, 50, 0);
    s.update(LOUPE_DELAY_MS);
    s.move(120, 50 + LOUPE_CANCEL_DISTANCE + 1, 400);
    expect(s.view.cancelled).toBe(true);
    expect(s.view.target).toBeNull();
    expect(s.view.loupe).toBeNull();
    s.move(120, 50, 450); // coming back does not revive it
    expect(s.end(120, 50, 500)).toBeNull();
  });

  it('moving within the loupe keeps the selection', () => {
    const s = new SelectionController((x) => pick(x));
    s.start(120, 50, 0);
    s.update(LOUPE_DELAY_MS);
    s.move(124, 60, 400);
    expect(s.end(124, 60, 500)).toBe(1);
  });

  it('refresh re-picks under a resting finger (the crowd moves)', () => {
    let offset = 0;
    const s = new SelectionController((x) => pick(x + offset));
    s.start(120, 50, 0);
    expect(s.view.target).toBe(1);
    offset = 20;
    s.refresh();
    expect(s.view.target).toBe(2);
  });

  it('cancel and stray events are harmless', () => {
    const s = new SelectionController((x) => pick(x));
    s.move(120, 50, 0);
    expect(s.end(120, 50, 0)).toBeNull();
    s.start(120, 50, 0);
    s.cancel();
    expect(s.view.finger).toBeNull();
  });
});

describe('GestureRecognizer press mode', () => {
  const onCreature = (x: number): boolean => pick(x) !== null;

  it('a touch on a creature is a press, not a tap or pan', () => {
    const rec = new GestureRecognizer(onCreature);
    const out = [
      ...rec.feed({ id: 1, phase: 'down', x: 120, y: 50, t: 0 }),
      ...rec.feed({ id: 1, phase: 'move', x: 160, y: 50, t: 10 }),
      ...rec.feed({ id: 1, phase: 'up', x: 160, y: 50, t: 20 }),
    ];
    expect(out).toEqual([
      { type: 'pressStart', x: 120, y: 50, t: 0 },
      { type: 'pressMove', x: 160, y: 50, t: 10 },
      { type: 'pressEnd', x: 160, y: 50, t: 20 },
    ]);
  });

  it('a touch on empty ground still pans', () => {
    const rec = new GestureRecognizer(onCreature);
    rec.feed({ id: 1, phase: 'down', x: 130, y: 50, t: 0 });
    expect(rec.feed({ id: 1, phase: 'move', x: 150, y: 50, t: 10 })).toEqual([
      { type: 'panStart' },
    ]);
  });

  it('a second finger cancels the press and starts a pinch', () => {
    const rec = new GestureRecognizer(onCreature);
    rec.feed({ id: 1, phase: 'down', x: 120, y: 50, t: 0 });
    expect(rec.feed({ id: 2, phase: 'down', x: 220, y: 50, t: 5 })).toEqual([
      { type: 'pressCancel' },
      { type: 'panStart' },
    ]);
  });

  it('a cancelled pointer cancels the press', () => {
    const rec = new GestureRecognizer(onCreature);
    rec.feed({ id: 1, phase: 'down', x: 120, y: 50, t: 0 });
    expect(rec.feed({ id: 1, phase: 'cancel', x: 120, y: 50, t: 5 })).toEqual([
      { type: 'pressCancel' },
    ]);
  });

  it('presses never count towards a double tap', () => {
    const rec = new GestureRecognizer(onCreature);
    rec.feed({ id: 1, phase: 'down', x: 130, y: 50, t: 0 });
    rec.feed({ id: 1, phase: 'up', x: 130, y: 50, t: 10 }); // tap on empty ground
    rec.feed({ id: 1, phase: 'down', x: 120, y: 50, t: 50 });
    const out = rec.feed({ id: 1, phase: 'up', x: 120, y: 50, t: 60 });
    expect(out).toEqual([{ type: 'pressEnd', x: 120, y: 50, t: 60 }]);
  });
});
