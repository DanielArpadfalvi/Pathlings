import type { SkillId, SkillSet } from '../core/level';
import { TICKS_PER_SECOND } from '../core/level';
import { liveCount, releaseBounds, timeLeftTicks } from '../core/sim';
import type { LevelEndReason } from '../core/world';
import { rateRun } from '../core/stars';
import type { DirectionFilter } from '../input/selection';
import type { PlayScreen } from './playScreen';

export interface EndInfo {
  won: boolean;
  saved: number;
  required: number;
  total: number;
  stars: number;
  reason: LevelEndReason;
  hasNext: boolean;
}

/** Everything the DOM overlay shows during play, as plain data (see `Store`). */
export interface HudState {
  mode: 'title' | 'play';
  levelTitle: string;
  levelNumber: number;
  levelCount: number;
  /** Creatures currently in the level. */
  out: number;
  saved: number;
  required: number;
  total: number;
  timeLeftSeconds: number;
  skills: SkillSet | null;
  selected: SkillId | null;
  paused: boolean;
  speed: number;
  /** Release speed-up shown on the rate control (1 = slowest … 4 = fastest). */
  releaseFactor: number;
  canFaster: boolean;
  canSlower: boolean;
  nuked: boolean;
  filter: DirectionFilter;
  end: EndInfo | null;
}

export const TITLE_HUD: HudState = {
  mode: 'title',
  levelTitle: '',
  levelNumber: 0,
  levelCount: 0,
  out: 0,
  saved: 0,
  required: 0,
  total: 0,
  timeLeftSeconds: 0,
  skills: null,
  selected: null,
  paused: false,
  speed: 1,
  releaseFactor: 1,
  canFaster: false,
  canSlower: false,
  nuked: false,
  filter: 'both',
  end: null,
};

export function hudFor(
  screen: PlayScreen,
  levelNumber: number,
  levelCount: number,
  showEnd: boolean,
): HudState {
  const sim = screen.session.sim;
  const level = sim.level;
  const { fastest, slowest } = releaseBounds(sim);
  const stars = rateRun(level, sim.saved, sim.assignments).count;
  return {
    mode: 'play',
    levelTitle: level.title,
    levelNumber,
    levelCount,
    out: liveCount(sim),
    saved: sim.saved,
    required: level.required,
    total: level.creatures,
    timeLeftSeconds: Math.ceil(timeLeftTicks(sim) / TICKS_PER_SECOND),
    skills: { ...sim.skills },
    selected: screen.skill,
    paused: screen.session.paused,
    speed: screen.session.speed,
    releaseFactor: Math.round((slowest / sim.releaseInterval) * 10) / 10,
    canFaster: sim.releaseInterval > fastest && !sim.ended,
    canSlower: sim.releaseInterval < slowest && !sim.ended,
    nuked: sim.nuked,
    filter: screen.filter,
    end:
      showEnd && sim.ended
        ? {
            won: stars > 0,
            saved: sim.saved,
            required: level.required,
            total: level.creatures,
            stars,
            reason: sim.endReason ?? 'done',
            hasNext: stars > 0 && levelNumber < levelCount,
          }
        : null,
  };
}
