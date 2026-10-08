import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

interface PlayInfo {
  autoPause: boolean;
  selectRadius: number;
  speed: number;
  highContrast: boolean;
  reducedMotion: boolean;
}

function play(page: Page): Promise<PlayInfo> {
  return page.evaluate(
    () => (window as unknown as { __pathlings: { play: PlayInfo } }).__pathlings.play,
  );
}

async function openSettingsInLevel(page: Page): Promise<void> {
  await page.getByTestId('settings').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
}

test.describe('settings', () => {
  test('every setting has a visible effect and survives a reload', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto('/?level=w1-09&debug=1');
    const shot = (name: string) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) });

    // Opening the settings in a level pauses it.
    await openSettingsInLevel(page);
    await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');
    await shot('settings-panel');

    // Toggles: each flips its effect at once.
    const html = page.locator('html');
    await page.getByTestId('setting-leftHanded').click();
    await expect(html).toHaveClass(/left-handed/);
    await page.getByTestId('setting-highContrast').click();
    await expect(html).toHaveClass(/high-contrast/);
    expect((await play(page)).highContrast).toBe(true);
    await page.getByTestId('setting-largeText').click();
    await expect(html).toHaveClass(/large-text/);
    await page.getByTestId('setting-autoPause').click();
    expect((await play(page)).autoPause).toBe(true);
    await page.getByTestId('setting-haptics').click();
    await expect(page.getByTestId('setting-haptics')).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('setting-touchRadius').locator('[data-value="36"]').click();
    expect((await play(page)).selectRadius).toBe(36);
    await page.getByTestId('setting-speed').locator('[data-value="2"]').click();
    await page.getByTestId('setting-reducedMotion').locator('[data-value="true"]').click();
    await page.getByTestId('setting-music').fill('20');
    await page.getByTestId('setting-language').locator('[data-value="hu"]').click();
    await expect(page.getByTestId('settings-panel').locator('h2')).toHaveText('Beállítások');
    await expect(html).toHaveAttribute('lang', 'hu');
    await shot('settings-changed');
    await page.getByTestId('settings-close').click();
    await shot('level-with-settings');

    // Reload: everything is still set, and the new level starts with it.
    await page.reload();
    await expect(html).toHaveClass(/left-handed/);
    await expect(html).toHaveClass(/high-contrast/);
    await expect(html).toHaveClass(/large-text/);
    await expect(html).toHaveAttribute('lang', 'hu');
    await expect
      .poll(() => play(page))
      .toEqual({
        autoPause: true,
        selectRadius: 36,
        speed: 2,
        highContrast: true,
        reducedMotion: true,
      });
    await openSettingsInLevel(page);
    await expect(page.getByTestId('setting-haptics')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('setting-music')).toHaveValue('20');
    await page.getByTestId('restart-tutorial').click();
    await expect(page.getByTestId('settings-note')).toBeVisible();
    await page.getByTestId('restore-purchases').click();
    await expect(page.getByTestId('settings-note')).toContainText(/visszaállítható|restore/);
  });

  test('the title screen opens the settings too', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();
    await page.getByTestId('setting-language').locator('[data-value="en"]').click();
    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('play')).toHaveText('Play');
  });
});
