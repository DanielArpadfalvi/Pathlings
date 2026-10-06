import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import type { Rect, Terrain } from '../core/terrain';
import { unionRect } from '../core/terrain';
import type { ThemePalette } from './palette';
import { growRect, paintTerrain } from './terrainPaint';

/**
 * The terrain as one texture (1 cell = 1 texel). Terrain changes are collected as dirty rects
 * during the frame; `flush` repaints their union (grown by one cell for the edge lighting) and
 * uploads only the touched rows – at most one GPU upload per frame.
 */
export class TerrainLayer {
  readonly sprite: Sprite;
  /** GPU uploads done so far (diagnostics / tests). */
  uploads = 0;
  /** Texels uploaded by the latest flush (0 when nothing changed). */
  lastUploadTexels = 0;
  private readonly pixels: Uint8Array;
  private readonly source: BufferImageSource;
  private pending: Rect | null = null;

  constructor(
    private readonly terrain: Terrain,
    private readonly palette: ThemePalette,
  ) {
    const { width, height } = terrain;
    this.pixels = new Uint8Array(width * height * 4);
    paintTerrain(terrain, palette, this.pixels, { x: 0, y: 0, w: width, h: height });
    this.source = new BufferImageSource({
      resource: this.pixels,
      width,
      height,
      format: 'rgba8unorm',
      scaleMode: 'nearest',
    });
    this.sprite = new Sprite(new Texture({ source: this.source }));
  }

  invalidate(rect: Rect): void {
    this.pending = unionRect(this.pending, rect);
  }

  invalidateAll(): void {
    this.pending = { x: 0, y: 0, w: this.terrain.width, h: this.terrain.height };
  }

  /** Repaints and uploads the pending area. Returns whether an upload happened. */
  flush(): boolean {
    this.lastUploadTexels = 0;
    if (!this.pending) return false;
    const { width, height } = this.terrain;
    const r = growRect(this.pending, 1, width, height);
    this.pending = null;
    if (!r) return false;
    paintTerrain(this.terrain, this.palette, this.pixels, r);
    const start = r.y * width;
    const end = (r.y + r.h) * width;
    this.source.update(start, end);
    this.uploads++;
    this.lastUploadTexels = end - start;
    return true;
  }

  destroy(): void {
    this.sprite.destroy({ texture: true, textureSource: true });
  }
}
