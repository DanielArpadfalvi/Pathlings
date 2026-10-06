/** Helpers for scenario tests on tiny hand-built terrains. */

import { type Creature, CreatureState } from '../../../src/core/creature';
import {
  type LevelDef,
  type LevelObject,
  createLevel,
  emptySkillSet,
} from '../../../src/core/level';
import { type SimOptions, createSim, spawnCreature, step } from '../../../src/core/sim';
import { terrainFromRows } from '../../../src/core/terrain';
import type { Sim } from '../../../src/core/world';

/**
 * A sim over a terrain given as text rows (see `terrainFromRows`). No entrance spawning unless
 * `level.creatures` and an entrance are given; use `spawn` to place creatures directly.
 */
export function rowsSim(
  rows: readonly string[],
  objects: LevelObject[] = [],
  level: Partial<LevelDef> = {},
  options: SimOptions = {},
): Sim {
  const terrain = terrainFromRows(rows);
  const def = createLevel({
    w: terrain.width,
    h: terrain.height,
    objects,
    creatures: 0,
    required: 0,
    master: 0,
    skills: emptySkillSet(10),
    ...level,
  });
  return createSim(def, { keyframes: false, ...options, terrain });
}

/** A rows string of `w` chars: `fill` everywhere. */
export function row(w: number, fill = '.'): string {
  return fill.repeat(w);
}

/** Builds `h` rows of width `w`, with solid soil from row `ground` down. */
export function flat(w: number, h: number, ground: number, ch = '#'): string[] {
  return Array.from({ length: h }, (_, y) => (y >= ground ? ch.repeat(w) : '.'.repeat(w)));
}

/** Replaces a run of cells in a rows array (returns a copy). */
export function paint(
  rows: readonly string[],
  x: number,
  y: number,
  w: number,
  h: number,
  ch: string,
): string[] {
  return rows.map((r, yy) =>
    yy >= y && yy < y + h ? r.slice(0, x) + ch.repeat(w) + r.slice(x + w) : r,
  );
}

export function spawn(sim: Sim, x: number, y: number, dir = 1): Creature {
  return spawnCreature(sim, x, y, dir);
}

/** Spawns a creature already walking on the ground at (x, y). */
export function walker(sim: Sim, x: number, y: number, dir = 1): Creature {
  const c = spawnCreature(sim, x, y, dir);
  c.state = CreatureState.Walk;
  return c;
}

export function run(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(sim);
}

/** Steps until `pred` holds (or throws after `max` ticks). Returns the ticks stepped. */
export function runUntil(sim: Sim, pred: () => boolean, max = 10_000): number {
  for (let i = 0; i < max; i++) {
    if (pred()) return i;
    step(sim);
  }
  if (pred()) return max;
  throw new Error(`runUntil: condition not met within ${max} ticks`);
}
