import { describe, expect, it } from 'vitest';
import { isLive, packCreatures } from '../../../src/core/creature';
import { stateHash } from '../../../src/core/sim';
import type { Sim } from '../../../src/core/world';
import { GameSession } from '../../../src/game/session';
import { clockwork, digDown, showcase, tunnel } from '../../../src/levels/test';
import { WorldRenderer } from '../../../src/render/worldRenderer';

/** Everything about the sim a renderer could conceivably touch, as a comparable snapshot. */
function snapshot(sim: Sim): unknown {
  return {
    hash: stateHash(sim),
    tick: sim.tick,
    cells: Array.from(sim.terrain.cells),
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
      r.layout(390, 844);
      let frames = 0;
      while (!drawn.sim.ended) {
        drawn.frame(1000 / 60);
        const before = snapshot(drawn.sim);
        r.render(drawn.alpha, frames * 16);
        r.render(0.5, frames * 16 + 8);
        expect(snapshot(drawn.sim)).toEqual(before);
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

  it('fits the level into the viewport, centred', () => {
    const s = new GameSession(tunnel);
    const r = new WorldRenderer(s.sim);
    r.layout(390, 844);
    const scale = 390 / tunnel.w;
    expect(r.world.scale.x).toBeCloseTo(scale);
    expect(r.world.position.x).toBe(0);
    expect(r.world.position.y).toBe(Math.round((844 - tunnel.h * scale) / 2));
    r.destroy();
  });
});
