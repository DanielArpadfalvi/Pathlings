import { Container, Sprite, Texture } from 'pixi.js';
import type { Sim, SimEvent } from '../core/world';
import type { ThemePalette } from './palette';

/**
 * Cosmetic effects driven by the sim's event stream (§1.11): crater debris, splashes, embers,
 * exit sparkles, plank glints, teleport shimmer, bounce dust, assignment rings and screen shake.
 * Real-time and render-only – nothing here feeds back into the simulation. Randomness uses a
 * local PRNG (effects never need to be reproducible, but tests like stable numbers).
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** World px / s² downwards. */
  gravity: number;
  /** Remaining and total life, ms. */
  life: number;
  maxLife: number;
  color: number;
  size: number;
  /** Fades out over its life (else pops off at the end). */
  fade: boolean;
}

/** Hard cap so a big pop-all never floods the GPU. */
export const MAX_PARTICLES = 600;
/** Screen shake: amplitude (CSS px) and duration (ms) of a Popper crater. */
export const SHAKE_PX = 3;
export const SHAKE_MS = 220;

/** Advances particles by `dtMs`; drops dead ones (in place). */
export function stepParticles(list: Particle[], dtMs: number): void {
  const dt = dtMs / 1000;
  let w = 0;
  for (const p of list) {
    p.life -= dtMs;
    if (p.life <= 0) continue;
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    list[w++] = p;
  }
  list.length = w;
}

/** Small xorshift PRNG for spray directions. */
export class Spray {
  constructor(private s = 0x9e3779b9) {}
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 0x100000000;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
}

export interface BurstSpec {
  count: number;
  colors: readonly number[];
  speed: [number, number];
  /** Direction cone in radians (0 = right, −π/2 = up) and its spread. */
  angle: number;
  spread: number;
  gravity: number;
  life: [number, number];
  size?: [number, number];
  fade?: boolean;
}

export class EffectsLayer {
  /** World-space particles (add above creatures). */
  readonly container = new Container();
  readonly particles: Particle[] = [];
  private readonly sprites: Sprite[] = [];
  private readonly rng = new Spray();
  private shakeLeft = 0;

  constructor(
    private readonly palette: ThemePalette,
    private readonly reducedMotion = false,
  ) {}

