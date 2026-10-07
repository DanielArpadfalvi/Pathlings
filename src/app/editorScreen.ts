import type { Application } from 'pixi.js';
import type { LevelDef, LevelObject } from '../core/level';
import type { RasterOp } from '../core/raster';
import { EditorDoc, type EditorStatus, type LevelProps } from '../editor/doc';
import { THEME_STAMPS } from '../editor/palette';
import {
  PolyBuilder,
  StrokeBuilder,
  type Tool,
  type WorldPoint,
  moveObject,
  objectAt,
  objectAtPoint,
  shapeFromDrag,
  stampAt,
} from '../editor/tools';
import type { Gesture } from '../input/gestures';
import { attachPointerInput } from '../input/pointerInput';
import { Camera } from '../render/camera';
import { EditorRenderer } from '../render/editorRenderer';

/** Plain-data editor state for the DOM overlay. */
export interface EditorView {
  tool: Tool;
  canUndo: boolean;
  canRedo: boolean;
  status: EditorStatus;
  /** Selected object (hand tool), with what the overlay needs to offer actions. */
  selected: { index: number; type: LevelObject['type']; dir: number } | null;
  stamps: readonly string[];
  /** Corners of a polygon in progress. */
  polyCorners: number;
  theme: LevelDef['theme'];
  props: LevelProps;
}

export const DEFAULT_TOOL: Tool = { kind: 'brush', size: 1, m: 1 };

type Pending =
  | { kind: 'stroke'; builder: StrokeBuilder }
  | { kind: 'shape'; from: WorldPoint; op: RasterOp | null }
  | { kind: 'stamp'; op: RasterOp | null }
  | { kind: 'object'; at: WorldPoint }
  | { kind: 'move'; index: number; from: WorldPoint; to: WorldPoint }
  | null;

/**
 * The level editor on screen (§1.8): an `EditorDoc`, its renderer and camera, and the touch
 * handling that turns presses into strokes, shapes, stamps and objects. One finger draws with
 * the active tool (or drags an object with the hand tool), two fingers pan and zoom.
 */
export class EditorScreen {
  readonly doc: EditorDoc;
  camera: Camera;
  readonly renderer: EditorRenderer;
  tool: Tool = DEFAULT_TOOL;
  selected = -1;
  /** Called whenever the overlay state may have changed. */
  onViewChange: (() => void) | null = null;
  private pending: Pending = null;
  private poly: PolyBuilder | null = null;
  private readonly detachInput: () => void;

  constructor(
    private readonly app: Application,
    source?: LevelDef | EditorDoc,
  ) {
    // Re-entering after a test play hands back the same document, undo history included.
    this.doc = source instanceof EditorDoc ? source : new EditorDoc(source);
    this.renderer = new EditorRenderer(this.doc.level);
    this.camera = new Camera(this.doc.level.w, this.doc.level.h);
    this.camera.setViewport(app.screen.width, app.screen.height);
    this.showWhole();
    this.doc.onChange = (l) => {
      if (l.w !== this.camera.worldW || l.h !== this.camera.worldH) this.resetCamera(l);
      if (this.selected >= l.objects.length) this.selected = -1;
      this.renderer.setLevel(l);
      this.refreshPreview();
      this.onViewChange?.();
    };
    app.stage.addChild(this.renderer.root);
    this.detachInput = attachPointerInput(app.canvas, {
      hitTest: (x, y) => this.capturesTouch(x, y),
      onGesture: (g) => this.onGesture(g),
      onWheelZoom: (x, y, f) => this.camera.zoomAt({ x, y }, f),
    });
  }

  get view(): EditorView {
    const o = this.doc.level.objects[this.selected];
    return {
      tool: this.tool,
      canUndo: this.doc.canUndo,
      canRedo: this.doc.canRedo,
      status: this.doc.status,
      selected: o
        ? { index: this.selected, type: o.type, dir: o.type === 'entrance' ? o.dir : 0 }
        : null,
      stamps: THEME_STAMPS[this.doc.level.theme],
      polyCorners: (this.poly?.points.length ?? 0) / 2,
      theme: this.doc.level.theme,
      props: this.doc.props,
    };
  }

