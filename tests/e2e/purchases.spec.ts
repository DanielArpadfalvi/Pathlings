import { expect, test, type Page } from '@playwright/test';

/** Seeds the save with these levels solved. */
async function seed(page: Page, solved: string[], extra: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([ids, more]) => {
      const levels = Object.fromEntries(
        (ids as string[]).map((id) => [
          id,
          { stars: 1, bestSaved: 1, fails: 0, solved: true, clean: true },
        ]),
      );
      if (!localStorage.getItem('pathlings.save')) {
        localStorage.setItem('pathlings.save', JSON.stringify({ version: 2, levels, ...more }));
      }
    },
    [solved, extra] as const,
  );
}

const range = (w: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${w}-${String(from + i).padStart(2, '0')}`);
const FREE_DONE = [...range('w1', 1, 20), ...range('w2', 1, 10)];

test.describe('purchases and gates', () => {
  test.describe.configure({ timeout: 150_000 });

  test('free player: W2-11 locked, every editor object usable; a mock purchase unlocks all', async ({
    page,
  }) => {
    await seed(page, FREE_DONE);
    await page.goto('/?iap=mock');

    // The editor is never gated.
    await page.getByTestId('open-editor').click();
    await page.getByTestId('editor-tool-object').click();
    for (const type of ['entrance', 'exit', 'water', 'lava', 'trap', 'teleport', 'bounce']) {
      await expect(page.getByTestId(`editor-object-${type}`)).toBeEnabled();
    }
    await page.getByTestId('editor-back').click();

    await page.getByTestId('play').click();
    await expect(page.getByTestId('world-w3')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('world-w2').click();
    await expect(page.getByTestId('level-w2-11')).toHaveAttribute('data-state', 'paid');
    await page.getByTestId('level-w2-11').click();
    await expect(page.getByTestId('hud')).toHaveCount(0);
    await expect(page.getByTestId('offer')).toBeVisible();
    await page.getByTestId('offer-buy').click();
    await expect(page.getByTestId('offer')).toHaveCount(0);
    await expect(page.getByTestId('level-w2-11')).toHaveAttribute('data-state', 'open');
    await expect(page.getByTestId('paid-note')).toHaveCount(0);
    await page.getByTestId('level-w2-11').click();
    await expect(page.getByTestId('hud')).toBeVisible();

    // The unlock survives a reload even without the store.
    await page.goto('/');
    await page.getByTestId('play').click();
    await page.getByTestId('world-bonus').click();
    await expect(page.getByTestId('level-bonus-01')).toHaveAttribute('data-state', 'open');
  });

  test('a cancelled purchase unlocks nothing; restore brings back the full game', async ({
    page,
  }) => {
    await seed(page, FREE_DONE);
    await page.goto('/?iap=cancel');
    await page.getByTestId('play').click();
    await page.getByTestId('world-w2').click();
    await page.getByTestId('level-w2-11').click();
    await page.getByTestId('offer-buy').click();
    await expect(page.getByTestId('offer-message')).toContainText(/cancel/i);
    await page.getByTestId('offer-later').click();
    await expect(page.getByTestId('level-w2-11')).toHaveAttribute('data-state', 'paid');

    await page.goto('/?iap=owned');
    await page.getByTestId('open-settings').click();
    await page.getByTestId('restore-purchases').click();
    await expect(page.getByTestId('restore-purchases')).toContainText(/restored/i);
    await page.getByTestId('settings-close').click();
    await page.getByTestId('play').click();
    await page.getByTestId('world-w2').click();
    await expect(page.getByTestId('level-w2-11')).toHaveAttribute('data-state', 'open');
  });

  test('without a store the offer explains where to buy', async ({ page }) => {
    await seed(page, FREE_DONE);
    await page.goto('/');
    await page.getByTestId('play').click();
    await page.getByTestId('world-w2').click();
    await page.getByTestId('level-w2-11').click();
    await expect(page.getByTestId('offer')).toContainText(/iOS and Android/);
    await expect(page.getByTestId('offer-buy')).toHaveCount(0);
  });

  test('after winning W2-10 "Next" leads to the offer in the level select', async ({ page }) => {
    await seed(page, [...range('w1', 1, 20), ...range('w2', 1, 9)]);
    await page.goto('/?level=w2-10&autoplay=1&seek=20000&iap=mock');
    await expect(page.getByTestId('end-screen')).toHaveAttribute('data-won', 'true');
    await page.getByTestId('next').click();
    await expect(page.getByTestId('offer')).toBeVisible();
    await expect(page.getByTestId('level-select')).toHaveAttribute('data-world', 'w2');
    await page.getByTestId('offer-later').click();
    await expect(page.getByTestId('level-w2-10')).toHaveAttribute('data-state', 'solved');
  });
});
