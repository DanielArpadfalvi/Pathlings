import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('daily level', () => {
  test('the title card offers today’s daily level and plays it', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    const button = page.getByTestId('play-daily');
    await expect(button).toBeEnabled();
    await expect(page.getByTestId('daily-offer')).toContainText('·');
    await button.click();
    const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    await expect(page.getByTestId('daily-badge')).toContainText(today);
    await expect(page.getByTestId('hud')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a dated daily level replays its verified solution to a win', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?daily=2026-10-07&autoplay=1&seek=20000&debug=1');
    await expect(page.getByTestId('daily-badge')).toContainText('2026-10-07');
    await expect(page.getByTestId('end-screen')).toHaveAttribute('data-won', 'true');
    // A single daily level: no "next".
    await expect(page.getByTestId('next')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
