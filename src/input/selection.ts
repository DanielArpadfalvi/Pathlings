import type { Creature } from '../core/creature';
import { bodyRect, isActive } from '../core/creature';
import type { SkillId } from '../core/level';
import { canAssign } from '../core/sim';
import type { Sim } from '../core/world';

/**
 * "Smart tap" (§1.7): which creature a tap at a screen point means. Every active creature whose
 * body lies within `SELECT_RADIUS` pt of the finger is a candidate; the best one wins by, in order:
 * (a) eligible for the selected skill, (b) distance (in `DISTANCE_BUCKET`-pt steps, so creatures
 * at practically the same distance fall through to the next rules), (c) has no skill yet,
 * (d) walks towards the side of the tap, (e) smaller id. The direction filter removes creatures
 * walking the other way. Pure: works on plain candidate data.
 */

export const SELECT_RADIUS = 28;
export const DISTANCE_BUCKET = 6;

export type DirectionFilter = 'both' | 'left' | 'right';

export interface Candidate {
  id: number;
  /** Body rect in world px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Body centre x (world px), for the "walking towards the tap" rule. */
  cx: number;
  dir: number;
  eligible: boolean;
  skillsUsed: number;
}

export interface PickQuery {
  /** Tap point in world px. */
  x: number;
  y: number;
  /** CSS px (≈ pt) per world px, to measure the radius and distances on screen. */
  scale: number;
  filter?: DirectionFilter;
  radius?: number;
}

/** Screen distance (pt) from a world point to a candidate's body rect (0 inside). */
export function distanceToBody(c: Candidate, x: number, y: number, scale: number): number {
  const dx = Math.max(c.x - x, 0, x - (c.x + c.w));
  const dy = Math.max(c.y - y, 0, y - (c.y + c.h));
  return Math.hypot(dx, dy) * scale;
}

function passesFilter(c: Candidate, filter: DirectionFilter): boolean {
  return filter === 'both' || (filter === 'left' ? c.dir < 0 : c.dir > 0);
}

/** Sort key of a candidate; smaller is better. */
function rank(c: Candidate, q: PickQuery): number[] {
  const d = distanceToBody(c, q.x, q.y, q.scale);
  const towards = (q.x - c.cx) * c.dir > 0 ? 0 : 1;
  return [
    c.eligible ? 0 : 1,
    Math.floor(d / DISTANCE_BUCKET),
    c.skillsUsed > 0 ? 1 : 0,
    towards,
    c.id,
  ];
}

function better(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return (a[i] as number) < (b[i] as number);
  }
  return false;
}

/** The chosen candidate's id, or null when nobody is within the radius (after filtering). */
export function pickCandidate(cands: readonly Candidate[], q: PickQuery): number | null {
  const radius = q.radius ?? SELECT_RADIUS;
  const filter = q.filter ?? 'both';
  let best: Candidate | null = null;
  let bestRank: number[] = [];
  for (const c of cands) {
    if (!passesFilter(c, filter)) continue;
    if (distanceToBody(c, q.x, q.y, q.scale) > radius) continue;
    const r = rank(c, q);
    if (!best || better(r, bestRank)) {
      best = c;
      bestRank = r;
    }
  }
  return best ? best.id : null;
}

export function candidateOf(sim: Sim, c: Creature, skill: SkillId | null): Candidate {
  const r = bodyRect(c);
  return {
    id: c.id,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    cx: c.x + 0.5,
    dir: c.dir,
    eligible: skill !== null && canAssign(sim, c.id, skill),
    skillsUsed: c.skillsUsed,
  };
}

/** Candidates for the current sim state: every active creature (not exiting, saved or dead). */
export function candidatesFromSim(sim: Sim, skill: SkillId | null): Candidate[] {
  return sim.creatures.filter(isActive).map((c) => candidateOf(sim, c, skill));
}
