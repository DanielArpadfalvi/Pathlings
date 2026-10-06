import { h, render } from 'preact';
import type { Application } from 'pixi.js';
import './ui/styles.css';
import { createStage } from './render/stage';
import { PlayScreen } from './app/playScreen';
import { ATTRACT_LEVEL_ID, type LaunchParams, parseLaunchParams } from './game/launchParams';
import { findTestLevel } from './levels/test';
import { App } from './ui/App';
import type { DirectionFilter } from './input/selection';
import { getLanguage } from './i18n';

/** Attract mode restarts the demo this long after the level ends. */
const ATTRACT_RESTART_MS = 2000;

function startLevel(app: Application, params: LaunchParams, attract: boolean): PlayScreen {
  const level =
    findTestLevel(params.levelId ?? ATTRACT_LEVEL_ID) ?? findTestLevel(ATTRACT_LEVEL_ID);
  if (!level) throw new Error('No test level available');
  return new PlayScreen(app, level, {
    autoplay: attract || params.autoplay ? level.solution : undefined,
    seek: attract ? 0 : params.seek,
    paused: !attract && params.paused,
    interactive: !attract,
    wholeLevel: attract,
    skill: params.skill,
    filter: params.filter,
  });
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
  let screen = startLevel(app, params, attract);
  let endedAt = -1;

  app.renderer.on('resize', (w: number, hgt: number) => screen.resize(w, hgt));
  app.ticker.add((ticker) => {
    const now = performance.now();
    screen.frame(ticker.deltaMS, now);
    if (attract && screen.session.sim.ended) {
      if (endedAt < 0) endedAt = now;
      else if (now - endedAt > ATTRACT_RESTART_MS) {
        screen.destroy();
        screen = startLevel(app, params, attract);
        endedAt = -1;
      }
    }
  });

  if (params.debug) {
    Object.defineProperty(window, '__pathlings', {
      value: {
        get tick() {
          return screen.session.sim.tick;
        },
        get stats() {
          return screen.renderer.stats;
        },
        get camera() {
          return { ...screen.camera.state, ...screen.camera.viewport };
        },
        get logLength() {
          return screen.session.sim.log.length;
        },
        get lastAttempt() {
          return screen.lastAttempt;
        },
        get press() {
          return screen.press;
        },
        pick(x: number, y: number) {
          return screen.pickAt(x, y);
        },
        toScreen(x: number, y: number) {
          return screen.camera.toScreen({ x, y });
        },
        get creatures() {
          return screen.session.sim.creatures.map((c) => ({
            id: c.id,
            x: c.x,
            y: c.y,
            state: c.state,
            dir: c.dir,
            skillsUsed: c.skillsUsed,
          }));
        },
      },
    });
  }

  render(
    h(App, {
      showTitle: attract,
      onWholeLevel: attract ? undefined : () => screen.toggleWholeLevel(),
      filter: params.filter,
      onFilterChange: attract
        ? undefined
        : (f: DirectionFilter) => {
            screen.filter = f;
          },
    }),
    ui,
  );
  root.dataset.ready = 'true';
}

void boot();
