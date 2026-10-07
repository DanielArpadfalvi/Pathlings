import { expect, test } from '@playwright/test';

test.describe('tutorial', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('level 1 can be completed by following the hints only', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByTestId('play').click();

    // 1. Welcome bubble: "Got it".
    const bubble = page.getByTestId('tutorial-bubble');
    await expect(bubble).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('tutorial-welcome.png') });
    await page.getByTestId('tutorial-ok').click();

    // 2. The hand points at a skill button: tap the highlighted control.
    const hand = page.getByTestId('tutorial-hand');
    await expect(hand).toHaveAttribute('data-target', /^skill-/, { timeout: 30_000 });
    await page.screenshot({ path: testInfo.outputPath('tutorial-pick.png') });
    await page.locator('.tutorial-target').click();

    // 3. The hand points at a Pathling: tap where it points.
    await expect(hand).toHaveAttribute('data-target', 'creature');
    const x = Number(await hand.getAttribute('data-x'));
    const y = Number(await hand.getAttribute('data-y'));
    await page.screenshot({ path: testInfo.outputPath('tutorial-tap.png') });
    await page.evaluate(
      ([px, py]) => {
        const canvas = document.querySelector('#stage canvas')!;
        for (const type of ['pointerdown', 'pointerup']) {
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 99,
              clientX: px,
              clientY: py,
              bubbles: true,
              pointerType: 'touch',
            }),
          );
        }
      },
      [x, y],
    );

    // 4. The game resumes by itself; the level is won.
    const end = page.getByTestId('end-screen');
    await expect(end).toBeVisible({ timeout: 90_000 });
    await expect(end).toHaveAttribute('data-won', 'true');
  });

  test('the tutorial can be skipped and stays skipped', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('tutorial-bubble')).toBeVisible();
    await page.getByTestId('tutorial-skip').click();
    await expect(page.getByTestId('tutorial-bubble')).toHaveCount(0);
    await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await page.getByTestId('play').click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('tutorial-bubble')).toHaveCount(0);
  });
});
