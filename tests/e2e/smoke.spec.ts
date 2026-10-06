import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 412, height: 915 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    // Software WebGL is slow at mobile DPR; render at 1x.
    test.use({ viewport, deviceScaleFactor: 1 });

    test('page loads with a full-viewport canvas, overlay and no console errors', async ({
      page,
    }, testInfo) => {
      const errors = collectErrors(page);
      await page.goto('/');
      await expect(page).toHaveTitle('Pathlings');
      await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');

      const canvas = page.locator('#stage canvas');
      await expect(canvas).toHaveCount(1);
      const box = await canvas.boundingBox();
      expect(box?.width ?? 0).toBeCloseTo(viewport.width, 0);
      expect(box?.height ?? 0).toBeCloseTo(viewport.height, 0);
      expect(box!.height).toBeGreaterThan(box!.width);
      await expect(canvas).toHaveCSS('image-rendering', 'pixelated');

      await expect(page.locator('#ui')).toBeAttached();
      await expect(page.getByTestId('title-card')).toContainText('Pathlings');

      await page.screenshot({ path: testInfo.outputPath(`smoke-${viewport.width}.png`) });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('high DPR', () => {
  test.use({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });

  test('canvas backing store follows the device pixel ratio', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    const size = await page
      .locator('#stage canvas')
      .evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height, cssW: c.clientWidth }));
    expect(size.cssW).toBe(360);
    expect(size.w).toBe(720);
    expect(size.h).toBe(1280);
    expect(errors).toEqual([]);
  });
});
