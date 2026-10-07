import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * T9.4 QA pass: every built-in level is replayed through the real page (renderer, HUD, end
 * screen) from its reference solution and must end on a won end screen with the expected number
 * saved. Slow (~110 page loads), so it runs only with QA=1: `QA=1 npx playwright test qa-levels`.
 */
const RUN = process.env.QA === '1';
const DIR = join(import.meta.dirname, '..', '..', 'src', 'levels');

interface LevelFile {
  id: string;
  required: number;
  creatures: number;
  timeLimitTicks: number;
}

const levels: LevelFile[] = ['w1', 'w2', 'w3', 'w4', 'bonus'].flatMap((w) =>
  readdirSync(join(DIR, w))
    .filter((f) => /^\d\d\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(DIR, w, f), 'utf8')) as LevelFile),
);

test.describe('QA: every level through the UI', () => {
  test.skip(!RUN, 'set QA=1 to replay all built-in levels in the browser');
  test.describe.configure({ mode: 'parallel' });

  for (const l of levels) {
    test(l.id, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`/?level=${l.id}&autoplay=1&seek=${l.timeLimitTicks + 120}`);
      const end = page.getByTestId('end-screen');
      await expect(end).toHaveAttribute('data-won', 'true', { timeout: 20_000 });
      const saved = await page.getByTestId('hud-saved').innerText();
      const n = Number(/(\d+)\s*\/\s*\d+/.exec(saved)?.[1]);
      expect(n).toBeGreaterThanOrEqual(l.required);
      expect(errors).toEqual([]);
    });
  }
});
