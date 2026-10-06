import { expect, test, type Page } from '@playwright/test';

interface DebugHandle {
  tick: number;
  stats: { terrainUploads: number; lastUploadTexels: number; creaturesDrawn: number };
  creatures: { id: number; x: number; y: number; state: number }[];
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function debug(page: Page): Promise<DebugHandle> {
  return page.evaluate(() => {
    const d = (window as unknown as { __pathlings: DebugHandle }).__pathlings;
    return { tick: d.tick, stats: d.stats, creatures: d.creatures };
  });
}

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 412, height: 915 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`render ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test('showcase level: every material and object, frozen frame for review', async ({
      page,
    }, testInfo) => {
      const errors = collectErrors(page);
      await page.goto('/?level=showcase&seek=300&pause=1&debug=1');
      await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
      await expect(page.getByTestId('title-card')).toHaveCount(0);
      const d = await debug(page);
      expect(d.tick).toBe(300);
      expect(d.stats.creaturesDrawn).toBeGreaterThan(0);
      // Paused: the sim does not move.
      await page.waitForTimeout(300);
      expect((await debug(page)).tick).toBe(300);
      await page.screenshot({ path: testInfo.outputPath(`showcase-${viewport.width}.png`) });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('render live', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('a Burrower digging updates the terrain texture with partial uploads', async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto('/?level=test-tunnel&autoplay=1&debug=1');
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    // The solution assigns the Burrower at tick 152; wait until the tunnel is being dug.
    await expect
      .poll(async () => (await debug(page)).tick, { timeout: 20_000 })
      .toBeGreaterThan(260);
    const d = await debug(page);
    expect(d.stats.terrainUploads).toBeGreaterThan(0);
    expect(d.stats.creaturesDrawn).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('tunnel-live.png') });
    expect(errors).toEqual([]);
  });

  test('attract mode plays the demo level behind the title card', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?debug=1');
    await expect(page.getByTestId('title-card')).toBeVisible();
    await expect
      .poll(async () => (await debug(page)).stats.creaturesDrawn, { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
