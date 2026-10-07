import { expect, test, type Page } from '@playwright/test';

/**
 * T3.4 performance probe: 100 creatures on the 640 × 960 stress level, whole level in view, game
 * at 4×. Measures 10 s unthrottled, then 20 s with the CPU throttled 4× (CDP), and reports FPS
 * and the game's own JS time per frame as a CI notice annotation. Runs on CI or with PERF=1.
 * The ≥ 55 FPS gate is enforced with PERF_ENFORCE=1 (software-GL CI runners are measured first).
 */
const RUN = !!process.env.CI || process.env.PERF === '1';
const ENFORCE = process.env.PERF_ENFORCE === '1';

interface Sample {
  fps: number;
  worstMs: number;
  jsMs: number;
  creatures: number;
}

async function measure(page: Page, ms: number): Promise<Sample> {
  return page.evaluate(
    (duration) =>
      new Promise<Sample>((resolve) => {
        const d = (
          window as unknown as {
            __pathlings: { stats: { creaturesDrawn: number }; frameMs: number };
          }
        ).__pathlings;
        const start = performance.now();
        let frames = 0;
        let last = start;
        let worst = 0;
        const tick = (now: number): void => {
          frames++;
          worst = Math.max(worst, now - last);
          last = now;
          if (now - start < duration) requestAnimationFrame(tick);
          else
            resolve({
              fps: Math.round(((frames * 1000) / (now - start)) * 10) / 10,
              worstMs: Math.round(worst),
              jsMs: Math.round(d.frameMs * 100) / 100,
              creatures: d.stats.creaturesDrawn,
            });
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

test.describe('performance', () => {
  test.skip(!RUN, 'set PERF=1 to run the FPS probe locally');
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('100 creatures at 4× (FPS probe)', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto('/?level=perf&debug=1');
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    await page.getByTestId('whole-level').click();
    for (let i = 0; i < 2; i++) await page.getByTestId('speed').click();
    await expect(page.getByTestId('speed')).toHaveAttribute('data-speed', '4');
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

    const plain = await measure(page, 10_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const throttled = await measure(page, 20_000);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    const report = JSON.stringify({ plain, throttled });
    testInfo.annotations.push({ type: 'perf', description: report });
    // A workflow command: shows up as an annotation on the CI run (readable without log access).
    console.log(`::notice title=FPS probe::${report}`);
    expect(throttled.creatures).toBeGreaterThanOrEqual(80);
    if (ENFORCE) expect(throttled.fps).toBeGreaterThanOrEqual(55);
  });
});
