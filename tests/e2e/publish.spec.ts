import { expect, test, type Page } from '@playwright/test';

interface Debug {
  tick: number;
  logLength: number;
  creatures: { id: number; x: number; y: number; state: number }[];
  hud: { mode: string; testPlay: boolean; levelTitle: string };
  editor: { objects: { type: string; x: number; y: number }[]; h: number } | null;
}

async function info(page: Page): Promise<Debug> {
  return page.evaluate(() => {
    const d = (window as unknown as { __pathlings: Debug }).__pathlings;
    let tick = -1;
    let logLength = -1;
    let creatures: Debug['creatures'] = [];
    try {
      tick = d.tick;
      logLength = d.logLength;
      creatures = d.creatures;
    } catch {
      // in the editor there is no play screen
    }
    return { tick, logLength, creatures, hud: d.hud, editor: d.editor };
  });
}

/** Synthesized touch drag in editor world coordinates. */
async function editorDrag(page: Page, pts: [number, number][]): Promise<void> {
  await page.evaluate((list) => {
    const d = (
      window as unknown as {
        __pathlings: { editorToScreen(x: number, y: number): { x: number; y: number } };
      }
    ).__pathlings;
    const canvas = document.querySelector('#stage canvas')!;
    const send = (type: string, wx: number, wy: number): void => {
      const p = d.editorToScreen(wx, wy);
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 95,
          clientX: p.x,
          clientY: p.y,
          bubbles: true,
          pointerType: 'touch',
        }),
      );
    };
    list.forEach(([x, y], i) => send(i === 0 ? 'pointerdown' : 'pointermove', x, y));
    const last = list[list.length - 1]!;
    send('pointerup', last[0], last[1]);
  }, pts);
}

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
          pointerId: 96,
          clientX: p.x,
          clientY: p.y,
          bubbles: true,
          pointerType: 'touch',
        }),
      );
    }
  }, id);
}

test.describe('publish flow', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  test('build → test-play → solve → copy code → paste on "Play a code" → verified', async ({
    page,
  }, testInfo) => {
    await page.goto('/?debug=1');
    await page.getByTestId('open-editor').click();
    await expect(page.getByTestId('editor')).toBeVisible();

    // Properties: a title, and everybody must come home.
    await page.getByTestId('editor-props').click();
    await page.getByTestId('prop-title').fill('Wall test');
    await page.getByTestId('prop-title').dispatchEvent('change');
    for (let i = 0; i < 5; i++) {
      await page.getByTestId('prop-required').getByRole('button', { name: /\+$/ }).click();
    }
    await expect(page.getByTestId('prop-required-value')).toHaveText('10');
    await page.getByTestId('prop-done').click();

    // Build: a soil wall between entrance and exit (the floor is at y = 440).
    await page.getByTestId('editor-tool-shape').click();
    await editorDrag(page, [
      [150, 405],
      [157, 439],
    ]);
    await expect(page.getByTestId('editor-status')).toHaveAttribute('data-playable', 'true');

    // Test play: pause, step until the first Pathling nears the wall, give it the Burrower.
    await page.getByTestId('editor-test').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    expect((await info(page)).hud.testPlay).toBe(true);
    await page.getByTestId('pause').click();
    await page.evaluate(() => {
      const d = (
        window as unknown as {
          __pathlings: { step(n: number): void; creatures: { x: number; state: number }[] };
        }
      ).__pathlings;
      for (let i = 0; i < 2000; i++) {
        const c = d.creatures[0];
        if (c && c.state === 0 && c.x >= 141) return;
        d.step(1);
      }
    });
    await page.getByTestId('skill-burrower').click();
    await tapCreature(page, 0);
    expect((await info(page)).logLength).toBe(1);
    await page.getByTestId('speed').click();
    await page.getByTestId('speed').click();
    await page.getByTestId('pause').click();
    const end = page.getByTestId('end-screen');
    await expect(end).toBeVisible({ timeout: 60_000 });
    await expect(end).toHaveAttribute('data-won', 'true');

    // Publish: the code appears; copy it to the clipboard.
    await page.getByTestId('publish-level').click();
    const code = await page.getByTestId('publish-code').inputValue();
    expect(code).toMatch(/^PL1-[A-Za-z0-9_-]+$/);
    await page.getByTestId('publish-copy').click();
    await expect(page.getByTestId('publish-copy')).toHaveText(/Copied|Kimásolva/);
    await page.screenshot({ path: testInfo.outputPath('publish.png') });
    await page.getByTestId('publish-close').click();

    // Back through the editor to the title screen.
    await page.getByTestId('edit').click();
    await expect(page.getByTestId('editor')).toBeVisible();
    await page.getByTestId('editor-back').click();

    // "Play a code": paste from the clipboard → verified → play.
    await page.getByTestId('open-code').click();
    await page.getByTestId('code-paste').click();
    await expect(page.getByTestId('code-input')).toHaveValue(code);
    const result = page.getByTestId('code-result');
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute('data-verified', 'true');
    await expect(result).toContainText('Wall test');
    await page.getByTestId('code-play').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    const d = await info(page);
    expect(d.hud.levelTitle).toBe('Wall test');
    expect(d.hud.testPlay).toBe(false);
  });

  test('a damaged code is rejected with a message', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.getByTestId('open-code').click();
    await page.getByTestId('code-input').fill('PL1-thisisnotarealcodeatall');
    await page.getByTestId('code-load').click();
    await expect(page.getByTestId('code-error')).toBeVisible();
    await expect(page.getByTestId('code-play')).toHaveCount(0);
  });

  test('a level that was not won cannot be published', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.getByTestId('open-editor').click();
    // Wall the exit off completely with metal, then test-play at 4× until the time runs out.
    await page.getByTestId('editor-tool-shape').click();
    await page.getByTestId('editor-material-3').click();
    await editorDrag(page, [
      [150, 300],
      [160, 439],
    ]);
    await page.getByTestId('editor-props').click();
    // 5:00 → 2:00 in 15-second steps.
    for (let i = 0; i < 12; i++) {
      await page.getByTestId('prop-time').getByRole('button', { name: /−$/ }).click();
    }
    await expect(page.getByTestId('prop-time-value')).toHaveText('2:00');
    await page.getByTestId('prop-done').click();
    await page.getByTestId('editor-test').click();
    await page.evaluate(() => {
      const d = (window as unknown as { __pathlings: { step(n: number): void } }).__pathlings;
      d.step(2 * 60 * 60 + 5);
    });
    const end = page.getByTestId('end-screen');
    await expect(end).toBeVisible({ timeout: 10_000 });
    await expect(end).toHaveAttribute('data-won', 'false');
    await expect(page.getByTestId('publish-level')).toHaveCount(0);
  });
});