  burst(x: number, y: number, spec: BurstSpec): void {
    for (let i = 0; i < spec.count && this.particles.length < MAX_PARTICLES; i++) {
      const a = spec.angle + this.rng.range(-spec.spread, spec.spread);
      const v = this.rng.range(spec.speed[0], spec.speed[1]);
      const life = this.rng.range(spec.life[0], spec.life[1]);
      const size = spec.size ? Math.round(this.rng.range(spec.size[0], spec.size[1])) : 1;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        gravity: spec.gravity,
        life,
        maxLife: life,
        color: spec.colors[Math.floor(this.rng.next() * spec.colors.length)] as number,
        size,
        fade: spec.fade ?? true,
      });
    }
  }

  shake(): void {
    if (!this.reducedMotion) this.shakeLeft = SHAKE_MS;
  }

  /** Current screen-shake offset in CSS px (0 when calm or with reduced motion). */
  get shakeOffset(): { x: number; y: number } {
    if (this.shakeLeft <= 0) return { x: 0, y: 0 };
    const k = this.shakeLeft / SHAKE_MS;
    return { x: this.rng.range(-1, 1) * SHAKE_PX * k, y: this.rng.range(-1, 1) * SHAKE_PX * k };
  }

  clear(): void {
    this.particles.length = 0;
    this.shakeLeft = 0;
  }

  /** Spawns the effects for one tick's events. */
  onEvents(sim: Sim, events: readonly SimEvent[]): void {
    const pal = this.palette;
    const soil = pal.materials[1]?.shades ?? [0x7d5430];
    for (const ev of events) {
      switch (ev.type) {
        case 'died': {
          const x = ev.x + 0.5;
          const y = ev.y - 4;
          if (ev.cause === 'popped') {
            this.burst(x, y, {
              count: 26,
              colors: [...soil, 0xffd34a, 0xff8a2a],
              speed: [30, 110],
              angle: -Math.PI / 2,
              spread: Math.PI,
              gravity: 220,
              life: [350, 800],
              size: [1, 2],
            });
            this.burst(x, y, {
              count: 10,
              colors: [0xfff1a8, 0xffffff],
              speed: [40, 90],
              angle: 0,
              spread: Math.PI,
              gravity: 0,
              life: [120, 260],
            });
            this.shake();
          } else if (ev.cause === 'water') {
            this.burst(x, ev.y, {
              count: 12,
              colors: [pal.water.surface, pal.water.body],
              speed: [25, 60],
              angle: -Math.PI / 2,
              spread: 0.8,
              gravity: 200,
              life: [300, 600],
            });
          } else if (ev.cause === 'lava') {
            this.burst(x, ev.y, {
              count: 14,
              colors: [pal.lava.surface, pal.lava.glow, 0x3a3a44],
              speed: [10, 45],
              angle: -Math.PI / 2,
              spread: 0.6,
              gravity: -20,
              life: [400, 900],
            });
          } else {
            // Fall, trap, out of bounds: a puff of leaves.
            this.burst(x, y, {
              count: 10,
              colors: [0x5cb83a, 0xb6ef6a, 0xf4d6a2],
              speed: [15, 50],
              angle: -Math.PI / 2,
              spread: Math.PI,
              gravity: 80,
              life: [300, 600],
            });
          }
          break;
        }
        case 'saved': {
          const c = sim.creatures[ev.id];
          if (!c) break;
          this.burst(c.x + 0.5, c.y - 6, {
            count: 9,
            colors: [0xfff1a8, 0xffd34a, 0xffffff],
            speed: [20, 55],
            angle: -Math.PI / 2,
            spread: 1.2,
            gravity: 40,
            life: [300, 600],
          });
          break;
        }
        case 'plank': {
          const c = sim.creatures[ev.id];
          if (!c) break;
          this.burst(c.x + 0.5 + c.dir * 3, c.y - 1, {
            count: ev.planksLeft <= 3 ? 5 : 3,
            colors: ev.planksLeft <= 3 ? [0xff8a6a, 0xffffff] : [0xffffff, 0xfff1a8],
            speed: [10, 30],
            angle: -Math.PI / 2,
            spread: 1.4,
            gravity: 30,
            life: [180, 360],
          });
          break;
        }
        case 'teleported': {
          const c = sim.creatures[ev.id];
          if (!c) break;
          this.burst(c.x + 0.5, c.y - 5, {
            count: 10,
            colors: [0xc89bff, 0x7a4ad8, 0xffffff],
            speed: [15, 40],
            angle: 0,
            spread: Math.PI,
            gravity: 0,
            life: [250, 450],
          });
          break;
        }
        case 'bounced': {
          const c = sim.creatures[ev.id];
          if (!c) break;
          this.burst(c.x + 0.5, c.y, {
            count: 6,
            colors: [0x8ff06a, 0xf4f1e8],
            speed: [15, 35],
            angle: Math.PI / 2,
            spread: Math.PI / 2,
            gravity: -10,
            life: [200, 350],
          });
          break;
        }
        case 'skillAssigned': {
          const c = sim.creatures[ev.id];
          if (!c) break;
          this.burst(c.x + 0.5, c.y - 5, {
            count: 8,
            colors: [0xfff1a8],
            speed: [35, 35],
            angle: 0,
            spread: Math.PI,
            gravity: 0,
            life: [160, 160],
          });
          break;
        }
        case 'trapFired': {
          const o = sim.objects[ev.object];
          if (!o) break;
          this.burst(o.x + 5, o.y + 4, {
            count: 8,
            colors: [0xe0473a, 0xb8c2cf],
            speed: [20, 50],
            angle: -Math.PI / 2,
            spread: Math.PI / 2,
            gravity: 150,
            life: [200, 400],
          });
          break;
        }
        case 'rewound':
          this.clear();
          break;
        default:
          break;
      }
    }
  }

  /** Advances particles and syncs the sprite pool. */
  update(dtMs: number): void {
    stepParticles(this.particles, dtMs);
    this.shakeLeft = Math.max(0, this.shakeLeft - dtMs);
    const n = this.particles.length;
    for (let i = 0; i < n; i++) {
      let s = this.sprites[i];
      if (!s) {
        s = new Sprite(Texture.WHITE);
        this.sprites.push(s);
        this.container.addChild(s);
      }
      const p = this.particles[i] as Particle;
      s.visible = true;
      s.tint = p.color;
      s.width = p.size;
      s.height = p.size;
      s.position.set(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2));
      s.alpha = p.fade ? Math.min(1, (p.life / p.maxLife) * 1.5) : 1;
    }
    for (let i = n; i < this.sprites.length; i++) (this.sprites[i] as Sprite).visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
