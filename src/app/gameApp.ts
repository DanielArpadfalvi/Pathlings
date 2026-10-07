import type { Application } from 'pixi.js';
import type { LevelDef, SkillId } from '../core/level';
import { SKILLS } from '../core/level';
import type { LaunchParams } from '../game/launchParams';
import { ATTRACT_LEVEL_ID } from '../game/launchParams';
import type { DirectionFilter } from '../input/selection';
import { FIXTURE_LEVELS, findTestLevel } from '../levels/test';
import { type HudState, TITLE_HUD, hudFor } from './hud';
import { PlayScreen } from './playScreen';
import { EditorScreen, type EditorView } from './editorScreen';
import type { Tool } from '../editor/tools';
import { Store } from './store';
import { FeedbackDirector } from '../audio/feedback';
import { WebAudioEngine } from '../audio/synth';
import { type AudioSettings, DEFAULT_AUDIO, sanitizeAudio } from '../audio/volume';
import { getHaptics } from '../platform/haptics';

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

/** UI → editor commands. */
export interface EditorActions {
  openEditor(): void;
  exitEditor(): void;
  setTool(tool: Tool): void;
  undo(): void;
  redo(): void;
  deleteSelected(): void;
  flipSelected(): void;
  finishPoly(): void;
  toggleWholeLevel(): void;
  setInsets(top: number, bottom: number): void;
}

/**
 * The running game: title (attract demo) or one level of the prototype sequence (the five
 * hand-made test levels), the HUD store the DOM overlay renders, and the commands it sends.
 */
export class GameApp implements GameActions, EditorActions {
  readonly hud = new Store<HudState>(TITLE_HUD);
  readonly editorView = new Store<EditorView | null>(null);
  private screen: PlayScreen | null;
  private editor: EditorScreen | null = null;
  private mode: 'title' | 'play' | 'editor';
  private levels: readonly LevelDef[] = FIXTURE_LEVELS;
  private index = 0;
  private endedAt = -1;
  private now = 0;
  private insets = { top: 0, bottom: 0 };
  private rewinding = false;
  readonly audio = new WebAudioEngine();
  private audioSettings: AudioSettings = DEFAULT_AUDIO;
  private feedback: FeedbackDirector | null = null;
  private hapticsOn = true;
  /** Fractional ticks still to rewind (rewinding is real-time driven). */
  private rewindAcc = 0;

