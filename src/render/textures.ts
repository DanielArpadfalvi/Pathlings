import { BufferImageSource, Texture } from 'pixi.js';
import type { ColorKey, PixelGrid } from './pixelArt';
import { gridSize, gridToRgba } from './pixelArt';

const caches = new Map<ColorKey, Map<PixelGrid, Texture>>();

/** GPU texture of a pixel grid (cached per grid and palette object; nearest-neighbour sampling). */
export function gridTexture(grid: PixelGrid, key: ColorKey): Texture {
  let cache = caches.get(key);
  if (!cache) {
    cache = new Map();
    caches.set(key, cache);
  }
  let tex = cache.get(grid);
  if (!tex) {
    const { w, h } = gridSize(grid);
    const source = new BufferImageSource({
      resource: gridToRgba(grid, key),
      width: w,
      height: h,
      format: 'rgba8unorm',
      scaleMode: 'nearest',
    });
    tex = new Texture({ source });
    cache.set(grid, tex);
  }
  return tex;
}

/** Sprite anchor that puts the grid's anchor column centre and bottom edge on the position. */
export function gridAnchor(grid: PixelGrid): { x: number; y: number } {
  const { w } = gridSize(grid);
  return { x: (grid.ox + 0.5) / w, y: 1 };
}
