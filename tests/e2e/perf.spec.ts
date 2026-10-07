import { expect, test } from '@playwright/test';

/**
 * T3.4 performance probe: 100 creatures on the 640 × 960 stress level, whole level in view, game
 * at 4×, CPU throttled 4× (CDP). Average FPS over 20 s must stay ≥ 55. Skipped unless PERF=1 or
 * on CI (it takes ~30 s and needs a quiet machine).
 */
const RUN = !!process.env.CI || process.env.PERF === '1';

test.describe('performance', () => {
  test.skip(!RUN, 'set PERF=1 to run the 20-second FPS probe locally');
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('≥ 55 FPS with 100 creatures at 4× under 4× CPU throttling', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.goto('/?level=perf&debug=1');
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    await page.getByTestId('whole-level').click();
    for (let i = 0; i < 2; i++) await page.getByTestId('speed').click();
    await expect(page.getByTestId('speed')).toHaveAttribute('data-speed', '4');
    // Let the crowd come out before measuring.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __pathlings: { stats: { creaturesDrawn: number } } })
                .__pathlings.stats.creaturesDrawn,
          ),
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(90);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const result = await page.evaluate(
      () =>
        new Promise<{ fps: number; worstMs: number; creatures: number }>((resolve) => {
          const d = (window as unknown as { __pathlings: { stats: { creaturesDrawn: number } } })
            .__pathlings;
          const start = performance.now();
          let frames = 0;
          let last = start;
          let worst = 0;
          const tick = (now: number): void => {
            frames++;
            worst = Math.max(worst, now - last);
            last = now;
            if (now - start < 20_000) requestAnimationFrame(tick);
            else
              resolve({
                fps: (frames * 1000) / (now - start),
                worstMs: worst,
                creatures: d.stats.creaturesDrawn,
              });
          };
          requestAnimationFrame(tick);
        }),
    );
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    testInfo.annotations.push({ type: 'perf', description: JSON.stringify(result) });
    console.log('PERF', JSON.stringify(result));
    expect(result.creatures).toBeGreaterThanOrEqual(80);
    expect(result.fps).toBeGreaterThanOrEqual(55);
  });
});
