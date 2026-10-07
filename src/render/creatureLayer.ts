import { Container, Graphics, Sprite } from 'pixi.js';
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
  MARKER_KEY,
  SCALER_BADGE,
  TARGET_ARROW,
  TARGET_ARROW_INVALID,
} from './creatureArt';
import type { PositionHistory } from './interp';
import type { PixelGrid } from './pixelArt';
import { creatureAlpha, creaturePose } from './pose';
import { gridAnchor, gridTexture } from './textures';

/** Badges / countdown sit this many px above the foot point (just over the leaf cap). */
const MARK_HEIGHT = 13;
/** Fuse ticks left when the Popper starts to tremble. */
export const POPPER_SHAKE_TICKS = 90;

/** The creature the finger currently points at (§1.7 pre-highlight). */
export interface Highlight {
  id: number;
  /** It can take the selected skill (yellow) or not (red). */
  valid: boolean;
}

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
  private readonly outline = new Graphics();
  private readonly arrow = new Sprite();
  /** Creatures drawn in the latest frame. */
  drawn = 0;

  constructor(
    private readonly reducedMotion = false,
    private readonly palette: Record<string, number> = CREATURE_KEY,
  ) {
    const bodyLayer = new Container();
    const markLayer = new Container();
    this.container.addChild(this.outline, bodyLayer, markLayer, this.arrow);
    this.arrow.visible = false;
    this.bodies = new SpritePool(bodyLayer);
    this.marks = new SpritePool(markLayer);
  }

  update(
    sim: Sim,
    history: PositionHistory,
    alpha: number,
    highlight: Highlight | null = null,
  ): void {
    this.bodies.begin();
    this.marks.begin();
    const tick = sim.tick;
    for (const c of sim.creatures) {
      const pf = creaturePose(c, tick);
      if (!pf) continue;
      const frames = CREATURE_FRAMES[pf.pose];
      const grid = frames[pf.frame % frames.length] as PixelGrid;
      const p = history.position(c, alpha);
      const s = this.bodies.take(grid, this.palette);
      s.position.set(p.x + 0.5 + this.jitter(c, tick), p.y);
      s.scale.x = c.dir < 0 ? -1 : 1;
      s.alpha = creatureAlpha(c);
      this.drawMarks(c, p.x + 0.5, p.y - MARK_HEIGHT);
      if (highlight && highlight.id === c.id) this.drawHighlight(highlight, p.x, p.y, tick);
    }
    if (!highlight || !creatureShown(sim, highlight.id)) {
      this.outline.clear();
      this.arrow.visible = false;
    }
    this.drawn = this.bodies.end();
    this.marks.end();
  }

  /** A Popper trembles during its last second and a half (§1.11), unless motion is reduced. */
  private jitter(c: Creature, tick: number): number {
    if (this.reducedMotion || c.popTimer <= 0 || c.popTimer > POPPER_SHAKE_TICKS) return 0;
    return (tick >> 1) & 1 ? 0.5 : -0.5;
  }

  private drawHighlight(h: Highlight, x: number, y: number, tick: number): void {
    const color = h.valid ? 0xfff1a8 : 0xff6a5a;
    this.outline.clear();
    // 1-px frame around the body (7 × 11 sprite box), drawn as four thin rects.
    const x0 = x - 4;
    const y0 = y - 12;
    this.outline
      .rect(x0, y0, 9, 1)
      .rect(x0, y + 1, 9, 1)
      .rect(x0, y0, 1, 14)
      .rect(x0 + 8, y0, 1, 14)
      .fill({ color, alpha: 0.9 });
    const art = h.valid ? TARGET_ARROW : TARGET_ARROW_INVALID;
    this.arrow.texture = gridTexture(art, MARKER_KEY);
    const a = gridAnchor(art);
    this.arrow.anchor.set(a.x, a.y);
    // A gentle 1-px bob so the marker reads as "this one" even in a crowd.
    this.arrow.position.set(x + 0.5, y0 - 2 - (Math.floor(tick / 15) & 1));
    this.arrow.visible = true;
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

function creatureShown(sim: Sim, id: number): boolean {
  const c = sim.creatures[id];
  return c !== undefined && creaturePose(c, sim.tick) !== null;
}
