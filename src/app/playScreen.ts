import type { Application } from 'pixi.js';
import type { LevelDef, SkillId } from '../core/level';
import { objectRect } from '../core/level';
import type { InputLog } from '../core/replay';
import { canAssign } from '../core/sim';
import { GameSession } from '../game/session';
import type { Gesture } from '../input/gestures';
import { attachPointerInput } from '../input/pointerInput';
import { type DirectionFilter, candidatesFromSim, pickCandidate } from '../input/selection';
import {
  LOUPE_RADIUS,
  LOUPE_ZOOM,
  type PressView,
  SelectionController,
} from '../input/selectionController';
import { Camera } from '../render/camera';
import { Loupe } from '../render/loupe';
import { WorldRenderer } from '../render/worldRenderer';

export interface PlayScreenOptions {
  autoplay?: InputLog;
  /** Fast-forward to this tick on start. */
  seek?: number;
  paused?: boolean;
  /** Accept touch / mouse input (off in attract mode). */
  interactive?: boolean;
  /** With `interactive`: camera gestures only, creatures cannot be selected (solution replay). */
  watchOnly?: boolean;
  /** Start showing the whole level instead of the entrance framing (attract mode). */
  wholeLevel?: boolean;
  skill?: SkillId | null;
  filter?: DirectionFilter;
}

/** Outcome of a release on a creature, for feedback (sound / haptics from M3 on). */
export interface AssignAttempt {
  id: number;
  skill: SkillId | null;
  ok: boolean;
}

/**
 * One level on screen: the session (sim + clock), its renderer, the camera, the loupe and the
 * pointer input. Camera gestures never reach the sim; a press on a creature selects it (§1.7) and
 * releasing assigns the selected skill through the session – the only command path.
 */
export class PlayScreen {
  readonly session: GameSession;
  readonly renderer: WorldRenderer;
  readonly camera: Camera;
  skill: SkillId | null;
  filter: DirectionFilter;
  /** Latest release on a creature (diagnostics / tests; feedback hooks come with M3). */
  lastAttempt: AssignAttempt | null = null;
  /** Called after every release on a creature (sound / haptic feedback). */
  onAttempt: ((a: AssignAttempt) => void) | null = null;
  /** "Auto-pause while selecting" option (§1.7 point 5). */
  autoPause = false;
  /** The current press paused the game and will resume it. */
  private resumeAfterPress = false;
  private readonly selection: SelectionController;
  private readonly loupe = new Loupe();
  private readonly detachInput: (() => void) | null;

  constructor(
    private readonly app: Application,
    level: LevelDef,
    options: PlayScreenOptions = {},
  ) {
    this.session = new GameSession(level, { autoplay: options.autoplay });
    this.skill = options.skill ?? null;
    this.filter = options.filter ?? 'both';
    const sim = this.session.sim;
    this.renderer = new WorldRenderer(sim, { reducedMotion: prefersReducedMotion() });
    this.session.onStep((s, events) => this.renderer.onStep(s, events));
    if (options.seek) this.session.seek(options.seek);
    this.session.paused = options.paused ?? false;

    this.camera = new Camera(sim.width, sim.height);
    this.camera.setViewport(app.screen.width, app.screen.height);
    if (options.wholeLevel) {
      this.camera.set({ cx: sim.width / 2, cy: sim.height / 2, scale: this.camera.fitScale });
    } else {
      const entrance = level.objects.find((o) => o.type === 'entrance');
      const exits = level.objects.filter((o) => o.type === 'exit').map(objectRect);
      this.camera.frameStart(entrance && objectRect(entrance), exits);
    }

    this.selection = new SelectionController((x, y) => this.pickAt(x, y));
    app.stage.addChild(this.renderer.root, this.loupe.container);
    this.detachInput = options.interactive
      ? attachPointerInput(app.canvas, {
          onGesture: (g) => this.onGesture(g),
          onWheelZoom: (x, y, f) => this.camera.zoomAt({ x, y }, f),
          hitTest: (x, y) => !options.watchOnly && this.pickAt(x, y) !== null,
        })
      : null;
    this.draw(0);
  }

  /** The creature a tap at screen point (x, y) would select, or null. */
  pickAt(x: number, y: number): number | null {
    const w = this.camera.toWorld({ x, y });
    return pickCandidate(candidatesFromSim(this.session.sim, this.skill), {
      x: w.x,
      y: w.y,
      scale: this.camera.scale,
      filter: this.filter,
    });
  }

  get press(): PressView {
    return this.selection.view;
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
      case 'pressStart':
        if (this.autoPause && !this.session.paused && !this.session.sim.ended) {
          this.session.paused = true;
          this.resumeAfterPress = true;
        }
        this.selection.start(g.x, g.y, g.t);
        break;
      case 'pressMove':
        this.selection.move(g.x, g.y, g.t);
        break;
      case 'pressEnd': {
        const id = this.selection.end(g.x, g.y, g.t);
        if (id !== null) this.tryAssign(id);
        this.endAutoPause();
        break;
      }
      case 'pressCancel':
        this.selection.cancel();
        this.endAutoPause();
        break;
      default:
        break;
    }
  }

  private endAutoPause(): void {
    if (this.resumeAfterPress) this.session.paused = false;
    this.resumeAfterPress = false;
  }

  private tryAssign(id: number): void {
    const skill = this.skill;
    const ok = skill !== null && this.session.assign(id, skill);
    this.lastAttempt = { id, skill, ok };
    this.onAttempt?.(this.lastAttempt);
  }

  /** One display frame: advance the sim by real time, animate the camera, draw. */
  frame(dtMs: number, nowMs: number): void {
    this.session.frame(dtMs);
    this.camera.update(dtMs);
    this.selection.update(nowMs);
    this.selection.refresh();
    this.draw(nowMs);
  }

  resize(w: number, h: number): void {
    this.camera.setViewport(w, h);
    this.draw(0);
  }

  toggleWholeLevel(): void {
    this.camera.toggleWholeLevel();
  }

  private draw(nowMs: number): void {
    const view = this.selection.view;
    const sim = this.session.sim;
    this.renderer.setHighlight(
      view.target === null
        ? null
        : {
            id: view.target,
            valid: this.skill !== null && canAssign(sim, view.target, this.skill),
          },
    );
    this.renderer.applyCamera(this.camera.state, this.camera.screenCenter);
    this.renderer.render(this.session.alpha, nowMs);
    this.loupe.update(
      this.app.renderer,
      this.renderer.world,
      this.camera.state,
      this.camera.viewport,
      this.camera.screenCenter,
      view.loupe ? { at: view.loupe, zoom: LOUPE_ZOOM, radius: LOUPE_RADIUS } : null,
    );
  }

  destroy(): void {
    this.detachInput?.();
    this.app.stage.removeChild(this.renderer.root, this.loupe.container);
    this.loupe.destroy();
    this.renderer.destroy();
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
