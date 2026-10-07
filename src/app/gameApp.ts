import type { Application } from 'pixi.js';
import type { LevelDef, SkillId } from '../core/level';
import { SKILLS } from '../core/level';
import type { LaunchParams } from '../game/launchParams';
import { ATTRACT_LEVEL_ID } from '../game/launchParams';
import type { DirectionFilter } from '../input/selection';
import { FIXTURE_LEVELS, findTestLevel } from '../levels/test';
import { type HudState, TITLE_HUD, hudFor } from './hud';
import { PlayScreen } from './playScreen';
import { Store } from './store';

/** Game speeds of the speed button, in cycle order starting from 1× (§1.7). */
export const SPEEDS = [1, 2, 4, 0.5] as const;
/** The end screen appears this long after the level ends (see the last creatures pop in). */
const END_SCREEN_DELAY_MS = 700;
/** Attract mode restarts the demo this long after it ends. */
const ATTRACT_RESTART_MS = 2000;
/** Hold-to-rewind runs backwards at this multiple of real time (§1.7). */
export const REWIND_SPEED = 4;

/** UI → game commands (buttons, keyboard). */
export interface GameActions {
  play(): void;
  selectSkill(skill: SkillId): void;
  togglePause(): void;
  cycleSpeed(): void;
  release(direction: 1 | -1): void;
  popAll(): void;
  retry(): void;
  next(): void;
  toggleWholeLevel(): void;
  setFilter(filter: DirectionFilter): void;
  /** Heights of the UI strips covering the canvas (HUD top, controls bottom), CSS px. */
  setInsets(top: number, bottom: number): void;
  /** Rewind button pressed / released (the game stays paused afterwards). */
  rewindStart(): void;
  rewindEnd(): void;
}

/**
 * The running game: title (attract demo) or one level of the prototype sequence (the five
 * hand-made test levels), the HUD store the DOM overlay renders, and the commands it sends.
 */
export class GameApp implements GameActions {
  readonly hud = new Store<HudState>(TITLE_HUD);
  private screen: PlayScreen;
  private mode: 'title' | 'play';
  private levels: readonly LevelDef[] = FIXTURE_LEVELS;
  private index = 0;
  private endedAt = -1;
  private now = 0;
  private insets = { top: 0, bottom: 0 };
  private rewinding = false;
  /** Fractional ticks still to rewind (rewinding is real-time driven). */
  private rewindAcc = 0;

  constructor(
    private readonly app: Application,
    private readonly params: LaunchParams,
  ) {
    const direct = params.levelId ? findTestLevel(params.levelId) : undefined;
    if (direct) {
      const i = FIXTURE_LEVELS.indexOf(direct);
      if (i < 0) this.levels = [direct];
      this.index = Math.max(0, i);
      this.mode = 'play';
      this.screen = this.createScreen(true);
    } else {
      this.mode = 'title';
      this.screen = this.createScreen(false);
    }
    app.renderer.on('resize', (w: number, h: number) => this.screen.resize(w, h));
    app.ticker.add((t) => this.frame(t.deltaMS));
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.publish();
  }

  get current(): PlayScreen {
    return this.screen;
  }

  private createScreen(fromParams: boolean): PlayScreen {
    const p = this.params;
    if (this.mode === 'title') {
      const demo = findTestLevel(ATTRACT_LEVEL_ID) as LevelDef;
      return new PlayScreen(this.app, demo, { autoplay: demo.solution, wholeLevel: true });
    }
    const level = this.levels[this.index] as LevelDef;
    const screen = new PlayScreen(this.app, level, {
      autoplay: fromParams && p.autoplay ? level.solution : undefined,
      seek: fromParams ? p.seek : 0,
      paused: fromParams && p.paused,
      interactive: true,
      skill: fromParams ? p.skill : null,
      filter: fromParams ? p.filter : 'both',
    });
    screen.autoPause = p.autoPause;
    screen.camera.setInsets(this.insets.top, this.insets.bottom);
    return screen;
  }

  private replaceScreen(): void {
    const filter = this.screen.filter;
    this.screen.destroy();
    this.screen = this.createScreen(false);
    if (this.mode === 'play') this.screen.filter = filter;
    this.endedAt = -1;
    this.rewinding = false;
    this.publish();
  }

