import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { LevelDef } from '../src/core/level';
import type { PlanStep } from '../src/levels/plan';
import { WORLDS, type WorldId } from '../src/levels/validate';

/** A built-in level file as stored on disk (`plan` is authoring-only). */
export type LevelFile = LevelDef & { plan?: PlanStep[] };

export interface FoundLevel {
  path: string;
  rel: string;
  world: WorldId;
  index: number;
  data: LevelFile;
}

export const LEVELS_DIR = join(import.meta.dirname, '..', 'src', 'levels');

/** Every `src/levels/<world>/NN.json`, in world and index order. */
export function findLevelFiles(): FoundLevel[] {
  const out: FoundLevel[] = [];
  for (const w of WORLDS) {
    const dir = join(LEVELS_DIR, w.id);
    let names: string[];
    try {
      if (!statSync(dir).isDirectory()) continue;
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names.filter((n) => /^\d\d\.json$/.test(n)).sort()) {
      const path = join(dir, name);
      out.push({
        path,
        rel: relative(join(LEVELS_DIR, '..', '..'), path),
        world: w.id,
        index: Number.parseInt(name, 10),
        data: JSON.parse(readFileSync(path, 'utf8')) as LevelFile,
      });
    }
  }
  return out;
}

/** Writes a level file with stable formatting (2-space JSON, trailing newline). */
export function writeLevelFile(path: string, data: LevelFile): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
