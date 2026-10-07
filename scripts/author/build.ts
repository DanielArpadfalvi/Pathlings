import type { LevelDef, LevelObject, SkillId } from '../../src/core/level';
import { createLevel, emptySkillSet } from '../../src/core/level';
import type { RasterOp } from '../../src/core/raster';
import type { Material } from '../../src/core/terrain';
import type { PlanStep } from '../../src/levels/plan';

/**
 * Small vocabulary for writing built-in levels in code (T5.2+): terrain pieces, objects and a
 * level spec with its reference plan and texts. `scripts/author-levels.ts` compiles the plans,
 * calibrates the star thresholds from the reference run and writes `src/levels/<world>/NN.json`
 * plus the level texts.
 */

export const SOIL = 1 as Material;
export const ROCK = 2 as Material;
export const METAL = 3 as Material;
export const ONEWAY_L = 4 as Material;
export const ONEWAY_R = 5 as Material;
export const CRUMBLE = 6 as Material;

export type Text = [en: string, hu: string];

export interface LevelSpec {
  /** 1-based index within the world. */
  index: number;
  title: Text;
  hints?: Text[];
  difficulty: number;
  w?: number;
  h?: number;
  ops: RasterOp[];
  objects: LevelObject[];
  creatures: number;
  required: number;
  skills: Partial<Record<SkillId, number>>;
  timeLimitSeconds?: number;
  minReleaseTicks?: number;
  plan: PlanStep[];
}

export function rect(m: Material, x: number, y: number, w: number, h: number): RasterOp {
  return { op: 'rect', m, x, y, w, h };
}

export function ramp(
  m: Material,
  x: number,
  y: number,
  w: number,
  h: number,
  rise: 'left' | 'right',
): RasterOp {
  return { op: 'ramp', m, x, y, w, h, rise };
}

export function circle(m: Material, x: number, y: number, r: number): RasterOp {
  return { op: 'circle', m, x, y, r };
}

export function stamp(id: string, m: Material, x: number, y: number, flip = false): RasterOp {
  return flip ? { op: 'stamp', id, m, x, y, flip } : { op: 'stamp', id, m, x, y };
}

/** Air cut out of the terrain. */
export function cut(x: number, y: number, w: number, h: number): RasterOp {
  return rect(0 as Material, x, y, w, h);
}

/** Metal walls on both level edges from `top` to `bottom`. */
export function sideWalls(w: number, top: number, bottom: number, thickness = 6): RasterOp[] {
  return [
    rect(METAL, 0, top, thickness, bottom - top),
    rect(METAL, w - thickness, top, thickness, bottom - top),
  ];
}

export function entrance(x: number, y: number, dir: 1 | -1 = 1): LevelObject {
  return { type: 'entrance', x, y, dir };
}

/** Exit standing on the ground at foot level `groundY`, centred on x. */
export function exitOn(x: number, groundY: number): LevelObject {
  return { type: 'exit', x: x - 6, y: groundY - 12 };
}

export function water(x: number, y: number, w: number, h: number): LevelObject {
  return { type: 'water', x, y, w, h };
}

export function lava(x: number, y: number, w: number, h: number): LevelObject {
  return { type: 'lava', x, y, w, h };
}

/** Assign `skill` to each creature in `ids` once it walks (and the extra condition holds). */
export function each(
  skill: SkillId,
  ids: readonly number[],
  when: Omit<NonNullable<Extract<PlanStep, { assign: SkillId }>['when']>, 'state'> = {},
): PlanStep[] {
  return ids.map((creature) => ({ assign: skill, creature, when: { ...when, state: 'walk' } }));
}

export function range(n: number, from = 0): number[] {
  return Array.from({ length: n }, (_, i) => from + i);
}

/** The level definition of a spec (thresholds are calibrated by the author script). */
export function toLevel(world: string, theme: LevelDef['theme'], spec: LevelSpec): LevelDef {
  const id = `${world}-${String(spec.index).padStart(2, '0')}`;
  const skills = emptySkillSet();
  for (const [k, v] of Object.entries(spec.skills)) skills[k as SkillId] = v;
  const level = createLevel({
    id,
    title: spec.title[0],
    titleKey: `level.${id}.title`,
    author: '',
    theme,
    difficulty: spec.difficulty,
    w: spec.w ?? 320,
    h: spec.h ?? 480,
    ops: spec.ops,
    objects: spec.objects,
    creatures: spec.creatures,
    required: spec.required,
    master: spec.required,
    frugal: 999,
    skills,
    timeLimitTicks: (spec.timeLimitSeconds ?? 300) * 60,
    minReleaseTicks: spec.minReleaseTicks ?? 60,
    hints: [],
  });
  if (spec.hints?.length) {
    level.hintKeys = spec.hints.map((_, i) => `level.${id}.hint${i + 1}`);
  }
  return level;
}