  private frame(dtMs: number): void {
    this.now += dtMs;
    if (this.rewinding) {
      this.rewindAcc += (Math.min(dtMs, 100) * REWIND_SPEED * 60) / 1000;
      const whole = Math.floor(this.rewindAcc);
      this.rewindAcc -= whole;
      if (whole > 0) this.screen.session.rewindBy(whole);
    }
    this.screen.frame(dtMs, this.now);
    const ended = this.screen.session.sim.ended;
    if (!ended) this.endedAt = -1;
    else if (this.endedAt < 0) this.endedAt = this.now;
    if (this.mode === 'title' && ended && this.now - this.endedAt > ATTRACT_RESTART_MS) {
      this.replaceScreen();
      return;
    }
    this.publish();
  }

  private publish(): void {
    if (this.mode === 'title') {
      this.hud.set(TITLE_HUD);
      return;
    }
    const showEnd = this.endedAt >= 0 && this.now - this.endedAt >= END_SCREEN_DELAY_MS;
    this.hud.set(
      hudFor(
        this.screen,
        this.index + 1,
        this.levels.length,
        showEnd && !this.rewinding,
        this.rewinding,
      ),
    );
  }

  // --- GameActions ------------------------------------------------------------------------------

  play(): void {
    this.mode = 'play';
    this.levels = FIXTURE_LEVELS;
    this.index = 0;
    this.replaceScreen();
  }

  selectSkill(skill: SkillId): void {
    if (this.mode !== 'play') return;
    this.screen.skill = this.screen.skill === skill ? null : skill;
    this.publish();
  }

  togglePause(): void {
    if (this.mode !== 'play') return;
    this.screen.session.paused = !this.screen.session.paused;
    this.publish();
  }

  cycleSpeed(): void {
    if (this.mode !== 'play') return;
    const s = this.screen.session;
    const i = SPEEDS.indexOf(s.speed as (typeof SPEEDS)[number]);
    s.speed = SPEEDS[(i + 1) % SPEEDS.length] as number;
    this.publish();
  }

  release(direction: 1 | -1): void {
    if (this.mode !== 'play') return;
    this.screen.session.changeRelease(direction);
    this.publish();
  }

  popAll(): void {
    if (this.mode !== 'play') return;
    this.screen.session.popAll();
    this.publish();
  }

  retry(): void {
    if (this.mode !== 'play') return;
    this.replaceScreen();
  }

  next(): void {
    if (this.mode !== 'play') return;
    if (this.index + 1 < this.levels.length) {
      this.index++;
      this.replaceScreen();
    }
  }

  toggleWholeLevel(): void {
    this.screen.toggleWholeLevel();
  }

  setFilter(filter: DirectionFilter): void {
    this.screen.filter = filter;
    this.publish();
  }

  setInsets(top: number, bottom: number): void {
    this.insets = { top, bottom };
    if (this.mode === 'play') this.screen.camera.setInsets(top, bottom);
  }

  rewindStart(): void {
    if (this.mode !== 'play' || this.rewinding) return;
    this.rewinding = true;
    this.rewindAcc = 0;
    this.screen.session.paused = true;
    this.publish();
  }

  rewindEnd(): void {
    if (!this.rewinding) return;
    this.rewinding = false;
    this.publish();
  }

  // --- Keyboard (web) ---------------------------------------------------------------------------

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.mode !== 'play' || e.ctrlKey || e.metaKey || e.altKey) return;
    const digit = Number.parseInt(e.key, 10);
    if (digit >= 1 && digit <= SKILLS.length) {
      this.selectSkill(SKILLS[digit - 1] as SkillId);
    } else if (e.key === ' ') {
      this.togglePause();
    } else if (e.key === '+' || e.key === '=') {
      this.release(1);
    } else if (e.key === '-') {
      this.release(-1);
    } else if (e.key === 'f') {
      this.cycleSpeed();
    } else if (e.key === 'r') {
      this.retry();
    } else if (e.key === 'z' || e.key === 'Backspace') {
      if (!e.repeat) this.rewindStart();
    } else {
      return;
    }
    e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'z' || e.key === 'Backspace') this.rewindEnd();
  };

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.screen.destroy();
  }
}
