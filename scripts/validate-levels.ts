/**
 * CI gate for the built-in levels (T5.1): replays every reference solution and checks the rules
 * in `src/levels/validate.ts`. Exit code 1 on any problem. Run: `npm run validate-levels`.
 */
import { DICTIONARIES } from '../src/i18n';
import { dailyPick, dayLabel, epochDay, modifierKey } from '../src/core/daily';
import { checkBuiltIn, checkDailyVariants } from '../src/levels/validate';
import { findLevelFiles } from './levelFiles';

const files = findLevelFiles();
let failed = 0;
for (const f of files) {
  const level = { ...f.data };
  delete level.plan;
  delete level.daily;
  const r = checkBuiltIn(level, f.world, f.index, DICTIONARIES);
  if (f.world === 'bonus') r.problems.push(...checkDailyVariants(level, f.data.daily));
  else if (f.data.daily) r.problems.push('daily variants are for the bonus pool only');
  if (r.problems.length > 0) {
    failed++;
    console.error(`✗ ${f.rel}`);
    for (const p of r.problems) console.error(`    ${p}`);
  }
}
console.log(`validate-levels: ${files.length - failed}/${files.length} built-in levels OK`);

// Daily level: the next 365 days (UTC) only ever pick validated variants (checked above).
const bonus = files.filter((f) => f.world === 'bonus');
if (bonus.length > 0) {
  const now = new Date();
  const today = epochDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  const counts = bonus.map((f) => f.data.daily?.length ?? 0);
  const combos = new Set<string>();
  for (let day = today; day < today + 365; day++) {
    const p = dailyPick(day, counts);
    const v = bonus[p.level]?.data.daily?.[p.variant];
    if (!v) {
      failed++;
      console.error(`✗ daily ${dayLabel(day)}: no variant ${p.level}/${p.variant}`);
    } else combos.add(`${bonus[p.level]?.data.id} ${modifierKey(v.mod)}`);
  }
  console.log(`daily: next 365 days use ${combos.size} validated level × modifier combinations`);
}
process.exit(failed > 0 ? 1 : 0);
