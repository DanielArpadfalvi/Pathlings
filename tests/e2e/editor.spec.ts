import { expect, test, type Page } from '@playwright/test';

interface EditorDebug {
  ops: { op: string; [k: string]: unknown }[];
  objects: { type: string; x: number; y: number; dir?: number }[];
  w: number;
  h: number;
  selected: number;
  canUndo: boolean;
  status: { playable: boolean; opCount: number; codeBytes: number };
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function editor(page: Page): Promise<EditorDebug> {
  return page.evaluate(
    () => (window as unknown as { __pathlings: { editor: EditorDebug } }).__pathlings.editor,
  );
}

/** Synthesized touch drag through world points (converted with the editor camera). */
async function drag(page: Page, world: [number, number][], id = 91): Promise<void> {
  await page.evaluate(
    ([pts, pid]) => {
      const d = (
        window as unknown as {
          __pathlings: { editorToScreen(x: number, y: number): { x: number; y: number } };
        }
      ).__pathlings;
      const canvas = document.querySelector('#stage canvas')!;
      const list = pts as [number, number][];
      list.forEach(([wx, wy], i) => {
        const p = d.editorToScreen(wx, wy);
        const type = i === 0 ? 'pointerdown' : 'pointermove';
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: pid as number,
            clientX: p.x,
            clientY: p.y,
            bubbles: true,
            pointerType: 'touch',
          }),
        );
      });
      const [lx, ly] = list[list.length - 1]!;
      const p = d.editorToScreen(lx, ly);
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerId: pid as number,
          clientX: p.x,
          clientY: p.y,
          bubbles: true,
          pointerType: 'touch',
        }),
      );
    },
    [world, id] as const,
  );
}

const tap = (page: Page, x: number, y: number) => drag(page, [[x, y]]);

test.describe('level editor', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('build a small level with every tool', async ({ page }, testInfo) => {
    // Long UI flow: each click waits for stable frames, ~2.5 s apiece under software GL.
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await page.goto('/?debug=1');
    await page.getByTestId('open-editor').click();
    await expect(page.getByTestId('editor')).toBeVisible();
    const start = await editor(page);
    expect(start.status.playable).toBe(true);
    const ops0 = start.ops.length;

    // Brush (large, rock).
    await page.getByTestId('editor-tool-brush').click();
    await page.getByTestId('editor-size-2').click();
    await page.getByTestId('editor-material-2').click();
    await drag(page, [
      [40, 300],
      [80, 310],
      [120, 320],
      [160, 330],
    ]);
    let e = await editor(page);
    expect(e.ops.at(-1)).toMatchObject({ op: 'brush', m: 2, size: 2 });

    // Shapes: rectangle (metal), circle, ramp, polygon.
    await page.getByTestId('editor-tool-shape').click();
    await page.getByTestId('editor-material-3').click();
    await drag(page, [
      [200, 200],
      [240, 230],
    ]);
    expect((await editor(page)).ops.at(-1)).toMatchObject({ op: 'rect', m: 3 });
    await page.getByTestId('editor-shape-circle').click();
    await drag(page, [
      [100, 150],
      [110, 158],
    ]);
    expect((await editor(page)).ops.at(-1)).toMatchObject({ op: 'circle' });
    await page.getByTestId('editor-shape-ramp').click();
    await drag(page, [
      [180, 420],
      [260, 380],
    ]);
    expect((await editor(page)).ops.at(-1)).toMatchObject({ op: 'ramp', rise: 'right' });
    await page.getByTestId('editor-shape-poly').click();
    await tap(page, 40, 100);
    await tap(page, 80, 100);
    await tap(page, 60, 130);
    await expect(page.getByTestId('editor-poly-done')).toBeEnabled();
    await page.getByTestId('editor-poly-done').click();
    expect((await editor(page)).ops.at(-1)).toMatchObject({ op: 'poly' });

    // Stamp (mirrored).
    await page.getByTestId('editor-tool-stamp').click();
    await page.getByTestId('editor-stamp-tree').click();
    await page.getByTestId('editor-stamp-flip').click();
    await tap(page, 280, 300);
    expect((await editor(page)).ops.at(-1)).toMatchObject({ op: 'stamp', id: 'tree', flip: true });

    // Eraser.
    await page.getByTestId('editor-tool-eraser').click();
    await drag(page, [
      [40, 300],
      [70, 305],
    ]);
    expect((await editor(page)).ops.at(-1)).toMatchObject({ op: 'erase' });

    // Objects: a trap and water.
    await page.getByTestId('editor-tool-object').click();
    await page.getByTestId('editor-object-trap').click();
    await tap(page, 150, 420);
    await page.getByTestId('editor-object-water').click();
    await tap(page, 220, 436);
    e = await editor(page);
    expect(e.objects.map((o) => o.type)).toEqual(['entrance', 'exit', 'trap', 'water']);

    // Hand: drag the trap, flip the entrance, delete the water.
    await page.getByTestId('editor-tool-hand').click();
    const trap = e.objects[2]!;
    await drag(page, [
      [trap.x + 5, trap.y + 5],
      [trap.x + 25, trap.y + 5],
    ]);
    e = await editor(page);
    expect(e.objects[2]!.x).toBe(trap.x + 20);
    const ent = e.objects[0]!;
    await tap(page, ent.x, ent.y - 4);
    await page.getByTestId('editor-flip').click();
    expect((await editor(page)).objects[0]!.dir).toBe(-1);
    const water = (await editor(page)).objects[3]!;
    await tap(page, water.x + 4, water.y + 4);
    await page.getByTestId('editor-delete').click();
    expect((await editor(page)).objects).toHaveLength(3);

    // Undo / redo.
    await page.getByTestId('editor-undo').click();
    expect((await editor(page)).objects).toHaveLength(4);
    await page.getByTestId('editor-redo').click();
    expect((await editor(page)).objects).toHaveLength(3);

    e = await editor(page);
    expect(e.ops.length).toBe(ops0 + 7);
    expect(e.status.playable).toBe(true);
    await expect(page.getByTestId('editor-status')).toHaveAttribute('data-playable', 'true');
    await page.screenshot({ path: testInfo.outputPath('editor-built.png') });

    // Removing the only exit makes the level unplayable (live validation).
    const exit = e.objects[1]!;
    await tap(page, exit.x + 6, exit.y + 6);
    await page.getByTestId('editor-delete').click();
    await expect(page.getByTestId('editor-status')).toHaveAttribute('data-playable', 'false');

    await page.getByTestId('editor-back').click();
    await expect(page.getByTestId('title-card')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
