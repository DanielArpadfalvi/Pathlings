import { expect, test, type Page } from '@playwright/test';

interface CreatureInfo {
  id: number;
  x: number;
  y: number;
  state: number;
  dir: number;
  skillsUsed: number;
}

interface Debug {
  tick: number;
  logLength: number;
  creatures: CreatureInfo[];
  lastAttempt: { id: number; skill: string | null; ok: boolean } | null;
  press: { target: number | null; loupe: unknown; cancelled: boolean };
}

const WARDEN = 5;

async function info(page: Page): Promise<Debug> {
  return page.evaluate(() => {
    const d = (window as unknown as { __pathlings: Debug }).__pathlings;
    return {
      tick: d.tick,
      logLength: d.logLength,
      creatures: d.creatures,
      lastAttempt: d.lastAttempt,
      press: d.press,
    };
  });
}

async function toScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([wx, wy]) =>
      (
        window as unknown as {
          __pathlings: { toScreen(x: number, y: number): { x: number; y: number } };
        }
      ).__pathlings.toScreen(wx!, wy!),
    [x, y],
  );
}

async function pointer(page: Page, type: string, x: number, y: number, id = 61): Promise<void> {
  await page.evaluate(
    ([t, px, py, pid]) => {
      document.querySelector('#stage canvas')!.dispatchEvent(
        new PointerEvent(t as string, {
          pointerId: pid as number,
          clientX: px as number,
          clientY: py as number,
          bubbles: true,
          pointerType: 'touch',
        }),
      );
    },
    [type, x, y, id],
  );
}

async function tap(page: Page, x: number, y: number): Promise<void> {
  await pointer(page, 'pointerdown', x, y);
  await pointer(page, 'pointerup', x, y);
}

test.describe('smart selection', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test.beforeEach(async ({ page }) => {
    // Ten Pathlings in a 44-px pit, 4 px apart; paused – assignment works while paused.
    await page.goto('/?level=crowd&seek=300&pause=1&skill=warden&debug=1');
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  });

  test('tapping 10 pt beside a creature in a crowd of 10 assigns to it', async ({
    page,
  }, testInfo) => {
    const d0 = await info(page);
    expect(d0.creatures.filter((c) => c.state < 10)).toHaveLength(10);
    const xs = d0.creatures.map((c) => c.x);

    for (const side of ['right', 'left'] as const) {
      const before = await info(page);
      // The outermost creature of the crowd on that side; tap 10 pt further out from its centre.
      const free = before.creatures.filter((c) => c.skillsUsed === 0);
      const edge = free.reduce((a, c) => ((side === 'right' ? c.x > a.x : c.x < a.x) ? c : a));
      const centre = await toScreen(page, edge.x + 0.5, edge.y - 5);
      const tx = centre.x + (side === 'right' ? 10 : -10);
      await tap(page, tx, centre.y);
      const after = await info(page);
      expect(after.lastAttempt).toEqual({ id: edge.id, skill: 'warden', ok: true });
      expect(after.creatures[edge.id]!.state).toBe(WARDEN);
      expect(after.logLength).toBe(before.logLength + 1);
    }
    expect((await info(page)).tick).toBe(300);
    expect(xs).toEqual(d0.creatures.map((c) => c.x));
    await page.screenshot({ path: testInfo.outputPath('selection-wardens.png') });
  });

  test('the pre-highlight under the finger is the creature that gets the skill', async ({
    page,
  }) => {
    const d0 = await info(page);
    const c = d0.creatures[5]!;
    const p = await toScreen(page, c.x + 0.5, c.y - 5);
    await pointer(page, 'pointerdown', p.x, p.y);
    const highlighted = (await info(page)).press.target;
    expect(highlighted).not.toBeNull();
    await pointer(page, 'pointerup', p.x, p.y);
    const d1 = await info(page);
    expect(d1.lastAttempt?.id).toBe(highlighted);
    expect(d1.lastAttempt?.ok).toBe(true);
  });

  test('hold opens the loupe; dragging out of it cancels', async ({ page }, testInfo) => {
    const d0 = await info(page);
    const c = d0.creatures[4]!;
    const p = await toScreen(page, c.x + 0.5, c.y - 5);
    await pointer(page, 'pointerdown', p.x, p.y);
    await expect.poll(async () => (await info(page)).press.loupe).not.toBeNull();
    await page.screenshot({ path: testInfo.outputPath('selection-loupe.png') });
    await pointer(page, 'pointermove', p.x, p.y - 90);
    expect((await info(page)).press.cancelled).toBe(true);
    await pointer(page, 'pointerup', p.x, p.y - 90);
    const d1 = await info(page);
    expect(d1.logLength).toBe(0);
    expect(d1.lastAttempt).toBeNull();
  });

  test('direction filter: only creatures walking left can be picked', async ({ page }) => {
    const d0 = await info(page);
    const rightWalker = d0.creatures.find((c) => c.dir > 0)!;
    const p = await toScreen(page, rightWalker.x + 0.5, rightWalker.y - 5);
    await page.getByTestId('direction-filter').click(); // both → left
    await expect(page.getByTestId('direction-filter')).toHaveAttribute('data-filter', 'left');
    await tap(page, p.x, p.y);
    const d1 = await info(page);
    expect(d1.lastAttempt?.ok).toBe(true);
    const picked = d1.creatures[d1.lastAttempt!.id]!;
    expect(d0.creatures[picked.id]!.dir).toBe(-1);
  });

  test('a tap on empty ground assigns nothing', async ({ page }) => {
    await tap(page, 195, 300);
    const d = await info(page);
    expect(d.logLength).toBe(0);
    expect(d.lastAttempt).toBeNull();
  });
});
