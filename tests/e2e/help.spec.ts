import { expect, test, type Page } from '@playwright/test';

/** Loses bonus-01 once: without any skill the time runs out (seek past the 5-minute limit). */
async function loseOnce(page: Page): Promise<void> {
  await page.goto('/?level=bonus-01&seek=18100');
  await expect(page.getByTestId('end-screen')).toHaveAttribute('data-won', 'false');
}

test.describe('hints and solution viewer', () => {
  test('hints unlock after 3 fails, the solution replay after 5', async ({ page }) => {
    // Two full level loads plus a replay; each UI step is slow under software GL.
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await loseOnce(page);
    await page.getByTestId('end-help').click();
    await expect(page.getByTestId('hints-locked')).toBeVisible();
    await expect(page.getByTestId('watch-solution')).toBeDisabled();
    await page.getByTestId('help-close').click();

    // One real fail was counted; jump the counter to 3 more (the unit tests cover each step).
    const stored = await page.evaluate(() => localStorage.getItem('pathlings.save'));
    expect(JSON.parse(stored!).levels['bonus-01'].fails).toBe(1);
    await page.evaluate(() =>
      localStorage.setItem(
        'pathlings.save',
        JSON.stringify({ version: 2, levels: { 'bonus-01': { fails: 4 } } }),
      ),
    );
    await loseOnce(page);
    await page.getByTestId('end-help').click();
    await expect(page.getByTestId('hint-list').locator('li')).toHaveCount(1);
    await page.getByTestId('help-close').click();

    // The help button in the play HUD opens the same panel.
    await page.getByTestId('retry').click();
    await page.getByTestId('help').click();
    await expect(page.getByTestId('watch-solution')).toBeEnabled();
    await page.getByTestId('watch-solution').click();
    await expect(page.getByTestId('solution-badge')).toBeVisible();
    // Fast-forward the replay: 1× → 2× → 4×.
    await page.getByTestId('speed').click();
    await page.getByTestId('speed').click();
    await expect(page.getByTestId('end-screen')).toHaveAttribute('data-won', 'true', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('next')).toHaveCount(0);
    await page.getByTestId('retry').click();
    await expect(page.getByTestId('solution-badge')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
