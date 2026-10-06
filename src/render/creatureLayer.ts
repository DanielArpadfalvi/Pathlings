import { Container, Sprite } from 'pixi.js';
import type { Creature } from '../core/creature';
import { PERM_GLIDER, PERM_SCALER, hasPerm } from '../core/creature';
import { fuseSeconds } from '../core/skills/popper';
import type { Sim } from '../core/world';
import {
  BADGE_KEY,
  CREATURE_FRAMES,
  CREATURE_KEY,
  DIGITS,
  DIGIT_KEY,
  GLIDER_BADGE,
  SCALER_BADGE,
} from './creatureArt';
import type { PositionHistory } from './interp';
import type { PixelGrid } from './pixelArt';
import { creatureAlpha, creaturePose } from './pose';
import { gridAnchor, gridTexture } from './textures';

/** Badges / countdown sit this many px above the foot point (just over the leaf cap). */
const MARK_HEIGHT = 13;

/** A growable pool of sprites; `begin` + `take` per frame, `end` hides the unused rest. */
class SpritePool {
  private used = 0;
  private readonly sprites: Sprite[] = [];
  constructor(private readonly parent: Container) {}

  begin(): void {
    this.used = 0;
  }

  take(grid: PixelGrid, key: Record<string, number>): Sprite {
    let s = this.sprites[this.used];
    if (!s) {
      s = new Sprite();
      this.sprites.push(s);
      this.parent.addChild(s);
    }
    this.used++;
    s.texture = gridTexture(grid, key);
    const a = gridAnchor(grid);
    s.anchor.set(a.x, a.y);
    s.visible = true;
    s.alpha = 1;
    s.scale.set(1, 1);
    return s;
  }

  end(): number {
    for (let i = this.used; i < this.sprites.length; i++)
      (this.sprites[i] as Sprite).visible = false;
    return this.used;
  }
}

/** Draws every live creature at its interpolated position, plus skill badges and countdowns. */
export class CreatureLayer {
  readonly container = new Container();
  private readonly bodies: SpritePool;
  private readonly marks: SpritePool;
  /** Creatures drawn in the latest frame. */
  drawn = 0;

  constructor() {
    const bodyLayer = new Container();
    const markLayer = new Container();
    this.container.addChild(bodyLayer, markLayer);
    this.bodies = new SpritePool(bodyLayer);
    this.marks = new SpritePool(markLayer);
  }

  update(sim: Sim, history: PositionHistory, alpha: number): void {
    this.bodies.begin();
    this.marks.begin();
    const tick = sim.tick;
    for (const c of sim.creatures) {
      const pf = creaturePose(c, tick);
      if (!pf) continue;
      const frames = CREATURE_FRAMES[pf.pose];
      const grid = frames[pf.frame % frames.length] as PixelGrid;
      const p = history.position(c, alpha);
      const s = this.bodies.take(grid, CREATURE_KEY);
      s.position.set(p.x + 0.5, p.y);
      s.scale.x = c.dir < 0 ? -1 : 1;
      s.alpha = creatureAlpha(c);
      this.drawMarks(c, p.x + 0.5, p.y - MARK_HEIGHT);
    }
    this.drawn = this.bodies.end();
    this.marks.end();
  }

  private drawMarks(c: Creature, x: number, y: number): void {
    const secs = fuseSeconds(c);
    if (secs > 0) {
      this.marks.take(DIGITS[Math.min(9, secs)] as PixelGrid, DIGIT_KEY).position.set(x, y);
      return;
    }
    const badges: PixelGrid[] = [];
    if (hasPerm(c, PERM_SCALER)) badges.push(SCALER_BADGE);
    if (hasPerm(c, PERM_GLIDER)) badges.push(GLIDER_BADGE);
    badges.forEach((b, i) => {
      const dx = badges.length === 2 ? (i === 0 ? -2 : 2) : 0;
      this.marks.take(b, BADGE_KEY).position.set(x + dx, y);
    });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
