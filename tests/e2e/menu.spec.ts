import { expect, test, type Page } from '@playwright/test';

/** Seeds the save with these levels solved (1 star each). */
async function seed(page: Page, solved: string[]): Promise<void> {
  await page.addInitScript((ids) => {
    const levels = Object.fromEntries(
      ids.map((id) => [id, { stars: 1, bestSaved: 1, fails: 0, solved: true, clean: true }]),
    );
    localStorage.setItem('pathlings.save', JSON.stringify({ version: 2, levels }));
  }, solved);
}

const range = (w: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${w}-${String(from + i).padStart(2, '0')}`);

test.describe('menu', () => {
  test('menu → world → level → back', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await seed(page, ['w1-01']);
    await page.goto('/');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('world-map')).toBeVisible();
    await expect(page.getByTestId('world-w2')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('world-w1').click();
    const select = page.getByTestId('level-select');
    await expect(select).toHaveAttribute('data-world', 'w1');
    await expect(page.getByTestId('level-w1-01')).toHaveAttribute('data-state', 'solved');
    await expect(page.getByTestId('level-w1-04')).toHaveAttribute('data-state', 'open');
    await expect(page.getByTestId('level-w1-05')).toHaveAttribute('data-state', 'locked');
    await page.screenshot({ path: testInfo.outputPath('level-select.png') });

    // A locked level does nothing.
    await page.getByTestId('level-w1-05').click({ force: true });
    await expect(select).toBeVisible();

    await page.getByTestId('level-w1-03').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await page.getByTestId('exit').click();
    await expect(select).toHaveAttribute('data-world', 'w1');
    await page.getByTestId('menu-back').click();
    await expect(page.getByTestId('world-map')).toBeVisible();
    await page.getByTestId('menu-back').click();
    await expect(page.getByTestId('title-card')).toBeVisible();
  });

  test('paid levels show a lock with the price and open the offer', async ({ page }) => {
    await seed(page, [...range('w1', 1, 20), ...range('w2', 1, 10)]);
    await page.goto('/');
    await page.getByTestId('play').click();
    await page.getByTestId('world-w2').click();
    await expect(page.getByTestId('level-w2-10')).toHaveAttribute('data-state', 'solved');
    await expect(page.getByTestId('level-w2-11')).toHaveAttribute('data-state', 'paid');
    await expect(page.getByTestId('paid-note')).toContainText('$');
    await page.getByTestId('level-w2-11').click();
    await expect(page.getByTestId('offer')).toBeVisible();
    await page.getByTestId('offer-later').click();
    await expect(page.getByTestId('offer')).toHaveCount(0);
    await expect(page.getByTestId('level-select')).toBeVisible();
  });
});
