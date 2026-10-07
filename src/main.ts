import { h, render } from 'preact';
import './ui/styles.css';
import { createStage } from './render/stage';
import { GameApp } from './app/gameApp';
import { parseLaunchParams } from './game/launchParams';
import { App } from './ui/App';
import { installPlatform, platformReady } from './platform/install';
import { encodeLevel } from './core/code/levelCode';
import { findTestLevel } from './levels/test';
import { getLanguage, onLanguageChange, t } from './i18n';

/** Read-only diagnostics for e2e tests (`?debug=1`). */
function exposeDebug(game: GameApp): void {
  Object.defineProperty(window, '__pathlings', {
    value: {
      get tick() {
        return game.current.session.sim.tick;
      },
      get stats() {
        return game.current.renderer.stats;
      },
      get camera() {
        return { ...game.current.camera.state, ...game.current.camera.viewport };
      },
      get input() {
        return { touchRadius: game.current.touchRadius, autoPause: game.current.autoPause };
      },
      get logLength() {
        return game.current.session.sim.log.length;
      },
      get lastAttempt() {
        return game.current.lastAttempt;
      },
      get press() {
        return game.current.press;
      },
      get editor() {
        const ed = game.currentEditor;
        if (!ed) return null;
        const level = ed.doc.level;
        return {
          ops: level.ops,
          objects: level.objects,
          w: level.w,
          h: level.h,
          tool: ed.tool,
          selected: ed.selected,
          canUndo: ed.doc.canUndo,
          status: ed.doc.status,
        };
      },
      editorToScreen(x: number, y: number) {
        return game.currentEditor?.camera.toScreen({ x, y }) ?? null;
      },
      get frameMs() {
        return game.frameMs;
      },
      get renderMs() {
        return game.renderMs;
      },
      get hud() {
        return game.hud.get();
      },
      get nuked() {
        return game.current.session.sim.nuked;
      },
      /** Test hook: the level code of a built-in test level. */
      testCode(id: string) {
        const level = findTestLevel(id);
        return level ? encodeLevel(level) : null;
      },
      /** Test hook: simulate exactly `n` ticks now (the game should be paused). */
      step(n: number) {
        for (let i = 0; i < n; i++) game.current.session.stepOnce();
      },
      pick(x: number, y: number) {
        return game.current.pickAt(x, y);
      },
      toScreen(x: number, y: number) {
        return game.current.camera.toScreen({ x, y });
      },
      get creatures() {
        return game.current.session.sim.creatures.map((c) => ({
          id: c.id,
          x: c.x,
          y: c.y,
          state: c.state,
          dir: c.dir,
          skillsUsed: c.skillsUsed,
          popTimer: c.popTimer,
        }));
      },
    },
  });
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');
  if (!root || !stage || !ui) throw new Error('Missing #app, #stage or #ui root element');
  document.documentElement.lang = getLanguage();
  const params = parseLaunchParams(window.location.search);

  // Native implementations (storage, haptics, …) must be in place before the game reads its save.
  await installPlatform();
  const app = await createStage(stage);
  // The world itself is visual; screen readers get a name for it, the HUD carries the numbers.
  app.canvas.setAttribute('role', 'img');
  app.canvas.setAttribute('aria-label', t('app.canvas'));
  onLanguageChange(() => app.canvas.setAttribute('aria-label', t('app.canvas')));
  const game = new GameApp(app, params);
  if (params.debug) exposeDebug(game);

  render(
    h(App, {
      hud: game.hud,
      editor: game.editorView,
      myLevels: game.myLevelsList,
      menu: game.menu,
      settings: game.settings,
      linkCode: game.linkCode,
      purchases: game.purchaseState,
      actions: game,
    }),
    ui,
  );
  root.dataset.ready = 'true';
  void platformReady();
}

void boot();
