import { expect, test } from '@playwright/test';

test.describe('level-code links', () => {
  test('a /l#PL1-… link opens "Play a code" with the level verified', async ({ page }) => {
    // A valid code of a fixture level (debug hook).
    await page.goto('/?debug=1');
    const code = await page.evaluate(() =>
      (window as unknown as { __pathlings: { testCode(id: string): string } }).__pathlings.testCode(
        'test-tunnel',
      ),
    );
    await page.goto(`/l/#${code}`);
    await expect(page).toHaveURL(/#PL1-/);
    await expect(page.getByTestId('code-panel')).toBeVisible();
    await expect(page.getByTestId('code-input')).toHaveValue(code);
    await expect(page.getByTestId('code-result')).toHaveAttribute('data-verified', 'true');
    await page.getByTestId('code-play').click();
    await expect(page.getByTestId('hud')).toBeVisible();
  });

  test('Escape works as system back', async ({ page }) => {
    await page.goto('/?level=test-walk-home');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toHaveCount(0);
  });
});
