import { type Application, UPDATE_PRIORITY } from 'pixi.js';
import type { LevelDef, SkillId } from '../core/level';
import { SKILLS } from '../core/level';
import type { LaunchParams } from '../game/launchParams';
import { ATTRACT_LEVEL_ID } from '../game/launchParams';
import type { DirectionFilter } from '../input/selection';
import { FIXTURE_LEVELS, findTestLevel } from '../levels/test';
import { BONUS_DAILY, BUILTIN_LEVELS, builtInLevel } from '../levels/catalog';
import { type DailyLevel, dailyLevel } from '../levels/daily';
import { epochDay } from '../core/daily';
import { TUTORIAL, TUTORIAL_SKIPPED_KEY } from '../levels/tutorial';
import { TutorialDirector } from './tutorial';
import { type DailyInfo, type HudState, TITLE_HUD, hudFor, modifierText } from './hud';
import { PlayScreen } from './playScreen';
import { EditorScreen, type EditorView } from './editorScreen';
import type { Tool } from '../editor/tools';
import type { EditorDoc, LevelProps } from '../editor/doc';
import { LevelCodeError, encodeLevel } from '../core/code/levelCode';
import { type VerifyStatus, loadLevelCode, verifyLevel } from '../core/code/verify';
import { exportSolution } from '../core/replay';
import { getClipboard } from '../platform/clipboard';
import { getSharer, type ShareOutcome } from '../platform/share';
import { getStore } from '../platform/storage';
import { type MyLevel, MyLevels, clearDraft, loadDraft, saveDraft } from './myLevels';
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
  /** Today's daily level (bonus pool + modifier). */
  playDaily(): void;
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
  /** Tutorial: "Got it" / skip the whole tutorial. */
  tutorialOk(): void;
  skipTutorial(): void;
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
  setProps(patch: Partial<LevelProps>): void;
  /** Play the draft (allowed when the level is valid). */
  testPlay(): void;
  backToEditor(): void;
  /** After a won test play: the shareable code with the solution embedded (null if not won). */
  publish(): string | null;
  copyText(text: string): Promise<boolean>;
  /** Decodes and verifies a pasted code; on success it can be played with `playLoaded`. */
  loadCode(text: string): CodeLoadResult;
  playLoaded(): void;
  /** Start a fresh level in the editor (drops the autosaved draft). */
  newLevel(): void;
  toggleFavourite(id: string): void;
  removeLevel(id: string): void;
  playMyLevel(id: string): void;
  editMyLevel(id: string): void;
  shareLevel(id: string): Promise<ShareOutcome>;
}

export type CodeLoadResult =
  | { ok: true; title: string; author: string; verified: boolean; status: VerifyStatus }
  | { ok: false; error: LevelCodeError['kind'] | 'unknown' };

/**
 * The running game: title (attract demo) or one level of the prototype sequence (the five
 * hand-made test levels), the HUD store the DOM overlay renders, and the commands it sends.
 */
export class GameApp implements GameActions, EditorActions {
  readonly hud = new Store<HudState>(TITLE_HUD);
  readonly editorView = new Store<EditorView | null>(null);
  private screen: PlayScreen | null;
  private editor: EditorScreen | null = null;
  /** The document being edited, kept while test-playing it. */
  private editorDoc: EditorDoc | null = null;
  /** The current play screen is a test play of the editor draft. */
  private testing = false;
  private loaded: LevelDef | null = null;
  private tutorial: TutorialDirector | null = null;
  readonly myLevels = new MyLevels(getStore(), () => Date.now());
  readonly myLevelsList = new Store<MyLevel[]>(this.myLevels.list());
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
  /** The daily level being played (null for any other level). */
  private daily: DailyLevel | null = null;

  constructor(
    private readonly app: Application,
    private readonly params: LaunchParams,
  ) {
    const direct = params.levelId
      ? (builtInLevel(params.levelId) ?? findTestLevel(params.levelId))
      : undefined;
    const daily = params.daily ? this.todaysDaily() : null;
    if (params.editor) {
      this.mode = 'editor';
      this.screen = null;
      this.editor = this.createEditor();
    } else if (daily) {
      this.daily = daily;
      this.levels = [daily.level];
      this.mode = 'play';
      this.screen = this.createScreen(true);
    } else if (direct) {
      // A built-in level opens inside its world's sequence ("next" works); test levels alone.
      const world = Object.values(BUILTIN_LEVELS).find((list) => list.includes(direct));
      const list = world ?? (FIXTURE_LEVELS.includes(direct) ? FIXTURE_LEVELS : [direct]);
      this.levels = list;
      this.index = Math.max(0, list.indexOf(direct));
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
    // Main-thread cost of Pixi's own render pass (scene traversal + GL submission), for the
    // perf probe: the ticker renders at LOW priority, so time it from just before to just after.
    let renderStart = 0;
    app.ticker.add(() => (renderStart = performance.now()), undefined, UPDATE_PRIORITY.LOW + 1);
    app.ticker.add(
      () => (this.renderMs = this.renderMs * 0.95 + (performance.now() - renderStart) * 0.05),
      undefined,
      UPDATE_PRIORITY.LOW - 1,
    );
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.unlockAudio, true);
    window.addEventListener('keydown', this.unlockAudio, true);
    this.attachFeedback();
    this.publishHud();
  }

