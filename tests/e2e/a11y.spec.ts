import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility audit (T6.4): axe-core (WCAG 2.1 A/AA rules) on every main screen. The Pixi
 * canvas is the game world itself and is excluded; everything the player operates is DOM.
 */
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

async function audit(page: Page, name: string): Promise<void> {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('#stage')
    // The page zoom is off on purpose: pinch zooms the game camera. "Larger text" covers it.
    .disableRules(['meta-viewport'])
    .analyze();
  const found = r.violations.map((v) => ({
    screen: name,
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
  expect(found).toEqual([]);
}

test.describe('accessibility audit', () => {
  test('title, menus, settings', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('play')).toBeVisible();
    await audit(page, 'title');
    await page.getByTestId('play').click();
    await audit(page, 'world map');
    await page.getByTestId('world-w2').click();
    await audit(page, 'level select');
    await page.getByTestId('menu-back').click();
    await page.getByTestId('menu-back').click();
    await page.getByTestId('open-settings').click();
    await audit(page, 'settings');
    // Dialogs close with Escape (keyboard / switch access).
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
    await page.getByTestId('open-code').click();
    await audit(page, 'play a code');
  });

  test('level HUD, help, end screen', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      if (!localStorage.getItem('pathlings.save')) {
        localStorage.setItem(
          'pathlings.save',
          JSON.stringify({ v: 2, levels: { 'w1-09': { fails: 5 } }, tutorialSkipped: true }),
        );
      }
    });
    await page.goto('/?level=w1-09&autoplay=1');
    await expect(page.getByTestId('hud')).toBeVisible();
    await audit(page, 'hud');
    await page.getByTestId('help').click();
    await audit(page, 'help');
    await page.getByTestId('help-close').click();
    for (let i = 0; i < 2; i++) await page.getByTestId('speed').click();
    await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 60_000 });
    await audit(page, 'end screen');
  });

  test('editor', async ({ page }) => {
    await page.goto('/?editor=1');
    await expect(page.locator('.editor-tools')).toBeVisible();
    await audit(page, 'editor');
  });
});