  private showWhole(): void {
    const l = this.doc.level;
    this.camera.set({ cx: l.w / 2, cy: l.h / 2, scale: this.camera.fitScale });
  }

  private resetCamera(l: LevelDef): void {
    const insets = this.insets;
    this.camera = new Camera(l.w, l.h);
    this.camera.setViewport(this.app.screen.width, this.app.screen.height);
    this.camera.setInsets(insets.top, insets.bottom);
    this.showWhole();
  }

  private insets = { top: 0, bottom: 0 };

  setInsets(top: number, bottom: number): void {
    this.insets = { top, bottom };
    this.camera.setInsets(top, bottom);
    this.showWhole();
  }

  setTool(tool: Tool): void {
    this.cancelPending();
    if (tool.kind !== 'shape' || tool.shape !== 'poly') this.poly = null;
    this.tool = tool;
    if (tool.kind !== 'hand') this.selected = -1;
    this.refreshPreview();
    this.onViewChange?.();
  }

  // --- Input ----------------------------------------------------------------------------------

  private world(x: number, y: number): WorldPoint {
    return this.camera.toWorld({ x, y });
  }

  /** One-finger touches draw with every tool but the hand, which only grabs objects. */
  private capturesTouch(x: number, y: number): boolean {
    if (this.tool.kind !== 'hand') return true;
    return objectAtPoint(this.doc.level, this.world(x, y)) >= 0;
  }

  private onGesture(g: Gesture): void {
    switch (g.type) {
      case 'pan':
        this.camera.panBy(g.dx, g.dy);
        break;
      case 'pinch':
        this.camera.zoomAt({ x: g.x, y: g.y }, g.factor);
        break;
      case 'doubleTap':
        this.camera.doubleTap({ x: g.x, y: g.y });
        break;
      case 'tap':
        if (this.tool.kind === 'hand') this.select(-1);
        break;
      case 'pressStart':
        this.pressStart(this.world(g.x, g.y));
        break;
      case 'pressMove':
        this.pressMove(this.world(g.x, g.y));
        break;
      case 'pressEnd': {
        const w = this.world(g.x, g.y);
        if (this.tool.kind === 'shape' && this.tool.shape === 'poly') this.polyTap(w);
        else {
          this.pressMove(w);
          this.pressEnd();
        }
        break;
      }
      case 'pressCancel':
        this.cancelPending();
        break;
      default:
        break;
    }
  }

  private pressStart(w: WorldPoint): void {
    const t = this.tool;
    switch (t.kind) {
      case 'brush':
      case 'eraser': {
        const builder = new StrokeBuilder(t);
        builder.add(w);
        this.pending = { kind: 'stroke', builder };
        break;
      }
      case 'shape':
        if (t.shape !== 'poly') this.pending = { kind: 'shape', from: w, op: null };
        break;
      case 'stamp':
        this.pending = { kind: 'stamp', op: stampAt(t.id, t.m, w, t.flip) };
        break;
      case 'object':
        this.pending = { kind: 'object', at: w };
        break;
      case 'hand': {
        const index = objectAtPoint(this.doc.level, w);
        if (index >= 0) {
          this.select(index);
          this.pending = { kind: 'move', index, from: w, to: w };
        }
        break;
      }
    }
    this.refreshPreview();
  }

  private pressMove(w: WorldPoint): void {
    const p = this.pending;
    const t = this.tool;
    if (!p) return;
    if (p.kind === 'stroke') p.builder.add(w);
    else if (p.kind === 'shape' && t.kind === 'shape' && t.shape !== 'poly') {
      p.op = shapeFromDrag(t.shape, t.m, p.from, w);
    } else if (p.kind === 'stamp' && t.kind === 'stamp') p.op = stampAt(t.id, t.m, w, t.flip);
    else if (p.kind === 'object') p.at = w;
    else if (p.kind === 'move') p.to = w;
    this.refreshPreview();
  }