  /** UTC epoch day of "today" (`daily=YYYY-MM-DD` overrides it for testing). */
  private today(): number {
    if (this.params.dailyDate !== null) return this.params.dailyDate;
    const now = new Date();
    return epochDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  }

  private todaysDaily(): DailyLevel | null {
    return dailyLevel(this.today(), BUILTIN_LEVELS.bonus, BONUS_DAILY);
  }

  private dailyInfo(d: DailyLevel | null): DailyInfo | null {
    return d ? { date: d.label, modifier: modifierText(d.mod) } : null;
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

  private createEditor(source?: LevelDef | EditorDoc): EditorScreen {
    const ed = new EditorScreen(this.app, source);
    this.editorDoc = ed.doc;
    ed.setInsets(this.insets.top, this.insets.bottom);
    ed.onViewChange = () => this.publishHud();
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
    this.tutorial = null;
    if (!screen) return;
    const steps = TUTORIAL[screen.session.level.id];
    if (this.mode === 'play' && steps && getStore().get(TUTORIAL_SKIPPED_KEY) !== '1') {
      this.tutorial = new TutorialDirector(steps, screen);
    }
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
    this.publishHud();
  }

  /** Exponential moving averages (ms) of the game's JS per frame and of Pixi's render pass. */
  frameMs = 0;
  renderMs = 0;

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
    this.tutorial?.update(this.now);
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
    this.publishHud();
  }

  private publishHud(): void {
    if (this.editor) {
      saveDraft(getStore(), this.editor.doc.level);
      this.hud.set({ ...TITLE_HUD, mode: 'editor' });
      this.editorView.set(this.editor.view);
      return;
    }
    if (!this.screen) return;
    if (this.mode === 'title') {
      this.hud.set({ ...TITLE_HUD, daily: this.dailyInfo(this.todaysDaily()) });
      return;
    }
    const showEnd = this.endedAt >= 0 && this.now - this.endedAt >= END_SCREEN_DELAY_MS;
    const hud = hudFor(
      this.screen,
      this.index + 1,
      this.levels.length,
      showEnd && !this.rewinding,
      this.rewinding,
    );
    this.hud.set({
      ...hud,
      testPlay: this.testing,
      tutorial: this.tutorial?.view ?? null,
      daily: this.dailyInfo(this.daily),
    });
  }

  // --- GameActions ------------------------------------------------------------------------------

  play(): void {
    this.testing = false;
    this.daily = null;
    this.mode = 'play';
    this.levels = BUILTIN_LEVELS.w1.length > 0 ? BUILTIN_LEVELS.w1 : FIXTURE_LEVELS;
    this.index = 0;
    this.replaceScreen();
  }

  playDaily(): void {
    const daily = this.todaysDaily();
    if (!daily) return;
    this.testing = false;
    this.daily = daily;
    this.mode = 'play';
    this.levels = [daily.level];
    this.index = 0;
    this.replaceScreen();
  }

  selectSkill(skill: SkillId): void {
    if (this.mode !== 'play') return;
    this.ps.skill = this.ps.skill === skill ? null : skill;
    this.publishHud();
  }

  togglePause(): void {
    if (this.mode !== 'play') return;
    this.ps.session.paused = !this.ps.session.paused;
    this.publishHud();
  }

  cycleSpeed(): void {
    if (this.mode !== 'play') return;
    const s = this.ps.session;
    const i = SPEEDS.indexOf(s.speed as (typeof SPEEDS)[number]);
    s.speed = SPEEDS[(i + 1) % SPEEDS.length] as number;
    this.publishHud();
  }

  release(direction: 1 | -1): void {
    if (this.mode !== 'play') return;
    this.ps.session.changeRelease(direction);
    this.publishHud();
  }

  popAll(): void {
    if (this.mode !== 'play') return;
    this.ps.session.popAll();
    this.publishHud();
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
    this.publishHud();
  }

