import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

test.describe('app lifecycle (web implementation of the native hooks)', () => {
  test('going to the background pauses a running level', async ({ page }) => {
    await page.goto('/?level=w1-09');
    await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Coming back keeps it paused: the player resumes when ready.
    await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
  });

  test('back closes a dialog first, then leaves the level, then walks the menus', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('play').click();
    await page.getByTestId('world-w1').click();
    await page.getByTestId('level-w1-02').click();
    await page.getByTestId('tutorial-skip').click();
    await page.getByTestId('settings').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
    await expect(page.getByTestId('hud')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('level-select')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('world-map')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('title-card')).toBeVisible();
  });
});
