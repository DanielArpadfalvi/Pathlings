import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

/** A save where the first `n` levels of world 1 are solved with 2 stars. */
function seed(n: number): string {
  const levels: Record<string, unknown> = {};
  for (let i = 1; i <= n; i++) {
    levels[`w1-${String(i).padStart(2, '0')}`] = { stars: 2, fails: 0, solved: 'clean' };
  }
  return JSON.stringify({ v: 2, levels, tutorialSkipped: true });
}

test.describe('menu, world map and level select', () => {
  test('navigates menu → world → level → back, with locks and prices', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('world-map')).toBeVisible();
    await expect(page.getByTestId('world-w1')).toHaveAttribute('data-open', 'true');
    await expect(page.getByTestId('world-w2')).toHaveAttribute('data-open', 'false');

    // Locked world: every level locked, the paid half shows the price.
    await page.getByTestId('world-w3').click();
    await expect(page.getByTestId('level-w3-01')).toHaveAttribute('data-access', 'paid');
    await expect(page.getByTestId('level-w3-01')).toContainText('$');
    await page.getByTestId('level-w3-01').click();
    await expect(page.getByTestId('full-game-note')).toBeVisible();
    await page.getByTestId('full-game-note').getByRole('button').click();
    await page.getByTestId('menu-back').click();

    // Fresh start: levels 1–3 open, 4 locked (tapping it does nothing).
    await page.getByTestId('world-w1').click();
    await expect(page.getByTestId('level-w1-03')).toHaveAttribute('data-access', 'open');
    await expect(page.getByTestId('level-w1-04')).toHaveAttribute('data-access', 'locked');
    await page.getByTestId('level-w1-04').click({ force: true });
    await expect(page.getByTestId('level-select')).toBeVisible();

    await page.getByTestId('level-w1-02').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await page.getByTestId('tutorial-skip').click();
    await page.getByTestId('exit-level').click();
    await expect(page.getByTestId('level-select')).toHaveAttribute('data-world', 'w1');
    await page.getByTestId('menu-back').click();
    await page.getByTestId('menu-back').click();
    await expect(page.getByTestId('title-card')).toBeVisible();
  });

  test('progress from the save: the last level opens at 17, then world 2', async ({ page }) => {
    await page.addInitScript((save) => {
      if (!localStorage.getItem('pathlings.save')) localStorage.setItem('pathlings.save', save);
    }, seed(17));
    await page.goto('/');
    await page.getByTestId('play').click();
    await page.getByTestId('world-w1').click();
    await expect(page.getByTestId('level-w1-20')).toHaveAttribute('data-access', 'open');
    await expect(page.getByTestId('level-w1-17')).toHaveAttribute('data-access', 'solved');
    await page.getByTestId('menu-back').click();
    await expect(page.getByTestId('world-w2')).toHaveAttribute('data-open', 'false');
  });

  test('winning a level saves its stars and opens the next one', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript((save) => {
      if (!localStorage.getItem('pathlings.save')) localStorage.setItem('pathlings.save', save);
    }, seed(0));
    // The reference solution plays itself (autoplay test hook) through the normal play path.
    await page.goto('/?level=w1-01&autoplay=1');
    for (let i = 0; i < 2; i++) await page.getByTestId('speed').click();
    await expect(page.getByTestId('end-screen')).toHaveAttribute('data-won', 'true', {
      timeout: 60_000,
    });
    await page.getByTestId('end-menu').click();
    await expect(page.getByTestId('level-w1-01')).toHaveAttribute('data-access', 'solved');
    await expect(page.getByTestId('level-w1-04')).toHaveAttribute('data-access', 'open');
  });
});
