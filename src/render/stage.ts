import { Application, TextureStyle } from 'pixi.js';
import { stageResolution } from './resolution';

/**
 * Creates the gameplay canvas: fills `host` (portrait viewport), renders at device pixel ratio
 * (CSS size stays in CSS px via `autoDensity`) and scales pixel art with nearest-neighbour.
 */
export async function createStage(host: HTMLElement): Promise<Application> {
  // Pixel-art terrain and sprites: never blur when zooming.
  TextureStyle.defaultOptions.scaleMode = 'nearest';

  const app = new Application();
  await app.init({
    resizeTo: host,
    background: 0x0b1020,
    antialias: false,
    roundPixels: true,
    resolution: stageResolution(window.devicePixelRatio || 1),
    autoDensity: true,
  });
  app.canvas.style.imageRendering = 'pixelated';
  app.canvas.style.touchAction = 'none';
  app.canvas.style.display = 'block';
  host.appendChild(app.canvas);
  return app;
}
