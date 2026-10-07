import { Container, Graphics } from 'pixi.js';
import type { LevelDef } from '../core/level';
import { buildTerrain, objectRect } from '../core/level';
import type { RasterOp } from '../core/raster';
import type { Terrain } from '../core/terrain';
import type { CameraState } from './camera';
import { ObjectLayer } from './objectLayer';
import { PALETTES, type ThemePalette } from './palette';
import { TerrainLayer } from './terrainLayer';

/** What the active tool wants to show before it commits (stroke, shape, poly corners, stamp). */
export interface EditorPreview {
  /** Ops drawn translucent on top of the terrain (shape / stamp / stroke in progress). */
  ops: readonly RasterOp[];
  /** Polygon corners placed so far (world px). */
  corners: readonly number[];
}

const NO_PREVIEW: EditorPreview = { ops: [], corners: [] };

/**
 * Draws a level draft in the editor: sky, terrain (re-rasterized from the op list on change),
 * objects, the tool preview, the selected object's frame and the level border. Read-only towards
 * the draft.
 */
export class EditorRenderer {
  readonly root = new Container();
  readonly world = new Container();
  private readonly sky = new Graphics();
  private readonly border = new Graphics();
  private readonly overlay = new Graphics();
  private terrainLayer: TerrainLayer | null = null;
  private objectLayer: ObjectLayer | null = null;
  private terrain: Terrain | null = null;
  private palette: ThemePalette = PALETTES.glade;
  private level: LevelDef | null = null;
  private preview: EditorPreview = NO_PREVIEW;
  private selected = -1;
  private previewTerrain: TerrainLayer | null = null;

  constructor(level: LevelDef) {
    this.root.addChild(this.world);
    this.setLevel(level);
  }

  /** New draft: re-rasterizes the terrain and rebuilds the object sprites. */
  setLevel(level: LevelDef): void {
    const prev = this.level;
    this.level = level;
    const themeOrSize =
      !prev || prev.theme !== level.theme || prev.w !== level.w || prev.h !== level.h;
    const terrain = buildTerrain(level);
    if (themeOrSize || !this.terrain || !this.terrainLayer) {
      this.palette = PALETTES[level.theme] ?? PALETTES.glade;
      this.terrainLayer?.destroy();
      this.terrain = terrain;
      this.terrainLayer = new TerrainLayer(terrain, this.palette);
      this.drawSky(level);
    } else if (prev.ops !== level.ops) {
      this.terrain.cells.set(terrain.cells);
      this.terrainLayer.invalidateAll();
    }
    if (themeOrSize || !prev || prev.objects !== level.objects || !this.objectLayer) {
      this.objectLayer?.destroy();
      this.objectLayer = new ObjectLayer(level.objects, this.palette);
    }
    this.world.removeChildren();
    this.world.addChild(
      this.sky,
      this.terrainLayer.sprite,
      this.objectLayer.back,
      this.objectLayer.front,
      this.overlay,
      this.border,
    );
    if (this.previewTerrain) this.world.addChildAt(this.previewTerrain.sprite, 2);
    this.drawBorder(level);
  }

  setPreview(preview: EditorPreview | null, selected = -1): void {
    this.preview = preview ?? NO_PREVIEW;
    this.selected = selected;
    this.rebuildPreview();
  }

  private rebuildPreview(): void {
    const level = this.level;
    if (!level) return;
    if (this.previewTerrain) {
      this.previewTerrain.sprite.removeFromParent();
      this.previewTerrain.destroy();
      this.previewTerrain = null;
    }
    if (this.preview.ops.length > 0) {
      // Rasterize only the pending ops onto an empty mask and show it translucent.
      const t = buildTerrain({ ...level, ops: [...this.preview.ops] });
      const layer = new TerrainLayer(t, this.palette);
      layer.sprite.alpha = 0.6;
      this.previewTerrain = layer;
      this.world.addChildAt(layer.sprite, 2);
    }
  }

  applyCamera(cam: CameraState, center: { x: number; y: number }): void {
    this.world.scale.set(cam.scale);
    this.world.position.set(center.x - cam.cx * cam.scale, center.y - cam.cy * cam.scale);
  }

  render(timeMs: number): void {
    this.terrainLayer?.flush();
    this.previewTerrain?.flush();
    this.objectLayer?.update(() => true, timeMs);
    this.drawOverlay();
  }

  private drawOverlay(): void {
    const g = this.overlay;
    const level = this.level;
    g.clear();
    if (!level) return;
    const c = this.preview.corners;
    for (let i = 0; i < c.length; i += 2) {
      g.rect((c[i] as number) - 1, (c[i + 1] as number) - 1, 3, 3).fill(0xfff1a8);
      if (i >= 2) {
        g.moveTo(c[i - 2] as number, c[i - 1] as number)
          .lineTo(c[i] as number, c[i + 1] as number)
          .stroke({ width: 1, color: 0xfff1a8, alpha: 0.8 });
      }
    }
    const o = level.objects[this.selected];
    if (o) {
      const r = objectRect(o);
      g.rect(r.x - 2, r.y - 2, r.w + 4, r.h + 4).stroke({ width: 1, color: 0x6ac8ff });
      if (o.type === 'teleport') {
        g.moveTo(r.x + r.w / 2, r.y + r.h / 2)
          .lineTo(o.tx, o.ty)
          .stroke({ width: 1, color: 0xc89bff, alpha: 0.7 });
      }
    }
  }

  private drawSky(level: LevelDef): void {
    const [top, bottom] = this.palette.sky;
    this.sky.clear();
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const y0 = Math.floor((i * level.h) / bands);
      const y1 = Math.floor(((i + 1) * level.h) / bands);
      const t = i / (bands - 1);
      const mix = (a: number, b: number): number => {
        const ch = (s: number) =>
          Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t) << s;
        return ch(16) | ch(8) | ch(0);
      };
      this.sky.rect(0, y0, level.w, y1 - y0).fill(mix(top, bottom));
    }
  }

  private drawBorder(level: LevelDef): void {
    this.border
      .clear()
      .rect(-1, -1, level.w + 2, level.h + 2)
      .stroke({ width: 1, color: 0xf4f1e8, alpha: 0.35 });
  }

  destroy(): void {
    this.terrainLayer?.destroy();
    this.previewTerrain?.destroy();
    this.objectLayer?.destroy();
    this.root.destroy({ children: true });
  }
}
