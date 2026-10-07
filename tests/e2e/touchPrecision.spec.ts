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

/**
 * T9.4 touch precision: on the smallest and the largest supported phones a tap 10 pt beside a
 * crowd picks the edge Pathling on either side, and a tap outside the selection radius picks none.
 * (Inside an overlapping crowd the scoring breaks ties by direction – the loupe is for that.)
 */
for (const viewport of [
  { width: 320, height: 568 },
  { width: 430, height: 932 },
]) {
  test.describe(`touch precision ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, deviceScaleFactor: 2 });

    test('taps pick the intended Pathling in a crowd', async ({ page }) => {
      await page.goto('/?level=crowd&seek=300&pause=1&skill=warden&debug=1');
      await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
      const d0 = await info(page);
      const crowd = d0.creatures.filter((c) => c.state < 10).sort((a, b) => a.x - b.x);
      expect(crowd).toHaveLength(10);

      // 10 pt beside the crowd's edge picks the edge Pathling, on both sides.
      for (const edge of [crowd[crowd.length - 1]!, crowd[0]!]) {
        const before = await info(page);
        const c = await toScreen(page, edge.x + 0.5, edge.y - 5);
        await tap(page, c.x + (edge === crowd[0] ? -10 : 10), c.y);
        const after = await info(page);
        expect(after.lastAttempt).toEqual({ id: edge.id, skill: 'warden', ok: true });
        expect(after.logLength).toBe(before.logLength + 1);
      }

      // A tap well outside the 28 pt radius assigns nothing.
      const before = await info(page);
      const far = await toScreen(page, crowd[0]!.x + 0.5, crowd[0]!.y - 5);
      await tap(page, far.x - 60, far.y - 60);
      expect((await info(page)).logLength).toBe(before.logLength);
    });
  });
}
