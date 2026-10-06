import { Container, Graphics } from 'pixi.js';
import type { Sim, SimEvent } from '../core/world';
import type { CameraState } from './camera';
import { CreatureLayer } from './creatureLayer';
import { PositionHistory } from './interp';
import { ObjectLayer } from './objectLayer';
import type { ThemePalette } from './palette';
import { PALETTES } from './palette';
import { TerrainLayer } from './terrainLayer';

/** Number of colour bands of the background gradient (a stepped, pixel-art gradient). */
const SKY_BANDS = 24;

function mixRgb(a: number, b: number, t: number): number {
  const ch = (shift: number): number => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * t) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

export interface RenderStats {
  /** Terrain texture uploads so far. */
  terrainUploads: number;
  /** Texels uploaded in the latest frame. */
  lastUploadTexels: number;
  creaturesDrawn: number;
}

/**
 * Draws one level: background, terrain texture, objects, creatures. Strictly read-only towards
 * the sim – the session steps it and passes each tick's events to `onStep`; `render` only reads.
 * Layering (back → front): sky, terrain, objects, creatures, liquids, marks.
 */
export class WorldRenderer {
  /** Add this to the stage. */
  readonly root = new Container();
  /** World-space container (1 unit = 1 world pixel); `applyCamera` positions and scales it. */
  readonly world = new Container();
  readonly palette: ThemePalette;
  private readonly sky = new Graphics();
  private readonly terrain: TerrainLayer;
  private readonly objects: ObjectLayer;
  private readonly creatures = new CreatureLayer();
  private readonly history = new PositionHistory();

  constructor(private readonly sim: Sim) {
    this.palette = PALETTES[sim.level.theme] ?? PALETTES.glade;
    this.terrain = new TerrainLayer(sim.terrain, this.palette);
    this.objects = new ObjectLayer(sim.objects, this.palette);
    this.drawSky();
    this.world.addChild(
      this.sky,
      this.terrain.sprite,
      this.objects.back,
      this.creatures.container,
      this.objects.front,
    );
    this.root.addChild(this.world);
    this.history.capture(sim.creatures);
  }

  /** Session step listener: collects terrain damage and records positions for interpolation. */
  onStep(sim: Sim, events: readonly SimEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'terrainChanged') this.terrain.invalidate(ev.rect);
      else if (ev.type === 'rewound') {
        this.terrain.invalidateAll();
        this.history.reset();
      }
    }
    this.history.capture(sim.creatures);
  }

  /** Positions and scales the world container for a camera view (see `camera.ts`). */
  applyCamera(cam: CameraState, viewport: { w: number; h: number }): void {
    this.world.scale.set(cam.scale);
    this.world.position.set(
      viewport.w / 2 - cam.cx * cam.scale,
      viewport.h / 2 - cam.cy * cam.scale,
    );
  }

  /**
   * Updates the display objects for this frame. `alpha` interpolates creatures between the
   * previous and the latest tick; `timeMs` only drives cosmetic motion.
   */
  render(alpha: number, timeMs: number): void {
    this.terrain.flush();
    this.objects.update(this.sim, timeMs);
    this.creatures.update(this.sim, this.history, alpha);
  }

  get stats(): RenderStats {
    return {
      terrainUploads: this.terrain.uploads,
      lastUploadTexels: this.terrain.lastUploadTexels,
      creaturesDrawn: this.creatures.drawn,
    };
  }

  private drawSky(): void {
    const [top, bottom] = this.palette.sky;
    const { width, height } = this.sim;
    for (let i = 0; i < SKY_BANDS; i++) {
      const y0 = Math.floor((i * height) / SKY_BANDS);
      const y1 = Math.floor(((i + 1) * height) / SKY_BANDS);
      this.sky.rect(0, y0, width, y1 - y0).fill(mixRgb(top, bottom, i / (SKY_BANDS - 1)));
    }
  }

  destroy(): void {
    this.terrain.destroy();
    this.objects.destroy();
    this.creatures.destroy();
    this.root.destroy({ children: true });
  }
}