  private pressEnd(): void {
    const p = this.pending;
    const t = this.tool;
    this.pending = null;
    if (!p) return;
    switch (p.kind) {
      case 'stroke':
        this.doc.addOps(p.builder.finish());
        break;
      case 'shape':
      case 'stamp':
        if (p.op) this.doc.addOps([p.op]);
        break;
      case 'object':
        if (t.kind === 'object') {
          this.selected = this.doc.addObject(objectAt(t.type, p.at, this.doc.level));
        }
        break;
      case 'move': {
        const o = this.doc.level.objects[p.index];
        if (o && (p.to.x !== p.from.x || p.to.y !== p.from.y)) {
          this.doc.updateObject(
            p.index,
            moveObject(o, p.to.x - p.from.x, p.to.y - p.from.y, this.doc.level),
          );
        }
        break;
      }
    }
    this.refreshPreview();
    this.onViewChange?.();
  }

  /** Poly corners arrive as press releases (tap = press on the canvas with a drawing tool). */
  private polyTap(w: WorldPoint): void {
    const t = this.tool;
    if (t.kind !== 'shape' || t.shape !== 'poly') return;
    this.poly ??= new PolyBuilder(t.m);
    const op = this.poly.add(w);
    if (op) {
      this.poly = null;
      this.doc.addOps([op]);
    }
    this.refreshPreview();
    this.onViewChange?.();
  }

  /** Finish the polygon in progress (the "done" button). */
  finishPoly(): void {
    const op = this.poly?.finish() ?? null;
    this.poly = null;
    if (op) this.doc.addOps([op]);
    this.refreshPreview();
    this.onViewChange?.();
  }

  private cancelPending(): void {
    if (this.pending?.kind === 'move') this.renderer.setLevel(this.doc.level);
    this.pending = null;
    this.refreshPreview();
  }

  private select(index: number): void {
    this.selected = index;
    this.refreshPreview();
    this.onViewChange?.();
  }

  // --- Object actions -------------------------------------------------------------------------

  deleteSelected(): void {
    if (this.selected < 0) return;
    const i = this.selected;
    this.selected = -1;
    this.doc.removeObject(i);
  }

  /** Entrances: flip the direction new creatures walk. */
  flipSelected(): void {
    const o = this.doc.level.objects[this.selected];
    if (o?.type === 'entrance') {
      this.doc.updateObject(this.selected, { ...o, dir: o.dir === 1 ? -1 : 1 });
    }
  }

  toggleWholeLevel(): void {
    this.camera.toggleWholeLevel();
  }

  // --- Drawing --------------------------------------------------------------------------------

  private refreshPreview(): void {
    const p = this.pending;
    let ops: RasterOp[] = [];
    if (p?.kind === 'stroke') ops = p.builder.finish();
    else if ((p?.kind === 'shape' || p?.kind === 'stamp') && p.op) ops = [p.op];
    if (p?.kind === 'move') {
      const o = this.doc.level.objects[p.index];
      if (o) {
        const objects = this.doc.level.objects.slice();
        objects[p.index] = moveObject(o, p.to.x - p.from.x, p.to.y - p.from.y, this.doc.level);
        this.renderer.setLevel({ ...this.doc.level, objects });
      }
    }
    this.renderer.setPreview({ ops, corners: this.poly?.points ?? [] }, this.selected);
  }

  frame(dtMs: number, nowMs: number): void {
    this.camera.update(dtMs);
    this.renderer.applyCamera(this.camera.state, this.camera.screenCenter);
    this.renderer.render(nowMs);
  }

  resize(w: number, h: number): void {
    this.camera.setViewport(w, h);
  }

  undo(): void {
    this.cancelPending();
    this.doc.undo();
  }

  redo(): void {
    this.cancelPending();
    this.doc.redo();
  }

  destroy(): void {
    this.doc.onChange = null;
    this.detachInput();
    this.app.stage.removeChild(this.renderer.root);
    this.renderer.destroy();
  }
}
