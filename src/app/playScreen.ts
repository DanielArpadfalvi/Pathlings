import type { Application } from 'pixi.js';
import type { LevelDef } from '../core/level';
import { objectRect } from '../core/level';
import type { InputLog } from '../core/replay';
import { GameSession } from '../game/session';
import type { Gesture } from '../input/gestures';
import { attachPointerInput } from '../input/pointerInput';
import { Camera } from '../render/camera';
import { WorldRenderer } from '../render/worldRenderer';

export interface PlayScreenOptions {
  autoplay?: InputLog;
  /** Fast-forward to this tick on start. */
  seek?: number;
  paused?: boolean;
  /** Accept touch / mouse input (off in attract mode). */
  interactive?: boolean;
  /** Start showing the whole level instead of the entrance framing (attract mode). */
  wholeLevel?: boolean;
}

/**
 * One level on screen: the session (sim + clock), its renderer, the camera and the pointer input
 * that moves the camera. Camera gestures never reach the sim or its input log.
 */
export class PlayScreen {
  readonly session: GameSession;
  readonly renderer: WorldRenderer;
  readonly camera: Camera;
  private readonly detachInput: (() => void) | null;

  constructor(
    private readonly app: Application,
    level: LevelDef,
    options: PlayScreenOptions = {},
  ) {
    this.session = new GameSession(level, { autoplay: options.autoplay });
    const sim = this.session.sim;
    this.renderer = new WorldRenderer(sim);
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

    app.stage.addChild(this.renderer.root);
    this.detachInput = options.interactive
      ? attachPointerInput(app.canvas, {
          onGesture: (g) => this.onGesture(g),
          onWheelZoom: (x, y, f) => this.camera.zoomAt({ x, y }, f),
        })
      : null;
    this.draw(0);
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
      default:
        break; // taps select creatures from T2.3 on
    }
  }

  /** One display frame: advance the sim by real time, animate the camera, draw. */
  frame(dtMs: number, nowMs: number): void {
    this.session.frame(dtMs);
    this.camera.update(dtMs);
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
    this.renderer.applyCamera(this.camera.state, this.camera.viewport);
    this.renderer.render(this.session.alpha, nowMs);
  }

  destroy(): void {
    this.detachInput?.();
    this.app.stage.removeChild(this.renderer.root);
    this.renderer.destroy();
  }
}
