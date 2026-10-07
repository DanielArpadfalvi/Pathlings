import { Container, Graphics, Sprite } from 'pixi.js';
import type { LevelObject } from '../core/level';
import { objectRect } from '../core/level';
import { trapArmed } from '../core/objects';
import type { Sim } from '../core/world';
import type { PixelGrid } from './pixelArt';
import type { ThemePalette } from './palette';
import {
  BOUNCE_ART,
  ENTRANCE_ART,
  EXIT_ART,
  OBJECT_KEY,
  TELEPORT_ART,
  TELEPORT_TARGET_ART,
  TRAP_ART,
  TRAP_RELOADING_ART,
} from './objectArt';
import { gridTexture } from './textures';

const EXIT_FLASH_MS = 350;

function artFor(o: LevelObject): PixelGrid | null {
  switch (o.type) {
    case 'entrance':
      return ENTRANCE_ART;
    case 'exit':
      return EXIT_ART;
    case 'trap':
      return TRAP_ART;
    case 'teleport':
      return TELEPORT_ART;
    case 'bounce':
      return BOUNCE_ART;
    default:
      return null; // water / lava: Graphics
  }
}

/**
 * Level objects: fixed-size ones as pixel sprites on their zones, water and lava as animated
 * Graphics in front of the terrain. Reads the sim (trap reload state), never writes it.
 */
export class ObjectLayer {
  /** Behind the creatures: hatches, exits, traps, portals, pads. */
  readonly back = new Container();
  /** In front of the creatures: liquids (creatures sink into them). */
  readonly front = new Container();
  private readonly liquids = new Graphics();
  /** Additive lava heat haze. */
  private readonly glow = new Graphics();
  private readonly traps: { index: number; sprite: Sprite }[] = [];
  /** Exit object index → time (ms) its "pop-in" flash started. */
  private readonly exitFlash = new Map<number, number>();
  private lastTime = 0;

  constructor(
    private readonly objects: readonly LevelObject[],
    private readonly palette: ThemePalette,
  ) {
    this.glow.blendMode = 'add';
    this.front.addChild(this.liquids, this.glow);
    objects.forEach((o, index) => {
      const art = artFor(o);
      if (!art) return;
      const r = objectRect(o);
      const sprite = new Sprite(gridTexture(art, OBJECT_KEY));
      sprite.position.set(r.x, r.y);
      this.back.addChild(sprite);
      if (o.type === 'trap') this.traps.push({ index, sprite });
      if (o.type === 'teleport') {
        const target = new Sprite(gridTexture(TELEPORT_TARGET_ART, OBJECT_KEY));
        target.position.set(o.tx - TELEPORT_TARGET_ART.ox, o.ty - 14);
        target.alpha = 0.8;
        this.back.addChild(target);
      }
    });
  }

  /** A creature hopped into exit object `index`: flash its doorway. */
  flashExit(index: number): void {
    this.exitFlash.set(index, this.lastTime);
  }

  /** Per-frame update; `timeMs` drives purely cosmetic motion (liquid ripples, lava glow). */
  update(sim: Sim, timeMs: number): void {
    for (const t of this.traps) {
      t.sprite.texture = gridTexture(
        trapArmed(sim, t.index) ? TRAP_ART : TRAP_RELOADING_ART,
        OBJECT_KEY,
      );
    }
    this.lastTime = timeMs;
    this.drawLiquids(timeMs);
    this.drawExitFlashes(timeMs);
  }

  private drawLiquids(timeMs: number): void {
    const g = this.liquids;
    g.clear();
    this.glow.clear();
    const phase = Math.floor(timeMs / 120);
    for (const o of this.objects) {
      if (o.type !== 'water' && o.type !== 'lava') continue;
      const water = o.type === 'water';
      const body = water ? this.palette.water.body : this.palette.lava.body;
      const surface = water ? this.palette.water.surface : this.palette.lava.surface;
      const deep = water ? this.palette.water.deep : this.palette.lava.glow;
      g.rect(o.x, o.y, o.w, o.h).fill({ color: body, alpha: water ? 0.82 : 1 });
      if (o.h > 3) g.rect(o.x, o.y + o.h - 2, o.w, 2).fill({ color: deep, alpha: 0.9 });
      // Ripples: a 1-px surface line with gaps that drift sideways.
      for (let x = 0; x < o.w; x++) {
        if ((x + phase) % 7 < 5) g.rect(o.x + x, o.y, 1, 1).fill(surface);
      }
      if (!water) {
        // Bubbles popping on the surface: a few bright pixels that hop around every 180 ms.
        const slot = Math.floor(timeMs / 180);
        for (let x = 1; x < o.w - 1; x++) {
          const h = Math.imul(x * 374761393 + slot * 668265263, 0x27d4eb2d) >>> 27;
          if (h === 0) g.rect(o.x + x, o.y - 1, 1, 1).fill(surface);
          else if (h === 1 && o.h > 3) g.rect(o.x + x, o.y + 1, 1, 1).fill(0xfff1a8);
        }
        // One additive row of heat haze; fainter rows read as a muddy shadow on dark skies.
        const pulse = 0.45 + 0.15 * Math.sin(timeMs / 400);
        this.glow.rect(o.x, o.y - 1, o.w, 1).fill({ color: this.palette.lava.glow, alpha: pulse });
      }
    }
  }

  private drawExitFlashes(timeMs: number): void {
    for (const [index, start] of this.exitFlash) {
      const o = this.objects[index];
      const k = 1 - (timeMs - start) / EXIT_FLASH_MS;
      if (!o || k <= 0) {
        this.exitFlash.delete(index);
        continue;
      }
      // Additive warm light in the doorway (columns 3–8, rows 5–10 of EXIT_ART).
      this.glow.rect(o.x + 3, o.y + 5, 6, 6).fill({ color: 0xffd34a, alpha: 0.8 * k });
      this.glow.rect(o.x + 2, o.y + 3, 8, 2).fill({ color: 0xfff1a8, alpha: 0.4 * k });
    }
  }

  destroy(): void {
    this.back.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}