  setInsets(top: number, bottom: number): void {
    this.insets = { top, bottom };
    if (this.mode === 'play') this.ps.camera.setInsets(top, bottom);
    this.editor?.setInsets(top, bottom);
  }

  // --- EditorActions ----------------------------------------------------------------------------

  openEditor(level?: LevelDef): void {
    this.screen?.destroy();
    this.screen = null;
    this.editor?.destroy();
    this.feedback = null;
    this.testing = false;
    this.mode = 'editor';
    this.editor = this.createEditor(level ?? loadDraft(getStore()) ?? undefined);
    this.daily = null;
    this.publishHud();
  }

  newLevel(): void {
    if (!this.editor) return;
    clearDraft(getStore());
    this.editor.destroy();
    this.editor = this.createEditor();
    this.publishHud();
  }

  private refreshMyLevels(): void {
    this.myLevelsList.set(this.myLevels.list());
  }

  toggleFavourite(id: string): void {
    this.myLevels.toggleFavourite(id);
    this.refreshMyLevels();
  }

  removeLevel(id: string): void {
    this.myLevels.remove(id);
    this.refreshMyLevels();
  }

  playMyLevel(id: string): void {
    const level = this.myLevels.level(id);
    if (!level) return;
    this.loaded = level;
    this.playLoaded();
  }

  editMyLevel(id: string): void {
    const level = this.myLevels.level(id);
    if (!level) return;
    const draft = { ...level };
    delete draft.solution;
    this.openEditor(draft);
  }

  shareLevel(id: string): Promise<ShareOutcome> {
    const e = this.myLevels.get(id);
    if (!e) return Promise.resolve('failed');
    return getSharer().share(e.code, e.title);
  }

  exitEditor(): void {
    if (!this.editor) return;
    this.editorDoc = null;
    this.mode = 'title';
    this.daily = null;
    this.replaceScreen();
  }

  setProps(patch: Partial<LevelProps>): void {
    this.editor?.doc.setProps(patch);
  }

  testPlay(): void {
    const ed = this.editor;
    if (!ed || !ed.doc.status.playable) return;
    const doc = ed.doc;
    ed.destroy();
    this.editor = null;
    this.editorView.set(null);
    this.testing = true;
    this.mode = 'play';
    this.daily = null;
    this.levels = [doc.level];
    this.index = 0;
    this.editorDoc = doc;
    this.replaceScreen();
  }

  backToEditor(): void {
    const doc = this.editorDoc;
    if (!this.testing || !doc) return;
    this.screen?.destroy();
    this.screen = null;
    this.feedback = null;
    this.testing = false;
    this.mode = 'editor';
    this.editor = this.createEditor(doc);
    this.publishHud();
  }

  publish(): string | null {
    if (!this.testing || !this.screen || !this.editorDoc) return null;
    const sim = this.screen.session.sim;
    if (!sim.ended || sim.saved < sim.level.required) return null;
    const level: LevelDef = { ...this.editorDoc.level, solution: exportSolution(sim) };
    // Publishing = solving: the code only exists when its own replay verifies.
    if (!verifyLevel(level).verified) return null;
    const code = encodeLevel(level);
    this.myLevels.add(code, 'mine');
    this.refreshMyLevels();
    return code;
  }

  copyText(text: string): Promise<boolean> {
    return getClipboard().write(text);
  }

  loadCode(text: string): CodeLoadResult {
    try {
      const { level, verify } = loadLevelCode(text);
      this.loaded = level;
      this.myLevels.add(text, 'received');
      this.refreshMyLevels();
      return {
        ok: true,
        title: level.title,
        author: level.author,
        verified: verify.verified,
        status: verify.status,
      };
    } catch (e) {
      this.loaded = null;
      return { ok: false, error: e instanceof LevelCodeError ? e.kind : 'unknown' };
    }
  }

  playLoaded(): void {
    if (!this.loaded) return;
    this.testing = false;
    this.daily = null;
    this.mode = 'play';
    this.levels = [this.loaded];
    this.index = 0;
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
    this.publishHud();
  }

  rewindEnd(): void {
    if (!this.rewinding) return;
    this.rewinding = false;
    this.publishHud();
  }

  tutorialOk(): void {
    this.tutorial?.ok();
    this.tutorial?.update(this.now);
    this.publishHud();
  }

  skipTutorial(): void {
    getStore().set(TUTORIAL_SKIPPED_KEY, '1');
    this.tutorial?.stop();
    this.tutorial = null;
    this.publishHud();
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
