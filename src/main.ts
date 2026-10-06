import { h, render } from 'preact';
import type { Application } from 'pixi.js';
import './ui/styles.css';
import { createStage } from './render/stage';
import { WorldRenderer } from './render/worldRenderer';
import { GameSession } from './game/session';
import { ATTRACT_LEVEL_ID, type LaunchParams, parseLaunchParams } from './game/launchParams';
import { findTestLevel } from './levels/test';
import { App } from './ui/App';
import { getLanguage } from './i18n';

/** Attract mode restarts the demo this long after the level ends. */
const ATTRACT_RESTART_MS = 2000;

interface Running {
  session: GameSession;
  renderer: WorldRenderer;
}

function startLevel(app: Application, params: LaunchParams, attract: boolean): Running {
  const level =
    findTestLevel(params.levelId ?? ATTRACT_LEVEL_ID) ?? findTestLevel(ATTRACT_LEVEL_ID);
  if (!level) throw new Error('No test level available');
  const autoplay = attract || params.autoplay ? level.solution : undefined;
  const session = new GameSession(level, { autoplay });
  const renderer = new WorldRenderer(session.sim);
  session.onStep((sim, events) => renderer.onStep(sim, events));
  if (!attract && params.seek > 0) session.seek(params.seek);
  session.paused = !attract && params.paused;
  app.stage.addChild(renderer.root);
  renderer.layout(app.screen.width, app.screen.height);
  renderer.render(session.alpha, 0);
  return { session, renderer };
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');
  if (!root || !stage || !ui) throw new Error('Missing #app, #stage or #ui root element');
  document.documentElement.lang = getLanguage();
  const params = parseLaunchParams(window.location.search);
  const attract = params.levelId === null;

  const app = await createStage(stage);
  let run = startLevel(app, params, attract);
  let endedAt = -1;

  app.renderer.on('resize', (w: number, hgt: number) => run.renderer.layout(w, hgt));
  app.ticker.add((ticker) => {
    const now = performance.now();
    run.session.frame(ticker.deltaMS);
    run.renderer.render(run.session.alpha, now);
    if (attract && run.session.sim.ended) {
      if (endedAt < 0) endedAt = now;
      else if (now - endedAt > ATTRACT_RESTART_MS) {
        run.renderer.destroy();
        run = startLevel(app, params, attract);
        endedAt = -1;
      }
    }
  });

  if (params.debug) {
    Object.defineProperty(window, '__pathlings', {
      value: {
        get tick() {
          return run.session.sim.tick;
        },
        get stats() {
          return run.renderer.stats;
        },
        get creatures() {
          return run.session.sim.creatures.map((c) => ({
            id: c.id,
            x: c.x,
            y: c.y,
            state: c.state,
          }));
        },
      },
    });
  }

  render(h(App, { showTitle: attract }), ui);
  root.dataset.ready = 'true';
}

void boot();
