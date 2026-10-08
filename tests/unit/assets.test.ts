import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

/** The code-generated icon / launch images are committed (T7.2: `npm run assets`). */
const ROOT = join(import.meta.dirname, '..', '..');

async function meta(rel: string) {
  const file = join(ROOT, rel);
  expect(existsSync(file), rel).toBe(true);
  return sharp(file).metadata();
}

describe('generated app assets', () => {
  it('iOS app icon: 1024 px, no alpha channel (App Store rule)', async () => {
    const m = await meta('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
    expect([m.width, m.height, m.hasAlpha]).toEqual([1024, 1024, false]);
  });

  it('store graphics have the store sizes', async () => {
    expect((await meta('store/app-store-icon-1024.png')).hasAlpha).toBe(false);
    const play = await meta('store/play-icon-512.png');
    expect([play.width, play.height]).toEqual([512, 512]);
    const feature = await meta('store/play-feature-graphic-1024x500.png');
    expect([feature.width, feature.height]).toEqual([1024, 500]);
  });

  it('Android launcher icons exist per density (legacy 48 dp, adaptive layers 108 dp)', async () => {
    const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    for (const [d, k] of Object.entries(densities)) {
      const dir = `android/app/src/main/res/mipmap-${d}`;
      expect((await meta(`${dir}/ic_launcher.png`)).width).toBe(Math.round(48 * k));
      expect((await meta(`${dir}/ic_launcher_foreground.png`)).hasAlpha).toBe(true);
      expect((await meta(`${dir}/ic_launcher_background.png`)).width).toBe(Math.round(108 * k));
    }
  });
});
