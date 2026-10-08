/// <reference types="node" />
/**
 * App icon, launch screens and store graphics, generated from code (T7.2; no bitmap assets in
 * the repo are hand-made). The Pathling is the in-game sprite (`src/render/creatureArt.ts`)
 * gliding under its leaf over Mossy Glade; colours come from `src/render/palette.ts`.
 *
 *   npx tsx scripts/make-assets.ts        # or: npm run assets
 *
 * Every image is rendered at its final size straight from SVG in Chromium (Playwright's), so the
 * pixel art stays crisp – nothing is downscaled. Native targets are found in the generated
 * Capacitor projects and rewritten at their existing sizes; opaque images lose the alpha channel
 * (the App Store rejects icons with alpha).
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { CREATURE_FRAMES, CREATURE_KEY } from '../src/render/creatureArt';
import { PALETTES } from '../src/render/palette';
import type { PixelGrid } from '../src/render/pixelArt';

const ROOT = join(import.meta.dirname, '..');
const RES = join(ROOT, 'android/app/src/main/res');
const IOS = join(ROOT, 'ios/App/App/Assets.xcassets');
const STORE = join(ROOT, 'store');

const GLADE = PALETTES.glade;
const SOIL = GLADE.materials[1]!;
/** The app's dark background (index.html theme colour, capacitor.config.ts). */
const NIGHT = 0x0b1020;
const ACCENT = 0x8fe36b;

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

// --- Drawing ------------------------------------------------------------------------------------

/** A pixel grid as SVG rectangles, top-left at (x, y), `px` units per pixel. */
function sprite(grid: PixelGrid, x: number, y: number, px: number): string {
  const out: string[] = [];
  grid.rows.forEach((row, r) => {
    // Merge horizontal runs of one colour into one rect (smaller SVG, no seams).
    let c = 0;
    while (c < row.length) {
      const ch = row[c]!;
      let end = c + 1;
      while (end < row.length && row[end] === ch) end++;
      const color = CREATURE_KEY[ch];
      if (ch !== '.' && color !== undefined) {
        out.push(
          `<rect x="${x + c * px}" y="${y + r * px}" width="${(end - c) * px}" height="${px}" fill="${hex(color)}"/>`,
        );
      }
      c = end;
    }
  });
  return `<g shape-rendering="crispEdges">${out.join('')}</g>`;
}

/**
 * A Pathling centred on (cx, cy), `px` units per pixel: facing the viewer with open arms (the
 * icon and splash) or gliding under its leaf (the feature graphic).
 */
function pathling(cx: number, cy: number, px: number, pose: 'hello' | 'glide' = 'hello'): string {
  const grid = (pose === 'glide' ? CREATURE_FRAMES.glide : CREATURE_FRAMES.warden)[0]!;
  const w = grid.rows[0]!.length * px;
  const h = grid.rows.length * px;
  return sprite(grid, Math.round(cx - w / 2), Math.round(cy - h / 2), px);
}

/** Mossy Glade backdrop: stepped sky gradient, a soft glow, grassy soil at the bottom. */
function glade(w: number, h: number, groundAt: number, px: number): string {
  const [top, bottom] = GLADE.sky;
  const bands = 8;
  const sky: string[] = [];
  for (let i = 0; i < bands; i++) {
    const y0 = Math.floor((i * groundAt) / bands);
    const y1 = Math.floor(((i + 1) * groundAt) / bands);
    sky.push(
      `<rect x="0" y="${y0}" width="${w}" height="${y1 - y0 + 1}" fill="${hex(mix(top, bottom, i / (bands - 1)))}"/>`,
    );
  }
  const ground: string[] = [
    `<rect x="0" y="${groundAt}" width="${w}" height="${h - groundAt}" fill="${hex(SOIL.shades[1])}"/>`,
    `<rect x="0" y="${groundAt}" width="${w}" height="${px}" fill="${hex(SOIL.highlight)}"/>`,
  ];
  // A deterministic speckle of soil shades (the in-game pattern, coarsely).
  let seed = 7;
  for (let y = groundAt + px * 2; y < h; y += px) {
    for (let x = 0; x < w; x += px) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      const k = seed >>> 28;
      if (k < 5) {
        ground.push(
          `<rect x="${x}" y="${y}" width="${px}" height="${px}" fill="${hex(SOIL.shades[k < 2 ? 0 : 2])}"/>`,
        );
      }
    }
  }
  return `
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.38" r="0.5">
      <stop offset="0" stop-color="${hex(ACCENT)}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${hex(ACCENT)}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g shape-rendering="crispEdges">${sky.join('')}</g>
  <rect width="${w}" height="${groundAt}" fill="url(#glow)"/>
  <g shape-rendering="crispEdges">${ground.join('')}</g>`;
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number): number => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * t) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/** Square app icon artwork at `s` px (full bleed; launchers / iOS apply their own mask). */
function iconSvg(s: number, round = false): string {
  const px = Math.max(1, Math.round(s / 17));
  const ground = Math.round(s * 0.8);
  // Feet on the grass.
  const body = `${glade(s, s, ground, Math.max(1, Math.round(px / 2)))}${pathling(s / 2, ground - px * 5.5, px)}`;
  if (!round) return svg(s, s, body);
  return svg(
    s,
    s,
    `<defs><clipPath id="c"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}"/></clipPath></defs><g clip-path="url(#c)">${body}</g>`,
  );
}

