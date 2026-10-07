import { describe, expect, it } from 'vitest';
import { createSim } from '../../../src/core/sim';
import type { SimEvent } from '../../../src/core/world';
import { GameSession } from '../../../src/game/session';
import { cliff, crowd } from '../../../src/levels/test';
import {
  EffectsLayer,
  MAX_PARTICLES,
  type Particle,
  SHAKE_MS,
  Spray,
  stepParticles,
} from '../../../src/render/effects';
import { PALETTES } from '../../../src/render/palette';
import { WorldRenderer } from '../../../src/render/worldRenderer';

function particle(over: Partial<Particle> = {}): Particle {
  return {
    x: 0,
    y: 0,
    vx: 10,
    vy: 0,
    gravity: 100,
    life: 1000,
    maxLife: 1000,
    color: 0xffffff,
    size: 1,
    fade: true,
    ...over,
  };
}

const popped = (x: number, y: number): SimEvent => ({
  type: 'died',
  tick: 1,
  id: 0,
  cause: 'popped',
  x,
  y,
});

describe('particles', () => {
  it('move with velocity and gravity, and expire', () => {
    const list = [particle(), particle({ life: 50 })];
    stepParticles(list, 100);
    expect(list).toHaveLength(1);
    expect(list[0]!.x).toBeCloseTo(1);
    expect(list[0]!.vy).toBeCloseTo(10);
    expect(list[0]!.y).toBeCloseTo(1);
  });

  it('the spray PRNG stays in [0, 1) and is stable', () => {
    const a = new Spray(42);
    const b = new Spray(42);
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(b.next()).toBe(v);
    }
  });
});

describe('EffectsLayer', () => {
  const sim = createSim(crowd);

  it('a Popper crater sprays debris and shakes the screen', () => {
    const fx = new EffectsLayer(PALETTES.glade);
    fx.onEvents(sim, [popped(50, 100)]);
    expect(fx.particles.length).toBeGreaterThan(20);
    const s = fx.shakeOffset;
    expect(Math.abs(s.x) + Math.abs(s.y)).toBeGreaterThan(0);
    fx.update(SHAKE_MS + 1);
    expect(fx.shakeOffset).toEqual({ x: 0, y: 0 });
    fx.update(5000);
    expect(fx.particles).toHaveLength(0);
  });

  it('reduced motion keeps the particles but never shakes', () => {
    const fx = new EffectsLayer(PALETTES.glade, true);
    fx.onEvents(sim, [popped(50, 100)]);
    expect(fx.particles.length).toBeGreaterThan(0);
    expect(fx.shakeOffset).toEqual({ x: 0, y: 0 });
  });

  it('caps the particle count (pop all with 100 creatures)', () => {
    const fx = new EffectsLayer(PALETTES.glade);
    fx.onEvents(
      sim,
      Array.from({ length: 100 }, (_, i) => popped(i, 100)),
    );
    expect(fx.particles.length).toBe(MAX_PARTICLES);
  });

  it('every death cause, save, plank, teleport, bounce, trap and assignment has an effect', () => {
    const s = createSim(crowd);
    const fx = new EffectsLayer(PALETTES.deep);
    const g = new GameSession(crowd);
    g.seek(200);
    const c = g.sim.creatures[0]!;
    s.creatures.push(c);
    const evs: SimEvent[] = [
      { type: 'died', tick: 1, id: 0, cause: 'water', x: 10, y: 10 },
      { type: 'died', tick: 1, id: 0, cause: 'lava', x: 10, y: 10 },
      { type: 'died', tick: 1, id: 0, cause: 'fall', x: 10, y: 10 },
      { type: 'saved', tick: 1, id: 0 },
      { type: 'plank', tick: 1, id: 0, planksLeft: 2 },
      { type: 'teleported', tick: 1, id: 0, object: 0 },
      { type: 'bounced', tick: 1, id: 0, object: 0 },
      { type: 'skillAssigned', tick: 1, id: 0, skill: 'warden' },
      { type: 'trapFired', tick: 1, id: 0, object: 0 },
    ];
    for (const ev of evs) {
      const before = fx.particles.length;
      fx.onEvents(s, [ev]);
      expect(fx.particles.length, ev.type).toBeGreaterThan(before);
    }
    fx.onEvents(s, [{ type: 'rewound', tick: 1 }]);
    expect(fx.particles).toHaveLength(0);
  });

  it('the cliff solution (pop all) produces craters in the renderer without touching the sim', () => {
    const session = new GameSession(cliff, { autoplay: cliff.solution });
    const r = new WorldRenderer(session.sim);
    session.onStep((sm, events) => r.onStep(sm, events));
    let peak = 0;
    let t = 0;
    while (!session.sim.ended) {
      session.frame(1000 / 60);
      t += 1000 / 60;
      r.render(session.alpha, t);
      peak = Math.max(peak, r.stats.particles);
    }
    expect(peak).toBeGreaterThan(20);
    r.destroy();
  });
});
