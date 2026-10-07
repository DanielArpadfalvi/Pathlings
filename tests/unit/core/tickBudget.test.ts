import { describe, expect, it } from 'vitest';
import { createSim, liveCount, step } from '../../../src/core/sim';
import { perf } from '../../../src/levels/test';

/**
 * T3.4: the core tick must average < 0.5 ms with 100 creatures on a 640 × 960 level (4× speed
 * runs 4 ticks per frame, so this leaves most of the 16.7 ms frame to rendering). Timing is
 * skipped under coverage instrumentation.
 */
describe('core tick budget', () => {
  it('100 creatures on 640 × 960: average tick < 0.5 ms', () => {
    const sim = createSim(perf);
    // Release everyone first (not timed), then time 6 000 ticks of the full crowd.
    while (sim.spawned < 100) step(sim);
    for (let i = 0; i < 300; i++) step(sim);
    expect(liveCount(sim)).toBe(100);
    const n = 6000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) step(sim);
    const avg = (performance.now() - t0) / n;
    expect(liveCount(sim)).toBe(100);
    if (process.env.PATHLINGS_COVERAGE !== '1') expect(avg).toBeLessThan(0.5);
  });
});
