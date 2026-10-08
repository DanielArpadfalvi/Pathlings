import { expect, test, type Page } from '@playwright/test';

interface Debug {
  tick: number;
  logLength: number;
  nuked: boolean;
  hud: { levelNumber: number; levelTitle: string; speed: number; paused: boolean };
  creatures: { id: number; x: number; y: number; state: number; popTimer: number }[];
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function info(page: Page): Promise<Debug> {
  return page.evaluate(() => {
    const d = (window as unknown as { __pathlings: Debug }).__pathlings;
    return {
      tick: d.tick,
      logLength: d.logLength,
      nuked: d.nuked,
      hud: d.hud,
      creatures: d.creatures,
    };
  });
}

/** Taps (synthesized touch) the body centre of creature `id`. */
async function tapCreature(page: Page, id: number): Promise<void> {
  await page.evaluate((cid) => {
    const d = (
      window as unknown as {
        __pathlings: {
          creatures: { x: number; y: number }[];
          toScreen(x: number, y: number): { x: number; y: number };
        };
      }
    ).__pathlings;
    const c = d.creatures[cid]!;
    const p = d.toScreen(c.x + 0.5, c.y - 5);
    const canvas = document.querySelector('#stage canvas')!;
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 71,
          clientX: p.x,
          clientY: p.y,
          bubbles: true,
          pointerType: 'touch',
        }),
      );
    }
  }, id);
}

/**
 * Plays a one-assignment reference solution through the UI: open paused at the solution's tick,
 * pick the skill on the skill bar, tap the creature, resume at 4× and wait for the end screen.
 */
async function playThroughUi(page: Page, levelId: string, tick: number, skill: string) {
  await page.goto(`/?level=${levelId}&seek=${tick}&pause=1&debug=1`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId(`skill-${skill}`).click();
  await expect(page.getByTestId(`skill-${skill}`)).toHaveAttribute('aria-pressed', 'true');
  await tapCreature(page, 0);
  expect((await info(page)).logLength).toBe(1);
  await page.getByTestId('pause').click(); // resume
  await page.getByTestId('speed').click(); // 2×
  await page.getByTestId('speed').click(); // 4×
  await expect(page.getByTestId('speed')).toHaveAttribute('data-speed', '4');
  const end = page.getByTestId('end-screen');
  await expect(end).toBeVisible({ timeout: 45_000 });
  return end;
}

for (const viewport of [
  { width: 360, height: 640 },
  { width: 412, height: 915 },
]) {
  test.describe(`hud ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test('HUD layout with a selected skill (screenshot for review)', async ({ page }, testInfo) => {
      const errors = collectErrors(page);
      await page.goto('/?level=crowd&seek=300&pause=1&debug=1');
      await page.getByTestId('skill-warden').click();
      await expect(page.getByTestId('hud-saved')).toContainText('0/1');
      for (const id of [
        'skill-scaler',
        'skill-delver',
        'pause',
        'speed',
        'rewind',
        'release-faster',
        'release-slower',
        'pop-all',
      ]) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box!.width, id).toBeGreaterThanOrEqual(44);
        expect(box!.height, id).toBeGreaterThanOrEqual(48);
      }
      await page.screenshot({ path: testInfo.outputPath(`hud-${viewport.width}.png`) });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('hud play', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('scripted solution through the UI reaches "level complete" (tunnel)', async ({
    page,
  }, testInfo) => {
    const errors = collectErrors(page);
    const end = await playThroughUi(page, 'test-tunnel', 152, 'burrower');
    await expect(end).toHaveAttribute('data-won', 'true');
    await expect(end.locator('.star-on')).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath('end-screen.png') });
    await page.getByTestId('next').click();
    await expect(page.getByTestId('end-screen')).toHaveCount(0);
    expect((await info(page)).hud.levelNumber).toBe(4);
    expect(errors).toEqual([]);
  });

  test('second level played through the UI (dig down)', async ({ page }) => {
    const end = await playThroughUi(page, 'test-dig-down', 161, 'delver');
    await expect(end).toHaveAttribute('data-won', 'true');
  });

  test('retry restarts the level', async ({ page }) => {
    await playThroughUi(page, 'test-tunnel', 152, 'burrower');
    await page.getByTestId('retry').click();
    await expect(page.getByTestId('end-screen')).toHaveCount(0);
    const d = await info(page);
    expect(d.logLength).toBe(0);
    expect(d.tick).toBeLessThan(120);
  });

  test('title screen Play → world map → level 1', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.getByTestId('play').click();
    await page.getByTestId('world-w1').click();
    await page.getByTestId('level-w1-01').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    expect((await info(page)).hud.levelNumber).toBe(1);
  });

  test('pause, speed and release controls', async ({ page }) => {
    await page.goto('/?level=test-walk-home&debug=1');
    await page.getByTestId('pause').click();
    const t0 = (await info(page)).tick;
    await page.waitForTimeout(300);
    expect((await info(page)).tick).toBe(t0);
    await expect(page.getByTestId('pause')).toHaveAttribute('aria-pressed', 'true');

    const speeds: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.getByTestId('speed').click();
      speeds.push((await page.getByTestId('speed').getAttribute('data-speed'))!);
    }
    expect(speeds).toEqual(['2', '4', '0.5', '1']);

    await expect(page.getByTestId('release-value')).toHaveText('1.0');
    await expect(page.getByTestId('release-slower')).toBeDisabled();
    await page.getByTestId('release-faster').click();
    await expect(page.getByTestId('release-value')).not.toHaveText('1.0');
    await expect(page.getByTestId('release-slower')).toBeEnabled();
  });

  test('pop all needs a 0.6 s hold and a confirming tap', async ({ page }) => {
    await page.goto('/?level=crowd&seek=300&pause=1&debug=1');
    const btn = page.getByTestId('pop-all');
    // A short press does nothing.
    await btn.hover();
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.up();
    await expect(btn).toHaveAttribute('data-state', 'idle');
    expect((await info(page)).nuked).toBe(false);
    // Hold 0.7 s: armed, but not yet popped.
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(btn).toHaveAttribute('data-state', 'armed');
    expect((await info(page)).nuked).toBe(false);
    // Confirming tap.
    await btn.click();
    await expect.poll(async () => (await info(page)).nuked).toBe(true);
    const d = await info(page);
    expect(d.creatures.every((c) => c.popTimer > 0)).toBe(true);
    await expect(btn).toBeDisabled();
  });
});
