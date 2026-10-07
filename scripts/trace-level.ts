/**
 * Debug aid for level authoring: replays a built-in level's plan and prints deaths (cause,
 * place, tick), the plan steps as they fire, and the track of chosen creatures.
 * Run: `npx tsx scripts/trace-level.ts w1-09 [creatureId…]`.
 */
import { STATE_NAMES } from '../src/core/creature';
import { assign, canAssign, createSim, drainEvents, popAll, setReleaseInterval, step } from '../src/core/sim';
import type { PlanStep } from '../src/levels/plan';
import { findLevelFiles } from './levelFiles';

const [id, ...watch] = process.argv.slice(2);
const file = findLevelFiles().find((f) => f.data.id === id);
if (!file) throw new Error(`no level ${id}`);
const level = { ...file.data };
const plan: PlanStep[] = level.plan ?? [];
delete level.plan;
delete level.solution;
const ids = watch.length ? watch.map(Number) : [0];
const sim = createSim(level, { keyframes: false });
let next = 0;
const track = new Map<number, string>();
while (!sim.ended) {
  for (let s = plan[next]; s; s = plan[next]) {
    const w = s.when ?? {};
    if (w.tick !== undefined && sim.tick < w.tick) break;
    if ('assign' in s) {
      const c = sim.creatures[s.creature];
      const cw = s.when ?? {};
      if (!c) break;
      if (cw.xGte !== undefined && c.x < cw.xGte) break;
      if (cw.xLte !== undefined && c.x > cw.xLte) break;
      if (cw.yGte !== undefined && c.y < cw.yGte) break;
      if (cw.yLte !== undefined && c.y > cw.yLte) break;
      if (cw.state !== undefined && STATE_NAMES[c.state] !== cw.state) break;
      if (!canAssign(sim, s.creature, s.assign)) break;
      assign(sim, s.creature, s.assign);
      console.log(`t${sim.tick} step ${next}: ${s.assign} → #${s.creature} at (${c.x},${c.y})`);
    } else if ('popAll' in s) {
      popAll(sim);
      console.log(`t${sim.tick} step ${next}: pop all`);
    } else setReleaseInterval(sim, s.release);
    next++;
  }
  step(sim);
  for (const ev of drainEvents(sim)) {
    if (ev.type === 'died') console.log(`t${ev.tick} #${ev.id} died (${ev.cause}) at (${ev.x},${ev.y})`);
  }
  if (sim.tick % 60 === 0) {
    for (const cid of ids) {
      const c = sim.creatures[cid];
      if (!c) continue;
      const line = `(${c.x},${c.y}) ${STATE_NAMES[c.state]} d${c.dir}`;
      if (track.get(cid) !== line) console.log(`t${sim.tick} #${cid} ${line}`);
      track.set(cid, line);
    }
  }
}
console.log(`end t${sim.tick}: saved ${sim.saved}/${level.creatures}, dead ${sim.dead}, unfired from step ${next}`);
