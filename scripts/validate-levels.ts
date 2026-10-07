/**
 * CI gate for the built-in levels (T5.1): replays every reference solution and checks the rules
 * in `src/levels/validate.ts`. Exit code 1 on any problem. Run: `npm run validate-levels`.
 */
import { DICTIONARIES } from '../src/i18n';
import { checkBuiltIn, checkDaily } from '../src/levels/validate';
import { findLevelFiles } from './levelFiles';

const files = findLevelFiles();
let failed = 0;
for (const f of files) {
  const level = { ...f.data };
  delete level.plan;
  delete level.daily;
  const r = checkBuiltIn(level, f.world, f.index, DICTIONARIES);
  r.problems.push(...checkDaily(level, f.world, f.data.daily));
  if (r.problems.length > 0) {
    failed++;
    console.error(`✗ ${f.rel}`);
    for (const p of r.problems) console.error(`    ${p}`);
  }
}
console.log(`validate-levels: ${files.length - failed}/${files.length} built-in levels OK`);
process.exit(failed > 0 ? 1 : 0);
