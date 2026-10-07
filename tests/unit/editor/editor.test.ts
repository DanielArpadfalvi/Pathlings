import { describe, expect, it } from 'vitest';
import { MAX_CODE_BYTES } from '../../../src/core/code/levelCode';
import { LEVEL_SIZE_PRESETS, THEMES, validateLevel } from '../../../src/core/level';
import { MAX_OPS, MAX_STROKE_POINTS, type RasterOp, validateOp } from '../../../src/core/raster';
import { STAMPS, stampSize } from '../../../src/core/stamps';
import { EditorDoc, MAX_UNDO, newDraft } from '../../../src/editor/doc';
import { THEME_STAMPS } from '../../../src/editor/palette';
import {
  PolyBuilder,
  StrokeBuilder,
  moveObject,
  objectAt,
  objectAtPoint,
  shapeFromDrag,
  stampAt,
} from '../../../src/editor/tools';
import { tunnel } from '../../../src/levels/test';

const rect = (x: number): RasterOp => ({ op: 'rect', m: 1, x, y: 10, w: 5, h: 5 });

describe('EditorDoc', () => {
  it('a new draft is a valid, playable level', () => {
    for (let i = 0; i < LEVEL_SIZE_PRESETS.length; i++) {
      expect(validateLevel(newDraft(i))).toEqual([]);
    }
    const doc = new EditorDoc();
    expect(doc.status.playable).toBe(true);
    expect(doc.canUndo).toBe(false);
  });

  it('drops a solution of the level it starts from', () => {
    expect(new EditorDoc(tunnel).level.solution).toBeUndefined();
  });

  it('undo / redo walk the history; a new edit drops the redo branch', () => {
    const doc = new EditorDoc();
    const base = doc.level.ops.length;
    doc.addOps([rect(1)]);
    doc.addOps([rect(2)]);
    expect(doc.level.ops).toHaveLength(base + 2);
    expect(doc.undo()).toBe(true);
    expect(doc.level.ops).toHaveLength(base + 1);
    expect(doc.redo()).toBe(true);
    expect(doc.level.ops).toHaveLength(base + 2);
    doc.undo();
    doc.addOps([rect(3)]);
    expect(doc.canRedo).toBe(false);
    expect(doc.level.ops.at(-1)).toEqual(rect(3));
  });

  it('keeps at least 100 undo steps (up to MAX_UNDO)', () => {
    const doc = new EditorDoc();
    for (let i = 0; i < MAX_UNDO + 50; i++) doc.addOps([rect(i)]);
    let steps = 0;
    while (doc.undo()) steps++;
    expect(steps).toBe(MAX_UNDO);
    expect(steps).toBeGreaterThanOrEqual(100);
  });

  it('never mutates earlier drafts', () => {
    const doc = new EditorDoc();
    const before = doc.level;
    const ops = before.ops;
    doc.addOps([rect(1)]);
    doc.addObject({ type: 'trap', x: 10, y: 10 });
    expect(before.ops).toBe(ops);
    expect(before.ops).toHaveLength(1);
    expect(before.objects).toHaveLength(2);
  });

  it('enforces the 1024-op limit without consuming an undo step', () => {
    const doc = new EditorDoc();
    const room = MAX_OPS - doc.level.ops.length;
    expect(doc.addOps(Array.from({ length: room }, (_, i) => rect(i % 300)))).toBe(true);
    expect(doc.opsLeft).toBe(0);
    const depth = doc.undoDepth;
    expect(doc.addOps([rect(1)])).toBe(false);
    expect(doc.undoDepth).toBe(depth);
    expect(doc.level.ops).toHaveLength(MAX_OPS);
    expect(doc.addOps([])).toBe(false);
  });

  it('objects: add, update, remove (each undoable)', () => {
    const doc = new EditorDoc();
    const i = doc.addObject({ type: 'trap', x: 50, y: 50 });
    doc.updateObject(i, { type: 'trap', x: 60, y: 50 });
    expect(doc.level.objects[i]).toEqual({ type: 'trap', x: 60, y: 50 });
    doc.removeObject(i);
    expect(doc.level.objects).toHaveLength(2);
    doc.undo();
    expect(doc.level.objects).toHaveLength(3);
    doc.updateObject(99, { type: 'trap', x: 0, y: 0 });
    doc.removeObject(99);
    expect(doc.level.objects).toHaveLength(3);
  });

  it('properties are clamped to the §1.8 limits', () => {
    const doc = new EditorDoc();
    doc.setProps({ creatures: 500, required: 999, master: 0, title: 'x'.repeat(50) });
    const p = doc.props;
    expect(p.creatures).toBe(100);
    expect(p.required).toBe(100);
    expect(p.master).toBe(100);
    expect(p.title).toHaveLength(32);
    doc.setProps({ sizePreset: 2, theme: 'deep', timeLimitTicks: 10, minReleaseTicks: 1000 });
    expect(doc.level.w).toBe(LEVEL_SIZE_PRESETS[2]!.w);
    expect(doc.level.theme).toBe('deep');
    expect(doc.level.timeLimitTicks).toBe(2 * 60 * 60);
    expect(doc.level.minReleaseTicks).toBe(240);
    doc.setProps({ hints: ['  ', 'Dig!', 'third'] });
    expect(doc.level.hints).toEqual(['Dig!']);
    doc.setProps({ skills: { ...doc.props.skills, mason: 150, delver: -3 } });
    expect(doc.level.skills.mason).toBe(99);
    expect(doc.level.skills.delver).toBe(0);
  });

  it('live validation reports missing exits and the code size', () => {
    const doc = new EditorDoc();
    expect(doc.status.codeBytes).toBeGreaterThan(0);
    expect(doc.status.codeLimit).toBe(MAX_CODE_BYTES);
    doc.removeObject(1); // the exit
    const st = doc.status;
    expect(st.playable).toBe(false);
    expect(st.errors.map((e) => e.code)).toContain('noExit');
  });

  it('notifies on every change including undo', () => {
    const doc = new EditorDoc();
    let n = 0;
    doc.onChange = () => n++;
    doc.addOps([rect(1)]);
    doc.undo();
    doc.redo();
    expect(n).toBe(3);
  });
});

