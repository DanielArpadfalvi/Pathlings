import { expect, test, type Page } from '@playwright/test';

async function testCode(page: Page, id: string): Promise<string> {
  const code = await page.evaluate(
    (lid) =>
      (
        window as unknown as { __pathlings: { testCode(id: string): string | null } }
      ).__pathlings.testCode(lid),
    id,
  );
  expect(code).toMatch(/^PL1-/);
  return code!;
}

async function receive(page: Page, code: string): Promise<void> {
  await page.getByTestId('open-code').click();
  // Paste detection: a complete code loads without pressing "Load".
  await page.getByTestId('code-input').fill(code);
  await expect(page.getByTestId('code-result')).toHaveAttribute('data-verified', 'true');
  await page.getByTestId('code-close').click();
}

test.describe('sharing and my levels', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  test('received codes persist across reloads; favourite, share, play, delete', async ({
    page,
  }) => {
    await page.goto('/?debug=1');
    const tunnel = await testCode(page, 'test-tunnel');
    const cliff = await testCode(page, 'test-cliff');
    await receive(page, tunnel);
    await receive(page, cliff);
    // Receiving the same code again does not duplicate it.
    await receive(page, `  ${tunnel.slice(0, 12)}\n${tunnel.slice(12)}  `);

    await page.reload();
    await page.getByTestId('open-my-levels').click();
    const panel = page.getByTestId('my-levels');
    await page.getByTestId('my-tab-received').click();
    await expect(panel.locator('.my-level')).toHaveCount(2);
    // Newest first: Cliff, then Tunnel.
    await expect(panel.locator('.my-level').first()).toContainText('Cliff');

    // Favourite Tunnel: it moves to the top and stays there after a reload.
    await panel.locator('.my-level', { hasText: 'Tunnel' }).getByTestId('my-favourite').click();
    await expect(panel.locator('.my-level').first()).toContainText('Tunnel');
    await page.reload();
    await page.getByTestId('open-my-levels').click();
    await page.getByTestId('my-tab-received').click();
    const first = page.getByTestId('my-levels').locator('.my-level').first();
    await expect(first).toContainText('Tunnel');
    await expect(first.getByTestId('my-favourite')).toHaveAttribute('aria-pressed', 'true');

    // Share: no share sheet in headless Chromium → the code is copied.
    await first.getByTestId('my-share').click();
    await expect(first.getByTestId('my-note')).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(tunnel);

    // Delete needs a confirmation.
    const cliffRow = page.getByTestId('my-levels').locator('.my-level', { hasText: 'Cliff' });
    await cliffRow.getByTestId('my-delete').click();
    await cliffRow.getByTestId('my-delete-confirm').click();
    await expect(page.getByTestId('my-levels').locator('.my-level')).toHaveCount(1);
    await page.reload();
    await page.getByTestId('open-my-levels').click();
    await page.getByTestId('my-tab-received').click();
    await expect(page.getByTestId('my-levels').locator('.my-level')).toHaveCount(1);

    // Play from the collection.
    await page.getByTestId('my-play').click();
    await expect(page.getByTestId('hud')).toBeVisible();
  });

  test('the editor draft is autosaved and survives a reload; "new level" resets it', async ({
    page,
  }) => {
    await page.goto('/?debug=1');
    await page.getByTestId('open-editor').click();
    await page.getByTestId('editor-tool-shape').click();
    await page.evaluate(() => {
      const d = (
        window as unknown as {
          __pathlings: { editorToScreen(x: number, y: number): { x: number; y: number } };
        }
      ).__pathlings;
      const canvas = document.querySelector('#stage canvas')!;
      const send = (type: string, x: number, y: number): void => {
        const p = d.editorToScreen(x, y);
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 97,
            clientX: p.x,
            clientY: p.y,
            bubbles: true,
            pointerType: 'touch',
          }),
        );
      };
      send('pointerdown', 100, 200);
      send('pointermove', 140, 230);
      send('pointerup', 140, 230);
    });
    const ops = () =>
      page.evaluate(
        () =>
          (window as unknown as { __pathlings: { editor: { ops: unknown[] } | null } }).__pathlings
            .editor!.ops.length,
      );
    expect(await ops()).toBe(2);
    await page.reload();
    await page.getByTestId('open-editor').click();
    expect(await ops()).toBe(2);
    await page.getByTestId('editor-props').click();
    await page.getByTestId('prop-new').click();
    expect(await ops()).toBe(1);
  });
});
