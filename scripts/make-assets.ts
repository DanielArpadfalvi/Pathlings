/**
 * App icon and splash screens drawn in code (T7.2; CLAUDE.md: no external bitmap assets).
 * The motif is the original Pathling (front view, leaf cap) on a mossy hill under a night sky,
 * built from the in-game sprite palette. Writes every icon / splash size the Capacitor Android and
 * iOS projects use, plus `public/icon-512.png` for the web. Run: `npm run assets`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { CREATURE_KEY } from '../src/render/creatureArt';

const ROOT = join(import.meta.dirname, '..');

// --- Minimal RGBA canvas + PNG encoder ------------------------------------------------------

interface Img {
  w: number;
  h: number;
  px: Uint8Array;
}

function img(w: number, h: number): Img {
  return { w, h, px: new Uint8Array(w * h * 4) };
}

function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function set(im: Img, x: number, y: number, c: [number, number, number], a = 255): void {
  if (x < 0 || y < 0 || x >= im.w || y >= im.h) return;
  const i = (y * im.w + x) * 4;
  const k = a / 255;
  const ka = im.px[i + 3]! / 255;
  const outA = k + ka * (1 - k);
  for (let j = 0; j < 3; j++) {
    const v = outA > 0 ? (c[j]! * k + im.px[i + j]! * ka * (1 - k)) / outA : 0;
    im.px[i + j] = Math.round(v);
  }
  im.px[i + 3] = Math.round(outA * 255);
}

function rect(im: Img, x: number, y: number, w: number, h: number, c: number, a = 255): void {
  const col = rgb(c);
  for (let yy = Math.max(0, y); yy < Math.min(im.h, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(im.w, x + w); xx++) set(im, xx, yy, col, a);
  }
}

function vGradient(im: Img, top: number, bottom: number): void {
  const a = rgb(top);
  const b = rgb(bottom);
  for (let y = 0; y < im.h; y++) {
    // Banded like the in-game sky (8 steps), not a smooth ramp.
    const t = Math.floor((y / im.h) * 8) / 7;
    const c: [number, number, number] = [0, 1, 2].map((j) =>
      Math.round(a[j]! + (b[j]! - a[j]!) * t),
    ) as [number, number, number];
    for (let x = 0; x < im.w; x++) set(im, x, y, c);
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

function png(im: Img, opaque = false): Buffer {
  const ch = opaque ? 3 : 4;
  const raw = Buffer.alloc((im.w * ch + 1) * im.h);
  for (let y = 0; y < im.h; y++) {
    const o = y * (im.w * ch + 1);
    raw[o] = 0;
    for (let x = 0; x < im.w; x++) {
      const i = (y * im.w + x) * 4;
      for (let j = 0; j < ch; j++) raw[o + 1 + x * ch + j] = im.px[i + j]!;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(im.w, 0);
  ihdr.writeUInt32BE(im.h, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

function save(rel: string, im: Img, opaque = false): void {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png(im, opaque));
  console.log(`  ${rel} (${im.w}×${im.h})`);
}

// --- The motif --------------------------------------------------------------------------------

/** Front-view Pathling, 9 × 12: leaf cap, round face, tunic. */
const HERO = [
  '...llg...',
  '..lllLl..',
  '.lLlllLl.',
  '.sssssss.',
  '.ssesess.',
  '.sssssss.',
  '..ssSss..',
  '.sbbbbbs.',
  '..bbbbb..',
  '..bBbBb..',
  '..f...f..',
  '.ff...ff.',
];

const SKY_TOP = 0x0b1020;
const SKY_BOTTOM = 0x2a3f6e;
const MOSS = 0x5cb83a;
const MOSS_LIGHT = 0xb6ef6a;
const SOIL = 0x7a4a26;
const SOIL_DARK = 0x5a3418;
const STAR = 0xfff1a8;

function drawHero(im: Img, cx: number, footY: number, scale: number): void {
  const w = HERO[0]!.length;
  const x0 = Math.round(cx - (w * scale) / 2);
  const y0 = footY - HERO.length * scale;
  HERO.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const c = CREATURE_KEY[ch];
      if (c !== undefined) rect(im, x0 + x * scale, y0 + y * scale, scale, scale, c);
    });
  });
}

/** Deterministic star field (integer hash, like the terrain noise). */
function stars(im: Img, cell: number, limitY: number): void {
  for (let gy = 0; gy * cell < limitY; gy++) {
    for (let gx = 0; gx * cell < im.w; gx++) {
      let h = Math.imul((gx * 73856093) ^ (gy * 19349663), 0x9e3779b1) >>> 0;
      h ^= h >>> 15;
      if (h % 5 !== 0) continue;
      const s = Math.max(1, Math.round(cell / 14));
      const x = gx * cell + (h % cell);
      const y = gy * cell + ((h >>> 8) % cell);
      rect(im, x, y, s, s, STAR, 120 + (h % 120));
    }
  }
}

