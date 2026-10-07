/**
 * Store screenshots (T9.1): renders the built web app in Chromium at the exact pixel sizes the
 * App Store and Google Play ask for, in English and Hungarian, and writes JPEGs to
 * `docs/store/screenshots/<lang>/<device>/NN-<scene>.jpg`. Scenes: two gameplay frames, level select,
 * level editor, a shared level code and the title screen with the daily level.
 * Run: `npm run build && npm run store:frames`.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Page, chromium } from '@playwright/test';
import { encodeLevel } from '../src/core/code/levelCode';
import type { LevelDef } from '../src/core/level';

const ROOT = join(import.meta.dirname, '..');
const PORT = Number(process.env.FRAMES_PORT ?? 4381);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = join(ROOT, 'docs/store/screenshots');

interface Device {
  id: string;
  /** CSS viewport and device pixel ratio; pixels = viewport × dpr. */
  width: number;
  height: number;
  dpr: number;
}

const DEVICES: Device[] = [
  { id: 'iphone-6.7', width: 430, height: 932, dpr: 3 }, // 1290 × 2796
  { id: 'iphone-6.5', width: 414, height: 896, dpr: 3 }, // 1242 × 2688
  { id: 'ipad-12.9', width: 1024, height: 1366, dpr: 2 }, // 2048 × 2732
  { id: 'android-phone', width: 360, height: 640, dpr: 3 }, // 1080 × 1920
];

const LANGS = ['en', 'hu'] as const;

function levelFile(rel: string): LevelDef {
  const raw = JSON.parse(readFileSync(join(ROOT, 'src/levels', rel), 'utf8')) as LevelDef & {
    plan?: unknown;
    daily?: unknown;
  };
  delete raw.plan;
  delete raw.daily;
  return raw;
}

/** A shared community level (a built-in one dressed up as a player's code). */
function sharedCode(): string {
  const l = levelFile('w1/20.json');
  const level: LevelDef = { ...l, id: '', title: 'Leaf Valley', author: 'Mira ❦' };
  delete level.titleKey;
  delete level.hintKeys;
  level.hints = ['Float first, build later.'];
  return encodeLevel(level);
}

function editorDraft(): LevelDef {
  const l = levelFile('w2/20.json');
  const draft: LevelDef = { ...l, id: '', title: 'Crystal Heart' };
  delete draft.solution;
  delete draft.titleKey;
  delete draft.hintKeys;
  return draft;
}

function seedSave(lang: string): string {
  const stars = [3, 3, 2, 3, 3, 2, 3, 1, 3, 2, 3, 3];
  const levels = Object.fromEntries(
    stars.map((s, i) => [
      `w1-${String(i + 1).padStart(2, '0')}`,
      { stars: s, bestSaved: 9, fails: 0, solved: true, clean: true },
    ]),
  );
  return JSON.stringify({
    version: 2,
    levels,
    settings: { language: lang },
    tutorialSkipped: true,
    offerSeen: false,
  });
}

interface Scene {
  id: string;
  run(page: Page): Promise<void>;
}

const code = sharedCode();

const SCENES: Scene[] = [
  {
    id: 'play',
    async run(page) {
      await page.goto(`${BASE}/?level=w4-11&autoplay=1&seek=700&pause=1`);
      await page.getByTestId('whole-level').click();
    },
  },
  {
    id: 'glide',
    async run(page) {
      await page.goto(`${BASE}/?level=w1-13&autoplay=1&seek=800&pause=1`);
      await page.getByTestId('whole-level').click();
    },
  },
  {
    id: 'levels',
    async run(page) {
      await page.goto(`${BASE}/`);
      await page.getByTestId('play').click();
      await page.getByTestId('world-w1').click();
      await page.getByTestId('level-select').waitFor();
    },
  },
  {
    id: 'editor',
    async run(page) {
      // Through the menu: the editor opens with the saved draft.
      await page.goto(`${BASE}/`);
      await page.getByTestId('open-editor').click();
      await page.getByTestId('editor').waitFor();
    },
  },
  {
    id: 'code',
    async run(page) {
      await page.goto(`${BASE}/#${code}`);
      await page.getByTestId('code-result').waitFor();
    },
  },
  {
    id: 'title',
    async run(page) {
      await page.goto(`${BASE}/`);
      await page.getByTestId('play-daily').waitFor();
    },
  },
];

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error('preview server did not start');
}

function chromiumPath(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const candidate = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers', 'chromium');
  return existsSync(candidate) ? candidate : undefined;
}

async function main(): Promise<void> {
  const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: ROOT,
      stdio: 'ignore',
    },
  );
  try {
    await waitForServer();
    const exe = chromiumPath();
    const browser = await chromium.launch(exe ? { executablePath: exe } : {});
    for (const lang of LANGS) {
      for (const d of DEVICES) {
        const dir = join(OUT, lang, d.id);
        mkdirSync(dir, { recursive: true });
        const context = await browser.newContext({
          viewport: { width: d.width, height: d.height },
          deviceScaleFactor: d.dpr,
          isMobile: true,
          hasTouch: true,
          locale: lang === 'hu' ? 'hu-HU' : 'en-US',
        });
        await context.addInitScript(
          ([save, draft]) => {
            localStorage.setItem('pathlings.save', save);
            localStorage.setItem('pathlings.draft.v1', draft);
          },
          [seedSave(lang), JSON.stringify(editorDraft())] as const,
        );
        let n = 1;
        for (const scene of SCENES) {
          const page = await context.newPage();
          await scene.run(page);
          await page.waitForTimeout(700);
          const file = join(dir, `${String(n++).padStart(2, '0')}-${scene.id}.jpg`);
          await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
          console.log(`  ${file.slice(ROOT.length + 1)}`);
          await page.close();
        }
        await context.close();
      }
    }
    await browser.close();
  } finally {
    server.kill();
  }
}

await main();
