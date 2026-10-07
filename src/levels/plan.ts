import type { CreatureStateName } from '../core/creature';
import { STATE_NAMES, isActive } from '../core/creature';
import type { LevelDef, LogCommand, ReleaseChange, SkillId, Solution } from '../core/level';
import {
  assign,
  canAssign,
  createSim,
  popAll,
  setReleaseInterval,
  stateHash,
  step,
} from '../core/sim';

/**
 * Authoring aid for built-in levels: a *plan* describes the reference solution with conditions
 * ("creature 0, once it walks at x ≥ 140, becomes a Burrower") instead of exact ticks. The level
 * tool (`npm run levels:solve`) simulates the level, fires each step the first tick its
 * condition holds (in order), and records the exact input log and final hash — the `solution`
 * that ships and that `scripts/validate-levels` replays. Plans never reach the game.
 */
export interface PlanCondition {
  /** Earliest tick. */
  tick?: number;
  xGte?: number;
  xLte?: number;
  yGte?: number;
  yLte?: number;
  state?: CreatureStateName;
  /** 1 = walking right, −1 = left. */
  dir?: 1 | -1;
}

export type PlanStep =
  | { assign: SkillId; creature: number; when?: PlanCondition }
  | { popAll: true; when?: { tick?: number } }
  | { release: number; when?: { tick?: number } };

export interface CompiledPlan {
  solution: Solution;
  saved: number;
  won: boolean;
  /** Steps whose condition never held (the plan is broken). */
  unfired: number[];
  ticks: number;
}

function holds(step: PlanStep, sim: ReturnType<typeof createSim>): boolean {
  const w = step.when ?? {};
  if (w.tick !== undefined && sim.tick < w.tick) return false;
  if (!('assign' in step)) return true;
  const c = sim.creatures[step.creature];
  if (!c || !isActive(c)) return false;
  const cond = w as PlanCondition;
  if (cond.xGte !== undefined && c.x < cond.xGte) return false;
  if (cond.xLte !== undefined && c.x > cond.xLte) return false;
  if (cond.yGte !== undefined && c.y < cond.yGte) return false;
  if (cond.yLte !== undefined && c.y > cond.yLte) return false;
  if (cond.state !== undefined && STATE_NAMES[c.state] !== cond.state) return false;
  if (cond.dir !== undefined && c.dir !== cond.dir) return false;
  return canAssign(sim, step.creature, step.assign);
}

/** Runs the level with the plan and returns the recorded solution. */
export function compilePlan(level: LevelDef, plan: readonly PlanStep[]): CompiledPlan {
  const sim = createSim(level, { keyframes: false, events: false });
  let next = 0;
  const log: LogCommand[] = [];
  const releaseChanges: ReleaseChange[] = [];
  while (!sim.ended) {
    // Several steps may fire in the same tick (e.g. Scaler + Glider on one creature).
    for (let s = plan[next]; s && holds(s, sim); s = plan[next]) {
      if ('assign' in s) assign(sim, s.creature, s.assign);
      else if ('popAll' in s) popAll(sim);
      else setReleaseInterval(sim, s.release);
      next++;
    }
    step(sim);
  }
  for (const c of sim.log) log.push({ ...c });
  for (const r of sim.releaseChanges) releaseChanges.push({ ...r });
  return {
    solution: { log, releaseChanges, finalHash: stateHash(sim) },
    saved: sim.saved,
    won: sim.saved >= level.required,
    unfired: plan.slice(next).map((_, i) => next + i),
    ticks: sim.tick,
  };
}
