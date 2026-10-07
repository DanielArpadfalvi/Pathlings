/**
 * Level authoring tool (T5.1): compiles each level's `plan` into its exact reference solution
 * (input log + final hash) and writes it back. Run after editing a level or its plan:
 * `npm run levels:solve [id…]`. Prints the result per level (saved, assignments, stars).
 */
import { compilePlan } from '../src/levels/plan';
import { rateRun } from '../src/core/stars';
import { findLevelFiles, writeLevelFile } from './levelFiles';

const only = new Set(process.argv.slice(2));
let broken = 0;
for (const f of findLevelFiles()) {
  if (only.size > 0 && !only.has(f.data.id)) continue;
  if (!f.data.plan) {
    console.log(`- ${f.data.id}: no plan (solution kept)`);
    continue;
  }
  const level = { ...f.data };
  delete level.plan;
  delete level.solution;
  const r = compilePlan(level, f.data.plan);
  const stars = rateRun(
    level,
    r.saved,
    r.solution.log.filter((c) => c.kind === 'assign').length,
  ).count;
  const ok = r.won && r.unfired.length === 0;
  if (!ok) broken++;
  console.log(
    `${ok ? '✓' : '✗'} ${f.data.id}: saved ${r.saved}/${level.creatures} (need ${level.required}), ` +
      `${r.solution.log.length} cmd, ${stars}★, ${r.ticks} ticks` +
      (r.unfired.length ? `, unfired steps ${r.unfired.join(',')}` : ''),
  );
  writeLevelFile(f.path, { ...f.data, solution: r.solution });
}
process.exit(broken > 0 ? 1 : 0);
