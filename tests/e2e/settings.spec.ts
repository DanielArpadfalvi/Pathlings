import { expect, test, type Page } from '@playwright/test';

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
}

const htmlClass = (page: Page): Promise<string> =>
  page.evaluate(() => document.documentElement.className);

test.describe('settings', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('every setting has a visible effect and persists', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await page.goto('/?debug=1');
    await openSettings(page);
    const shot = (name: string) =>
      page.screenshot({ path: testInfo.outputPath(`setting-${name}.png`) });

    // Toggles that act on the whole overlay.
    for (const [id, cls] of [
      ['lefthanded', 'left-handed'],
      ['contrast', 'high-contrast'],
      ['largetext', 'large-text'],
    ] as const) {
      await page.getByTestId(`set-${id}`).check();
      expect(await htmlClass(page)).toContain(cls);
      await shot(id);
    }
    await page.getByTestId('set-motion-on').click();
    expect(await htmlClass(page)).toContain('reduce-motion');
    await shot('motion');

    // Language switches the UI at once.
    await page.getByTestId('set-language-hu').click();
    await expect(page.getByTestId('settings')).toContainText('Beállítások');
    await shot('language');
    await page.getByTestId('set-language-en').click();
    await expect(page.getByTestId('settings')).toContainText('Settings');

    // Sound and haptics.
    await page.getByTestId('set-master').fill('30');
    await expect(page.getByTestId('set-master')).toHaveAttribute('aria-valuetext', '30%');
    await page.getByTestId('set-haptics').uncheck();
    await shot('sound');

    // Play settings.
    await page.getByTestId('set-speed-2').click();
    await page.getByTestId('set-autopause').check();
    await page.getByTestId('set-radius-36').click();
    await expect(page.getByTestId('set-radius-36')).toHaveAttribute('aria-checked', 'true');
    await shot('play');
    await page.getByTestId('restart-tutorial').click();
    await expect(page.getByTestId('restart-tutorial')).toContainText('again');
    await page.getByTestId('restore-purchases').click();
    await expect(page.getByTestId('restore-purchases')).toContainText('No purchases');
    await page.getByTestId('settings-close').click();

    // Everything survives a reload.
    await page.reload();
    expect(await htmlClass(page)).toMatch(/left-handed.*high-contrast.*large-text.*reduce-motion/);
    await openSettings(page);
    await expect(page.getByTestId('set-haptics')).not.toBeChecked();
    await expect(page.getByTestId('set-master')).toHaveValue('30');
    await expect(page.getByTestId('set-speed-2')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('settings-close').click();

    // Speed, auto-pause and touch radius reach the game.
    await page.goto('/?level=test-walk-home&debug=1');
    await expect(page.getByTestId('speed')).toContainText('2×');
    const input = await page.evaluate(
      () => (window as unknown as { __pathlings: { input: unknown } }).__pathlings.input,
    );
    expect(input).toEqual({ touchRadius: 36, autoPause: true });
    await page.screenshot({ path: testInfo.outputPath('setting-in-game.png') });
  });

  test('the pause menu pauses, opens settings and resumes', async ({ page }) => {
    await page.goto('/?level=test-walk-home&debug=1');
    await page.getByTestId('exit').click();
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('pause-settings').click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await page.getByTestId('settings-close').click();
    await page.getByTestId('pause-resume').click();
    await expect(page.getByTestId('pause-menu')).toHaveCount(0);
    await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'false');
  });
});