/** Android adaptive icon layers (108 dp canvas; launchers guarantee the inner 66 dp circle). */
function adaptiveForeground(s: number): string {
  return svg(s, s, pathling(s / 2, s / 2, Math.max(1, Math.round(s / 24))));
}

function adaptiveBackground(s: number): string {
  return svg(s, s, glade(s, s, Math.round(s * 0.78), Math.max(1, Math.round(s / 60))));
}

/** Launch screen: the Pathling and the title on the app's dark background. */
function splashSvg(w: number, h: number): string {
  const m = Math.min(w, h);
  const px = Math.max(1, Math.round(m / 45));
  const title = Math.round(m * 0.07);
  return svg(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${hex(NIGHT)}"/>
    ${pathling(w / 2, h / 2 - m * 0.06, px)}
    <text x="${w / 2}" y="${h / 2 + m * 0.16}" text-anchor="middle" font-family="system-ui, sans-serif"
      font-weight="800" font-size="${title}" letter-spacing="${title * 0.04}" fill="${hex(ACCENT)}">Pathlings</text>`,
  );
}

/** Play Store feature graphic (1024 × 500): a row of Pathlings gliding over the glade. */
function featureSvg(): string {
  const w = 1024;
  const h = 500;
  const px = 9;
  const crowd = [
    [180, 210],
    [330, 150],
    [512, 230],
    [690, 160],
    [850, 220],
  ]
    .map(([x, y]) => pathling(x!, y!, px, 'glide'))
    .join('');
  return svg(w, h, `${glade(w, h, 420, 6)}${crowd}`);
}

// --- Targets ------------------------------------------------------------------------------------

interface Job {
  file: string;
  w: number;
  h: number;
  svg: string;
  transparent?: boolean;
}

function pngs(dir: string, pred: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(pred)
    .map((f) => join(dir, f));
}

async function sizeOf(file: string): Promise<{ w: number; h: number }> {
  const m = await sharp(file).metadata();
  return { w: m.width ?? 0, h: m.height ?? 0 };
}

const DENSITY: Record<string, number> = {
  ldpi: 0.75,
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};

async function jobs(): Promise<Job[]> {
  const out: Job[] = [
    { file: join(STORE, 'app-store-icon-1024.png'), w: 1024, h: 1024, svg: iconSvg(1024) },
    { file: join(STORE, 'play-icon-512.png'), w: 512, h: 512, svg: iconSvg(512) },
    { file: join(STORE, 'play-feature-graphic-1024x500.png'), w: 1024, h: 500, svg: featureSvg() },
  ];
  // iOS: one 1024 icon, the launch image set.
  out.push({
    file: join(IOS, 'AppIcon.appiconset/AppIcon-512@2x.png'),
    w: 1024,
    h: 1024,
    svg: iconSvg(1024),
  });
  for (const f of pngs(join(IOS, 'Splash.imageset'), (n) => n.endsWith('.png'))) {
    const { w, h } = await sizeOf(f);
    out.push({ file: f, w, h, svg: splashSvg(w, h) });
  }
  // Android: legacy + round launcher icons, adaptive layers, splash drawables.
  for (const [d, scale] of Object.entries(DENSITY)) {
    const dir = join(RES, `mipmap-${d}`);
    if (!existsSync(dir)) continue;
    const legacy = Math.round(48 * scale);
    const layer = Math.round(108 * scale);
    out.push({ file: join(dir, 'ic_launcher.png'), w: legacy, h: legacy, svg: iconSvg(legacy) });
    out.push({
      file: join(dir, 'ic_launcher_round.png'),
      w: legacy,
      h: legacy,
      svg: iconSvg(legacy, true),
      transparent: true,
    });
    out.push({
      file: join(dir, 'ic_launcher_foreground.png'),
      w: layer,
      h: layer,
      svg: adaptiveForeground(layer),
      transparent: true,
    });
    out.push({
      file: join(dir, 'ic_launcher_background.png'),
      w: layer,
      h: layer,
      svg: adaptiveBackground(layer),
    });
  }
  for (const d of readdirSync(RES).filter((n) => n.startsWith('drawable'))) {
    const f = join(RES, d, 'splash.png');
    if (!existsSync(f)) continue;
    const { w, h } = await sizeOf(f);
    out.push({ file: f, w, h, svg: splashSvg(w, h) });
  }
  return out;
}

/** Adaptive icons use the generated background layer instead of the template's colour. */
function writeAdaptiveXml(): void {
  const dir = join(RES, 'mipmap-anydpi-v26');
  if (!existsSync(dir)) return;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) writeFileSync(join(dir, f), xml);
}

function chromiumPath(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const candidate = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers', 'chromium');
  return existsSync(candidate) ? candidate : undefined;
}

async function main(): Promise<void> {
  const list = await jobs();
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  try {
    const page = await browser.newPage();
    for (const job of list) {
      mkdirSync(dirname(job.file), { recursive: true });
      await page.setViewportSize({ width: job.w, height: job.h });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">${job.svg}</body></html>`,
      );
      const shot = await page.screenshot({
        omitBackground: job.transparent ?? false,
        clip: { x: 0, y: 0, width: job.w, height: job.h },
      });
      const img = sharp(shot);
      await (job.transparent ? img : img.removeAlpha())
        .png({ compressionLevel: 9, palette: !job.transparent && job.w * job.h > 1_000_000 })
        .toFile(job.file);
      console.log(`${relative(ROOT, job.file)} ${job.w}×${job.h}`);
    }
  } finally {
    await browser.close();
  }
  writeAdaptiveXml();
}

await main();