describe('editor tools', () => {
  it('strokes skip tiny moves and split into ≤ 256-point ops that join up', () => {
    const s = new StrokeBuilder({ kind: 'brush', size: 1, m: 2 });
    s.add({ x: 0.4, y: 0 });
    s.add({ x: 1, y: 0 }); // < 2 px: skipped
    for (let i = 1; i <= 600; i++) s.add({ x: i * 3, y: (i * 7) % 50 });
    const ops = s.finish();
    expect(ops.length).toBe(3);
    for (const op of ops) {
      expect(validateOp(op)).toBeNull();
      if (op.op !== 'brush') throw new Error('brush expected');
      expect(op.pts.length / 2).toBeLessThanOrEqual(MAX_STROKE_POINTS);
    }
    const a = ops[0] as Extract<RasterOp, { op: 'brush' }>;
    const b = ops[1] as Extract<RasterOp, { op: 'brush' }>;
    expect(b.pts.slice(0, 2)).toEqual(a.pts.slice(-2));
    const e = new StrokeBuilder({ kind: 'eraser', size: 2 });
    e.add({ x: 5, y: 5 });
    expect(e.finish()).toEqual([{ op: 'erase', size: 2, pts: [5, 5] }]);
    expect(new StrokeBuilder({ kind: 'eraser', size: 0 }).finish()).toEqual([]);
  });

  it('shapes from drags', () => {
    expect(shapeFromDrag('rect', 1, { x: 10, y: 20 }, { x: 4, y: 30.6 })).toEqual({
      op: 'rect',
      m: 1,
      x: 4,
      y: 20,
      w: 7,
      h: 12,
    });
    expect(shapeFromDrag('circle', 2, { x: 10, y: 10 }, { x: 13, y: 14 })).toEqual({
      op: 'circle',
      m: 2,
      x: 10,
      y: 10,
      r: 5,
    });
    const up = shapeFromDrag('ramp', 1, { x: 0, y: 20 }, { x: 20, y: 0 });
    expect(up).toMatchObject({ op: 'ramp', rise: 'right' });
    const down = shapeFromDrag('ramp', 1, { x: 0, y: 0 }, { x: 20, y: 20 });
    expect(down).toMatchObject({ op: 'ramp', rise: 'left' });
    expect(shapeFromDrag('rect', 1, { x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
    expect(shapeFromDrag('circle', 1, { x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });

  it('polygons close on a tap near the first corner', () => {
    const p = new PolyBuilder(3);
    expect(p.add({ x: 0, y: 0 })).toBeNull();
    expect(p.add({ x: 40, y: 0 })).toBeNull();
    expect(p.add({ x: 20, y: 30 })).toBeNull();
    const op = p.add({ x: 2, y: 3 });
    expect(op).toEqual({ op: 'poly', m: 3, pts: [0, 0, 40, 0, 20, 30] });
    expect(validateOp(op!)).toBeNull();
    expect(new PolyBuilder(1).finish()).toBeNull();
  });

  it('stamps are centred on the tap', () => {
    const op = stampAt('boulder', 2, { x: 50, y: 50 }, true);
    expect(op).toEqual({ op: 'stamp', id: 'boulder', m: 2, x: 45, y: 47, flip: true });
    expect(stampAt('nope', 1, { x: 0, y: 0 }, false)).toBeNull();
  });

  it('objects are placed inside the level and found again by a tap', () => {
    const level = newDraft();
    for (const type of [
      'entrance',
      'exit',
      'water',
      'lava',
      'trap',
      'teleport',
      'bounce',
    ] as const) {
      for (const p of [
        { x: 0, y: 0 },
        { x: 160, y: 240 },
        { x: 10_000, y: 10_000 },
      ]) {
        const o = objectAt(type, p, level);
        const l = { ...level, objects: [...level.objects, o] };
        expect(validateLevel(l), `${type} at ${p.x},${p.y}`).toEqual([]);
      }
    }
    const trap = objectAt('trap', { x: 100, y: 100 }, level);
    const l = { ...level, objects: [...level.objects, trap] };
    expect(objectAtPoint(l, { x: 100, y: 95 })).toBe(2);
    expect(objectAtPoint(l, { x: 5, y: 5 })).toBe(-1);
    const moved = moveObject(trap, 10_000, -10_000, level);
    expect(moved.x).toBe(level.w - 10);
    expect(moved.y).toBe(0);
    const tp = objectAt('teleport', { x: 50, y: 100 }, level);
    const tpMoved = moveObject(tp, 5, 3, level);
    expect(tpMoved).toMatchObject({ x: tp.x + 5, y: tp.y + 3 });
    if (tpMoved.type === 'teleport' && tp.type === 'teleport') expect(tpMoved.tx).toBe(tp.tx + 5);
  });
});

describe('stamp palettes', () => {
  it('every theme offers ~16 existing stamps', () => {
    for (const t of THEMES) {
      expect(THEME_STAMPS[t].length).toBe(16);
      for (const id of THEME_STAMPS[t]) expect(STAMPS[id], `${t}: ${id}`).toBeDefined();
    }
  });

  it('every stamp is rectangular and uses only valid characters', () => {
    for (const [id, def] of Object.entries(STAMPS)) {
      const { w, h } = stampSize(def);
      expect(w, id).toBeGreaterThan(0);
      expect(h, id).toBeGreaterThan(0);
      for (const row of def.rows) {
        expect(row.length, id).toBe(w);
        expect(row, id).toMatch(/^[.#0-6]+$/);
      }
    }
  });
});
