import { h, render } from 'preact';
import './ui/styles.css';
import { createStage } from './render/stage';
import { GameApp } from './app/gameApp';
import { parseLaunchParams } from './game/launchParams';
import { App } from './ui/App';
import { getLanguage } from './i18n';

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
      get logLength() {
        return game.current.session.sim.log.length;
      },
      get lastAttempt() {
        return game.current.lastAttempt;
      },
      get press() {
        return game.current.press;
      },
      get hud() {
        return game.hud.get();
      },
      get nuked() {
        return game.current.session.sim.nuked;
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

  const app = await createStage(stage);
  const game = new GameApp(app, params);
  if (params.debug) exposeDebug(game);

  render(h(App, { hud: game.hud, actions: game }), ui);
  root.dataset.ready = 'true';
}

void boot();