  constructor(
    private readonly app: Application,
    private readonly params: LaunchParams,
  ) {
    const direct = params.levelId ? findTestLevel(params.levelId) : undefined;
    if (params.editor) {
      this.mode = 'editor';
      this.screen = null;
      this.editor = this.createEditor();
    } else if (direct) {
      const i = FIXTURE_LEVELS.indexOf(direct);
      if (i < 0) this.levels = [direct];
      this.index = Math.max(0, i);
      this.mode = 'play';
      this.screen = this.createScreen(true);
    } else {
      this.mode = 'title';
      this.screen = this.createScreen(false);
    }
    app.renderer.on('resize', (w: number, h: number) => {
      this.screen?.resize(w, h);
      this.editor?.resize(w, h);
    });
    app.ticker.add((t) => this.frame(t.deltaMS));
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.unlockAudio, true);
    window.addEventListener('keydown', this.unlockAudio, true);
    this.attachFeedback();
    this.publish();
  }

  /** The play screen (title demo or level); throws in the editor. */
  get current(): PlayScreen {
    if (!this.screen) throw new Error('no play screen in the editor');
    return this.screen;
  }

  get currentEditor(): EditorScreen | null {
    return this.editor;
  }

  private get ps(): PlayScreen {
    return this.current;
  }

  private createEditor(level?: LevelDef): EditorScreen {
    const ed = new EditorScreen(this.app, level);
    ed.setInsets(this.insets.top, this.insets.bottom);
    ed.onViewChange = () => this.publish();
    this.audio.playMusic(ed.doc.level.theme);
    this.audio.setDucked(true);
    return ed;
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

  /** Sound, haptics and music for the current screen. */
  private attachFeedback(): void {
    const screen = this.screen;
    if (!screen) return;
    if (this.mode === 'title') {
      this.feedback = null;
    } else {
      const fb = new FeedbackDirector(this.audio, getHaptics());
      fb.hapticsEnabled = this.hapticsOn;
      this.feedback = fb;
      screen.session.onStep((sim, events) => fb.onEvents(sim, events));
      screen.onAttempt = (a) => {
        if (!a.ok) fb.rejected(screen.session.sim.tick);
      };
    }
    this.audio.playMusic(screen.session.level.theme);
  }

  private readonly unlockAudio = (): void => {
    this.audio.unlock();
  };

  private replaceScreen(): void {
    const filter = this.screen?.filter ?? 'both';
    this.screen?.destroy();
    this.editor?.destroy();
    this.editor = null;
    this.editorView.set(null);
    this.screen = this.createScreen(false);
    this.attachFeedback();
    if (this.mode === 'play') this.ps.filter = filter;
    this.endedAt = -1;
    this.rewinding = false;
    this.publish();
  }

  /** Exponential moving average of the JS time per frame (ms), for the perf probe. */
  frameMs = 0;

  private frame(dtMs: number): void {
    const t0 = performance.now();
    this.frameBody(dtMs);
    this.frameMs = this.frameMs * 0.95 + (performance.now() - t0) * 0.05;
  }

  private frameBody(dtMs: number): void {
    this.now += dtMs;
    if (this.editor) {
      this.editor.frame(dtMs, this.now);
      return;
    }
    if (!this.screen) return;
    if (this.rewinding) {
      this.rewindAcc += (Math.min(dtMs, 100) * REWIND_SPEED * 60) / 1000;
      const whole = Math.floor(this.rewindAcc);
      this.rewindAcc -= whole;
      if (whole > 0) this.ps.session.rewindBy(whole);
    }
    this.ps.frame(dtMs, this.now);
    const session = this.ps.session;
    this.audio.setSpeed(session.speed);
    this.audio.setDucked(this.mode === 'play' && (session.paused || session.sim.ended));
    const ended = session.sim.ended;
    if (!ended) this.endedAt = -1;
    else if (this.endedAt < 0) this.endedAt = this.now;
    if (this.mode === 'title' && ended && this.now - this.endedAt > ATTRACT_RESTART_MS) {
      this.replaceScreen();
      return;
    }
    this.publish();
  }

  private publish(): void {
    if (this.editor) {
      this.hud.set({ ...TITLE_HUD, mode: 'editor' });
      this.editorView.set(this.editor.view);
      return;
    }
    if (!this.screen) return;
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
    this.ps.skill = this.ps.skill === skill ? null : skill;
    this.publish();
  }

  togglePause(): void {
    if (this.mode !== 'play') return;
    this.ps.session.paused = !this.ps.session.paused;
    this.publish();
  }

  cycleSpeed(): void {
    if (this.mode !== 'play') return;
    const s = this.ps.session;
    const i = SPEEDS.indexOf(s.speed as (typeof SPEEDS)[number]);
    s.speed = SPEEDS[(i + 1) % SPEEDS.length] as number;
    this.publish();
  }

  release(direction: 1 | -1): void {
    if (this.mode !== 'play') return;
    this.ps.session.changeRelease(direction);
    this.publish();
  }

  popAll(): void {
    if (this.mode !== 'play') return;
    this.ps.session.popAll();
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
    if (this.editor) this.editor.toggleWholeLevel();
    else this.ps.toggleWholeLevel();
  }

  setFilter(filter: DirectionFilter): void {
    if (this.mode !== 'play') return;
    this.ps.filter = filter;
    this.publish();
  }

  setInsets(top: number, bottom: number): void {
    this.insets = { top, bottom };
    if (this.mode === 'play') this.ps.camera.setInsets(top, bottom);
    this.editor?.setInsets(top, bottom);
  }

  // --- EditorActions ----------------------------------------------------------------------------

  openEditor(): void {
    this.screen?.destroy();
    this.screen = null;
    this.feedback = null;
    this.mode = 'editor';
    this.editor = this.createEditor();
    this.publish();
  }

  exitEditor(): void {
    if (!this.editor) return;
    this.mode = 'title';
    this.replaceScreen();
  }

  setTool(tool: Tool): void {
    this.editor?.setTool(tool);
  }

  undo(): void {
    this.editor?.undo();
  }

  redo(): void {
    this.editor?.redo();
  }

  deleteSelected(): void {
    this.editor?.deleteSelected();
  }

  flipSelected(): void {
    this.editor?.flipSelected();
  }

  finishPoly(): void {
    this.editor?.finishPoly();
  }

  rewindStart(): void {
    if (this.mode !== 'play' || this.rewinding) return;
    this.rewinding = true;
    this.rewindAcc = 0;
    this.ps.session.paused = true;
    this.publish();
  }

  rewindEnd(): void {
    if (!this.rewinding) return;
    this.rewinding = false;
    this.publish();
  }

  setAudio(settings: Partial<AudioSettings>): void {
    this.audioSettings = sanitizeAudio({ ...this.audioSettings, ...settings });
    this.audio.setVolumes(this.audioSettings);
  }

  setHaptics(on: boolean): void {
    this.hapticsOn = on;
    if (this.feedback) this.feedback.hapticsEnabled = on;
  }

  // --- Keyboard (web) ---------------------------------------------------------------------------

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.editor && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) this.redo();
      else this.undo();
      e.preventDefault();
      return;
    }
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
    window.removeEventListener('pointerdown', this.unlockAudio, true);
    window.removeEventListener('keydown', this.unlockAudio, true);
    this.audio.destroy();
    this.screen?.destroy();
    this.editor?.destroy();
  }
}
