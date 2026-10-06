import { Container, Graphics, type Renderer, RenderTexture, Sprite } from 'pixi.js';
import type { CameraState } from './camera';

/** Gap between the finger and the bottom edge of the loupe (pt). */
const LOUPE_GAP = 18;

export interface LoupeView {
  /** Screen point under the finger that is magnified. */
  at: { x: number; y: number };
  zoom: number;
  radius: number;
}

/**
 * Round magnifier (§1.7 point 3): re-renders the world around the finger at `zoom` × the camera
 * scale into a texture and shows it in a circle above the finger, so the finger does not hide
 * the crowd. Screen-space; add `container` above the world.
 */
export class Loupe {
  readonly container = new Container();
  private readonly sprite = new Sprite();
  private readonly mask = new Graphics();
  private readonly ring = new Graphics();
  private texture: RenderTexture | null = null;
  private radius = 0;

  constructor() {
    this.sprite.mask = this.mask;
    this.container.addChild(this.sprite, this.mask, this.ring);
    this.container.visible = false;
  }

  update(
    renderer: Renderer,
    world: Container,
    cam: CameraState,
    viewport: { w: number; h: number },
    view: LoupeView | null,
  ): void {
    if (!view) {
      this.container.visible = false;
      return;
    }
    const r = view.radius;
    const size = Math.ceil(r * 2);
    if (!this.texture || this.radius !== r) {
      this.texture?.destroy(true);
      this.texture = RenderTexture.create({
        width: size,
        height: size,
        resolution: renderer.resolution,
        scaleMode: 'nearest',
      });
      this.sprite.texture = this.texture;
      this.radius = r;
      this.mask.clear().circle(r, r, r).fill(0xffffff);
      this.ring
        .clear()
        .circle(r, r, r)
        .stroke({ width: 3, color: 0xf4f1e8, alpha: 0.9 })
        .circle(r, r, r + 2)
        .stroke({ width: 1.5, color: 0x0b1020, alpha: 0.8 });
    }

    // World point under the finger, shown in the middle of the loupe.
    const wx = cam.cx + (view.at.x - viewport.w / 2) / cam.scale;
    const wy = cam.cy + (view.at.y - viewport.h / 2) / cam.scale;
    const scale = cam.scale * view.zoom;
    const saved = { x: world.position.x, y: world.position.y, s: world.scale.x };
    world.scale.set(scale);
    world.position.set(r - wx * scale, r - wy * scale);
    renderer.render({ container: world, target: this.texture, clear: true, clearColor: 0x0b1020 });
    world.scale.set(saved.s);
    world.position.set(saved.x, saved.y);

    // Above the finger; flipped below it near the top edge so it stays on screen.
    let top = view.at.y - LOUPE_GAP - size;
    if (top < 4) top = view.at.y + LOUPE_GAP;
    const left = Math.max(4, Math.min(viewport.w - size - 4, view.at.x - r));
    this.container.position.set(left, top);
    this.container.visible = true;
  }

  destroy(): void {
    this.texture?.destroy(true);
    this.container.destroy({ children: true });
  }
}
