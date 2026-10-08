import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

async function tick(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __pathlings: { tick: number } }).__pathlings.tick,
  );
}

test.describe('hints and solution replay', () => {
  test('failed tries unlock the hints', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?level=w1-09&debug=1');
    await page.getByTestId('help').click();
    await expect(page.getByTestId('help-hints-locked')).toBeVisible();
    await expect(page.getByTestId('solution-locked')).toBeVisible();
    await page.getByTestId('help-close').click();
    // Restarting after 10 s of play counts as a failed try.
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('speed').click();
      await page.getByTestId('speed').click();
      await expect.poll(() => tick(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(600);
      await page.keyboard.press('r');
      await expect.poll(() => tick(page)).toBeLessThan(600);
    }
    await expect(page.getByTestId('help')).toHaveAttribute('data-unlocked', 'true');
    await page.getByTestId('help').click();
    await expect(page.getByTestId('help-hints').locator('li')).not.toHaveCount(0);
    await expect(page.getByTestId('solution-locked')).toContainText('2');
  });

  test('after five failed tries the solution replay opens and plays to the end', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      localStorage.setItem('pathlings.help.v1', JSON.stringify({ 'w1-09': { fails: 5 } }));
    });
    await page.goto('/?level=w1-09&debug=1');
    await page.getByTestId('help').click();
    await page.getByTestId('watch-solution').click();
    await expect(page.getByTestId('replay-badge')).toBeVisible();
    await expect(page.getByTestId('help')).toHaveCount(0);
    await page.getByTestId('speed').click();
    await page.getByTestId('speed').click();
    const end = page.getByTestId('replay-end');
    await expect(end).toBeVisible({ timeout: 60_000 });
    await end.getByTestId('retry').click();
    await expect(page.getByTestId('replay-badge')).toHaveCount(0);
    await expect(page.getByTestId('help')).toBeVisible();
    expect(await tick(page)).toBeLessThan(600);
    const stored = await page.evaluate(() => localStorage.getItem('pathlings.help.v1'));
    expect(JSON.parse(stored!)['w1-09']).toMatchObject({ fails: 5, watched: true });
  });
});
