import { expect, test, type Page } from '@playwright/test';

interface Debug {
  tick: number;
  logLength: number;
  hud: { paused: boolean; skills: Record<string, number> | null; rewinding: boolean };
  lastAttempt: { id: number; ok: boolean } | null;
}

async function info(page: Page): Promise<Debug> {
  return page.evaluate(() => {
    const d = (window as unknown as { __pathlings: Debug }).__pathlings;
    return { tick: d.tick, logLength: d.logLength, hud: d.hud, lastAttempt: d.lastAttempt };
  });
}

async function pointerOnCreature(page: Page, id: number, types: string[]): Promise<void> {
  await page.evaluate(
    ([cid, list]) => {
      const d = (
        window as unknown as {
          __pathlings: {
            creatures: { x: number; y: number }[];
            toScreen(x: number, y: number): { x: number; y: number };
          };
        }
      ).__pathlings;
      const c = d.creatures[cid as number]!;
      const p = d.toScreen(c.x + 0.5, c.y - 5);
      const canvas = document.querySelector('#stage canvas')!;
      for (const type of list as string[]) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 81,
            clientX: p.x,
            clientY: p.y,
            bubbles: true,
            pointerType: 'touch',
          }),
        );
      }
    },
    [id, types] as const,
  );
}

async function setSpeed(page: Page, speed: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    if ((await page.getByTestId('speed').getAttribute('data-speed')) === speed) return;
    await page.getByTestId('speed').click();
  }
  await expect(page.getByTestId('speed')).toHaveAttribute('data-speed', speed);
}

test.describe('rewind', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('make a fatal mistake, rewind 5 s, fix it, finish the level', async ({ page }, testInfo) => {
    // Tunnel: one Burrower; given at tick 100 it is wasted (the wall is still too far).
    await page.goto('/?level=test-tunnel&seek=100&pause=1&debug=1');
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    await page.getByTestId('skill-burrower').click();
    await pointerOnCreature(page, 0, ['pointerdown', 'pointerup']);
    let d = await info(page);
    expect(d.logLength).toBe(1);
    expect(d.hud.skills?.burrower).toBe(0);

    // Let the mistake play out for a while.
    await page.getByTestId('pause').click();
    await setSpeed(page, '4');
    await expect
      .poll(async () => (await info(page)).tick, { timeout: 20_000 })
      .toBeGreaterThan(400);
    await page.getByTestId('pause').click();

    // Hold rewind until we are back before the mistake (≥ 5 s = 300 ticks).
    const from = (await info(page)).tick;
    await page.getByTestId('rewind').hover();
    await page.mouse.down();
    await expect(page.getByTestId('rewind-badge')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('rewinding.png') });
    await expect.poll(async () => (await info(page)).tick, { timeout: 20_000 }).toBeLessThan(100);
    await page.mouse.up();
    await expect(page.getByTestId('rewind-badge')).toHaveCount(0);
    d = await info(page);
    expect(from - d.tick).toBeGreaterThanOrEqual(300);
    expect(d.logLength).toBe(0);
    expect(d.hud.skills?.burrower).toBe(1);
    expect(d.hud.paused).toBe(true);

    // Fix it: step precisely into the winning window (ticks 131–160), assign, finish fast.
    await page.evaluate((n) => {
      (window as unknown as { __pathlings: { step(n: number): void } }).__pathlings.step(n);
    }, 145 - d.tick);
    expect((await info(page)).tick).toBe(145);
    await pointerOnCreature(page, 0, ['pointerdown', 'pointerup']);
    expect((await info(page)).lastAttempt?.ok).toBe(true);
    await setSpeed(page, '4');
    await page.getByTestId('pause').click();
    const end = page.getByTestId('end-screen');
    await expect(end).toBeVisible({ timeout: 45_000 });
    await expect(end).toHaveAttribute('data-won', 'true');
  });

  test('auto-pause while selecting resumes after the assignment', async ({ page }) => {
    await page.goto('/?level=crowd&seek=300&autopause=1&skill=warden&debug=1');
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    await pointerOnCreature(page, 4, ['pointerdown']);
    await expect.poll(async () => (await info(page)).hud.paused).toBe(true);
    const t = (await info(page)).tick;
    await page.waitForTimeout(200);
    expect((await info(page)).tick).toBe(t);
    await pointerOnCreature(page, 4, ['pointerup']);
    expect((await info(page)).lastAttempt?.ok).toBe(true);
    await expect.poll(async () => (await info(page)).hud.paused).toBe(false);
  });
});
