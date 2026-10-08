import type { DailyModifier } from '../core/daily';
import type { SkillId, SkillSet } from '../core/level';
import { TICKS_PER_SECOND } from '../core/level';
import { liveCount, releaseBounds, timeLeftTicks } from '../core/sim';
import type { LevelEndReason } from '../core/world';
import { rateRun } from '../core/stars';
import { type TranslationKey, t } from '../i18n';
import type { DirectionFilter } from '../input/selection';
import type { PlayScreen } from './playScreen';
import type { TutorialView } from './tutorial';

export interface EndInfo {
  won: boolean;
  saved: number;
  required: number;
  total: number;
  stars: number;
  reason: LevelEndReason;
  hasNext: boolean;
}

/** The daily level: its UTC date and the modifier, as display text. */
export interface DailyInfo {
  date: string;
  modifier: string;
}

export function modifierText(mod: DailyModifier): string {
  if (mod.kind === 'fewer') return t('daily.mod.fewer', { skill: t(`skill.${mod.skill}`) });
  return mod.kind === 'shorter' ? t('daily.mod.shorter') : t('daily.mod.more');
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
  /** Title: today's daily level (null when unavailable); play: the daily being played. */
  daily: DailyInfo | null;
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
  progress: 0,
  rewinding: false,
  canRewind: false,
  testPlay: false,
  tutorial: null,
  daily: null,
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
