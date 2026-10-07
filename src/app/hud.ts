import type { SkillId, SkillSet } from '../core/level';
import { TICKS_PER_SECOND } from '../core/level';
import { liveCount, releaseBounds, timeLeftTicks } from '../core/sim';
import type { LevelEndReason } from '../core/world';
import { rateRun } from '../core/stars';
import { type TranslationKey, t } from '../i18n';
import type { DirectionFilter } from '../input/selection';
import type { PlayScreen } from './playScreen';
import type { TutorialView } from './tutorial';
import type { HelpView } from './help';

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
  mode: 'title' | 'play' | 'editor';
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
  /** Played share of the time limit, 0…1 (timeline bar). */
  progress: number;
  rewinding: boolean;
  canRewind: boolean;
  /** Test play of the editor draft (end screen offers Edit / Publish). */
  testPlay: boolean;
  tutorial: TutorialView | null;
  /** Daily level: on the title card today's offer, during play the badge text. */
  daily: DailyInfo | null;
  /** Hints / solution state of the current level (null: no help, e.g. test play). */
  help: HelpInfo | null;
  /** The reference solution is being replayed. */
  watching: boolean;
  end: EndInfo | null;
}

export interface HelpInfo extends HelpView {
  /** Translated hints, empty until unlocked. */
  hints: string[];
  /** Number of hints the level has. */
  hintCount: number;
  hasSolution: boolean;
}

export interface DailyInfo {
  date: string;
  /** Translated modifier text, e.g. "−1 Mason". */
  modifier: string;
  /** Translated title of the bonus level. */
  title: string;
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
  progress: 0,
  rewinding: false,
  canRewind: false,
  testPlay: false,
  tutorial: null,
  daily: null,
  help: null,
  watching: false,
  end: null,
};

export function hudFor(
  screen: PlayScreen,
  levelNumber: number,
  levelCount: number,
  showEnd: boolean,
  rewinding = false,
): HudState {
  const sim = screen.session.sim;
  const level = sim.level;
  const { fastest, slowest } = releaseBounds(sim);
  const stars = rateRun(level, sim.saved, sim.assignments).count;
  return {
    mode: 'play',
    levelTitle: level.titleKey ? t(level.titleKey as TranslationKey) : level.title,
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
    progress: Math.min(1, Math.round((sim.tick / level.timeLimitTicks) * 1000) / 1000),
    rewinding,
    canRewind: sim.tick > 0,
    testPlay: false,
    tutorial: null,
    daily: null,
    help: null,
    watching: false,
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
