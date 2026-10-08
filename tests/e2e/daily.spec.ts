import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

test.describe('daily level', () => {
  test('title offers the daily level with its modifier and opens it', async ({ page }) => {
    await page.goto('/?debug=1');
    const daily = page.getByTestId('play-daily');
    await expect(daily).toBeVisible();
    await expect(page.getByTestId('daily-modifier')).not.toBeEmpty();
    await daily.click();
    const badge = page.getByTestId('daily-badge');
    await expect(badge).toBeVisible();
    const today = new Date().toISOString().slice(0, 10);
    await expect(badge).toContainText(today);
  });

  test('a fixed date plays the same level and its reference solution wins', async ({ page }) => {
    test.setTimeout(90_000);
    // 2026-10-08: bonus-21 "Underpass" with one Burrower fewer.
    await page.goto('/?daily=2026-10-08&autoplay=1&debug=1');
    const badge = page.getByTestId('daily-badge');
    await expect(badge).toContainText('2026-10-08');
    await expect(badge).toContainText(/Burrower|Fúró/);
    for (let i = 0; i < 2; i++) await page.getByTestId('speed').click();
    const end = page.getByTestId('end-screen');
    await expect(end).toBeVisible({ timeout: 80_000 });
    await expect(end).toHaveAttribute('data-won', 'true');
    await expect(page.getByTestId('next')).toHaveCount(0);
  });
});