/** Mossy hill: a stepped dome of soil with a grass top. */
function hill(im: Img, cx: number, topY: number, halfW: number, px: number): void {
  for (let y = topY; y < im.h; y += px) {
    const d = (y - topY) / px;
    const half = Math.min(im.w, halfW + d * d * px * 0.6);
    const x0 = Math.round((cx - half) / px) * px;
    const x1 = Math.round((cx + half) / px) * px;
    const c = d < 1 ? MOSS_LIGHT : d < 3 ? MOSS : (d >> 1) % 2 ? SOIL : SOIL_DARK;
    rect(im, x0, y, x1 - x0, px, c);
  }
}

/** The full square scene (icon): sky, stars, hill, Pathling. `pad` keeps the motif inside a
 * safe zone (adaptive icons crop up to a third of the edge). */
function scene(size: number, opts: { background: boolean; zoom?: number }): Img {
  const im = img(size, size);
  const zoom = opts.zoom ?? 1;
  const px = Math.max(1, Math.round((size / 48) * zoom));
  if (opts.background) {
    vGradient(im, SKY_TOP, SKY_BOTTOM);
    stars(im, Math.max(8, Math.round(size / 9)), Math.round(size * 0.55));
  }
  const ground = Math.round(size * (0.5 + 0.28 * zoom));
  hill(im, size / 2, ground, size * 0.2 * zoom, px);
  drawHero(im, size / 2, ground, px * 2);
  return im;
}

function roundMask(im: Img): Img {
  const r = im.w / 2;
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      if (dx * dx + dy * dy > r * r) im.px[(y * im.w + x) * 4 + 3] = 0;
    }
  }
  return im;
}

/** Splash: dark sky, the Pathling on its hill in the middle, scaled to the short side. */
function splash(w: number, h: number): Img {
  const im = img(w, h);
  vGradient(im, SKY_TOP, 0x18264a);
  stars(im, Math.max(10, Math.round(Math.min(w, h) / 12)), h);
  const s = Math.min(w, h);
  const px = Math.max(2, Math.round(s / 90));
  const ground = Math.round(h / 2 + s * 0.12);
  // Only the hill crest, not to the bottom edge: a floating island.
  const crest = img(w, Math.round(s * 0.12));
  hill(crest, w / 2, 0, s * 0.12, px);
  for (let y = 0; y < crest.h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (crest.px[i + 3]! > 0) {
        set(im, x, ground + y, [crest.px[i]!, crest.px[i + 1]!, crest.px[i + 2]!]);
      }
    }
  }
  drawHero(im, w / 2, ground, px * 2);
  return im;
}

// --- Outputs --------------------------------------------------------------------------------

const RES = 'android/app/src/main/res';
const DENSITIES: [string, number][] = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

console.log('Android icons');
for (const [d, size] of DENSITIES) {
  save(`${RES}/mipmap-${d}/ic_launcher.png`, scene(size, { background: true }));
  save(`${RES}/mipmap-${d}/ic_launcher_round.png`, roundMask(scene(size, { background: true })));
  // Adaptive foreground: 108 dp canvas, the motif inside the central 66 dp safe zone.
  const fg = Math.round((size * 108) / 48);
  save(
    `${RES}/mipmap-${d}/ic_launcher_foreground.png`,
    scene(fg, { background: false, zoom: 0.62 }),
  );
}
writeFileSync(
  join(ROOT, RES, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1B2A4E</color>\n</resources>\n`,
);

console.log('Android splash');
save(`${RES}/drawable/splash.png`, splash(480, 320), true);
for (const [d, w, h] of [
  ['mdpi', 320, 480],
  ['hdpi', 480, 800],
  ['xhdpi', 720, 1280],
  ['xxhdpi', 960, 1600],
  ['xxxhdpi', 1280, 1920],
] as const) {
  save(`${RES}/drawable-port-${d}/splash.png`, splash(w, h), true);
  save(`${RES}/drawable-land-${d}/splash.png`, splash(h, w), true);
}

console.log('iOS');
// The App Store icon must be opaque.
save(
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
  scene(1024, { background: true }),
  true,
);
const big = splash(2732, 2732);
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  save(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, big, true);
}

console.log('Web');
save('public/icon-512.png', scene(512, { background: true }), true);
save('public/favicon-64.png', scene(64, { background: true }), true);

console.log('Store');
// Google Play feature graphic (1024 × 500, opaque).
save('docs/store/feature-graphic.png', splash(1024, 500), true);
