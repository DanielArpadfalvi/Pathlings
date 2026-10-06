import { describe, expect, it } from 'vitest';
import { isLive, packCreatures } from '../../../src/core/creature';
import { stateHash } from '../../../src/core/sim';
import type { Sim } from '../../../src/core/world';
import { GameSession } from '../../../src/game/session';
import { clockwork, digDown, showcase, tunnel } from '../../../src/levels/test';
import { WorldRenderer } from '../../../src/render/worldRenderer';

/** Everything about the sim a renderer could conceivably touch, as a comparable snapshot. */
function snapshot(sim: Sim, withCells: boolean): unknown {
  return {
    hash: stateHash(sim), // covers the terrain cells too
    tick: sim.tick,
    cells: withCells ? Array.from(sim.terrain.cells) : null,
    creatures: Array.from(packCreatures(sim.creatures)),
    events: sim.events.length,
    dirty: sim.dirty,
    trapReadyAt: [...sim.trapReadyAt],
    skills: { ...sim.skills },
  };
}

describe('WorldRenderer (headless Pixi scene graph)', () => {
  for (const level of [tunnel, digDown, clockwork]) {
    it(`${level.id}: rendering every frame leaves the sim exactly as a headless run`, () => {
      const plain = new GameSession(level, { autoplay: level.solution });
      plain.seek(Infinity);

      const drawn = new GameSession(level, { autoplay: level.solution });
      const r = new WorldRenderer(drawn.sim);
      drawn.onStep((sim, events) => r.onStep(sim, events));
      r.applyCamera({ cx: 80, cy: 120, scale: 2 }, { w: 390, h: 844 });
      let frames = 0;
      while (!drawn.sim.ended) {
        drawn.frame(1000 / 60);
        const full = frames % 60 === 0;
        const before = snapshot(drawn.sim, full);
        r.render(drawn.alpha, frames * 16);
        r.render(0.5, frames * 16 + 8);
        expect(snapshot(drawn.sim, full)).toEqual(before);
        frames++;
      }
      expect(stateHash(drawn.sim)).toBe(stateHash(plain.sim));
      expect(stateHash(drawn.sim)).toBe(level.solution!.finalHash);
      r.destroy();
    });
  }

  it('uploads the terrain at most once per frame and only the dirty rows', () => {
    const s = new GameSession(tunnel, { autoplay: tunnel.solution });
    const r = new WorldRenderer(s.sim);
    s.onStep((sim, events) => r.onStep(sim, events));
    r.render(1, 0);
    expect(r.stats.terrainUploads).toBe(0); // the initial paint is part of texture creation
    let uploads = 0;
    let maxTexels = 0;
    for (let f = 0; f < 900 && !s.sim.ended; f++) {
      s.frame(1000 / 30); // two ticks per frame
      const before = r.stats.terrainUploads;
      r.render(s.alpha, f * 33);
      const after = r.stats.terrainUploads;
      expect(after - before).toBeLessThanOrEqual(1);
      uploads += after - before;
      maxTexels = Math.max(maxTexels, r.stats.lastUploadTexels);
    }
    expect(uploads).toBeGreaterThan(0); // the Burrower dug
    // A tunnel step touches ~11 rows (9-px tunnel + edge lighting), never the whole texture.
    expect(maxTexels).toBeLessThan((s.sim.width * s.sim.height) / 4);
    r.destroy();
  });

  it('draws one sprite per live creature', () => {
    const s = new GameSession(showcase);
    const r = new WorldRenderer(s.sim);
    s.onStep((sim, events) => r.onStep(sim, events));
    s.seek(300);
    r.render(1, 0);
    const live = s.sim.creatures.filter(isLive).length;
    expect(live).toBeGreaterThan(0);
    expect(r.stats.creaturesDrawn).toBe(live);
    r.destroy();
  });

  it('applies a camera view to the world container', () => {
    const s = new GameSession(tunnel);
    const r = new WorldRenderer(s.sim);
    r.applyCamera({ cx: 50, cy: 100, scale: 2.5 }, { w: 390, h: 844 });
    expect(r.world.scale.x).toBe(2.5);
    // World point (50, 100) lands in the middle of the viewport.
    expect(r.world.position.x + 50 * 2.5).toBeCloseTo(195);
    expect(r.world.position.y + 100 * 2.5).toBeCloseTo(422);
    r.destroy();
  });
});
