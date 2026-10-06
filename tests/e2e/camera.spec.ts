import { expect, test, type Page } from '@playwright/test';

interface Cam {
  cx: number;
  cy: number;
  scale: number;
  w: number;
  h: number;
}

async function camera(page: Page): Promise<Cam> {
  return page.evaluate(
    () => (window as unknown as { __pathlings: { camera: Cam } }).__pathlings.camera,
  );
}

async function simInfo(page: Page): Promise<{ tick: number; log: number; creatures: string }> {
  return page.evaluate(() => {
    const d = (
      window as unknown as {
        __pathlings: { tick: number; logLength: number; creatures: unknown[] };
      }
    ).__pathlings;
    return { tick: d.tick, log: d.logLength, creatures: JSON.stringify(d.creatures) };
  });
}

/** Dispatches synthesized touch pointer events on the canvas: [type, pointerId, x, y][]. */
async function pointers(page: Page, events: [string, number, number, number][]): Promise<void> {
  await page.evaluate((list) => {
    const canvas = document.querySelector('#stage canvas') as HTMLCanvasElement;
    for (const [type, id, x, y] of list) {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          clientX: x,
          clientY: y,
          bubbles: true,
          pointerType: 'touch',
        }),
      );
    }
  }, events);
}

test.describe('camera', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test.beforeEach(async ({ page }) => {
    await page.goto('/?level=showcase&seek=200&pause=1&debug=1');
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  });

  test('starts at the default zoom (~200 world px across)', async ({ page }) => {
    const c = await camera(page);
    expect(c.scale).toBeCloseTo(390 / 200);
  });

  test('pinch zooms and one-finger drag pans, without issuing any command', async ({
    page,
  }, testInfo) => {
    const sim0 = await simInfo(page);
    const c0 = await camera(page);

    // Pinch: two fingers spreading from 100 px to 200 px apart around (195, 500).
    const pinch: [string, number, number, number][] = [
      ['pointerdown', 21, 145, 500],
      ['pointerdown', 22, 245, 500],
    ];
    for (let i = 1; i <= 10; i++) {
      pinch.push(['pointermove', 21, 145 - i * 5, 500]);
      pinch.push(['pointermove', 22, 245 + i * 5, 500]);
    }
    pinch.push(['pointerup', 22, 295, 500], ['pointerup', 21, 95, 500]);
    await pointers(page, pinch);
    const c1 = await camera(page);
    expect(c1.scale).toBeCloseTo(Math.min(4, c0.scale * 2), 1);

    // One-finger drag up-left by 100 px: the view moves right/down in the world.
    const drag: [string, number, number, number][] = [['pointerdown', 31, 250, 600]];
    for (let i = 1; i <= 10; i++) drag.push(['pointermove', 31, 250 - i * 10, 600 - i * 10]);
    drag.push(['pointerup', 31, 150, 500]);
    await pointers(page, drag);
    const c2 = await camera(page);
    expect(c2.cx).toBeGreaterThan(c1.cx);
    expect(c2.cy).toBeGreaterThan(c1.cy);

    const sim1 = await simInfo(page);
    expect(sim1.log).toBe(0);
    expect(sim1).toEqual(sim0);
    await page.screenshot({ path: testInfo.outputPath('camera-zoomed.png') });
  });

  test('a tap within the dead zone does not pan', async ({ page }) => {
    const c0 = await camera(page);
    await pointers(page, [
      ['pointerdown', 41, 200, 400],
      ['pointermove', 41, 203, 402],
      ['pointerup', 41, 203, 402],
    ]);
    expect(await camera(page)).toEqual(c0);
  });

  test('double tap zooms in and back; whole-level button shows everything', async ({ page }) => {
    const c0 = await camera(page);
    const tap = (id: number): [string, number, number, number][] => [
      ['pointerdown', id, 195, 500],
      ['pointerup', id, 195, 500],
    ];
    await pointers(page, [...tap(51), ...tap(52)]);
    await expect.poll(async () => (await camera(page)).scale).toBeCloseTo(c0.scale * 2, 1);
    await pointers(page, [...tap(53), ...tap(54)]);
    await expect.poll(async () => (await camera(page)).scale).toBeCloseTo(c0.scale, 1);

    await page.getByTestId('whole-level').click();
    // The showcase is 160 × 240: the whole level fits at 390 / 160.
    await expect.poll(async () => (await camera(page)).scale).toBeCloseTo(390 / 160, 1);
    expect((await simInfo(page)).log).toBe(0);
  });
});
