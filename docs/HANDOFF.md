# Pathlings – átadási jegyzet (lokális session indulásához)

Utolsó frissítés: 2026-10-06 este. A Pathlingset a **lokális, Pathlings-könyvtárban futó session** viszi (a lokális orkesztrátor-session a Craterpultot és az orchestrator repó könyvelését; ne dolgozzon egyszerre két session ugyanebben a klónban). Minden munka pusholva a `main`-re, WIP-branch nincs.

## Hol tart a projekt
| Mérföldkő | Állapot |
|---|---|
| Terv (`docs/PLAN.md`, `docs/TASKS.md`) | ✅ |
| M0 Alapozás (Vite+TS+Pixi+Preact, lint, Vitest, Playwright smoke, CI) | ✅ T0.1, T0.2 |
| M1 Mag-motor (`src/core`) | ✅ T1.1–T1.7 – terep, raszterizáló, pálya-definíció+validátor, lények, 8 képesség, objektumok, sim loop, események, replay, rewind, state hash |
| M2 Játszható prototípus | 🔄 T2.1 ✅ renderer · T2.2 ✅ kamera · T2.3 ✅ okos kijelölés · következik T2.4 HUD |
| M3–M10 | nincs elkezdve |

Ellenőrzés (T2.3 után): `npm run check` 384/384 unit teszt zöld, `npm run build` zöld, `npm run test:e2e` 16/16 zöld; `src/core` 100% sorlefedettség; 18 000 tick × 100 lény ≈ 110–170 ms.

## Renderer / játékhurok (T2.1)
- `src/game/clock.ts` (fix 60 Hz akkumulátor + alpha), `src/game/session.ts` (`GameSession`: a sim egyetlen léptetője a magon kívül; tickenként `drainEvents` → listenerek).
- `src/render/worldRenderer.ts` rétegei: ég (lépcsős gradiens) → terep (`terrainLayer.ts`: egy `BufferImageSource` textúra, dirty rectek uniója +1 px élkiemelés miatt, frame-enként ≤ 1 **sor-tartományos részleges upload** – Pixi 8.22 `source.update(start, end)`) → objektumok (`objectLayer.ts`, pixel-gridek a zónák méretében; víz/láva Graphics) → lények (`creatureLayer.ts`, sprite-pool, tükrözés `scale.x`-szel, tick-interpoláció `interp.ts`) → folyadékok → jelek (Popper-visszaszámláló, Scaler/Glider jelvény).
- Pixel-art kódból: `creatureArt.ts` (7×11 frame-ek, láb-oszlop = középső oszlop), `objectArt.ts`, `pixelArt.ts`; minták: `terrainPaint.ts` (egész hash-zaj, anyagonkénti minta, él-highlight/árnyék), színek: `palette.ts` (4 téma).
- Tisztaság: `tests/unit/render/renderPurity.test.ts` – a render csak allowlistes, olvasó core-függvényeket importálhat, a `game` réteget nem; `worldRenderer.test.ts` headless Pixi-vel ellenőrzi, hogy minden frame kirajzolása után a sim bitre azonos marad.
- URL-paraméterek (prototípus/e2e): `?level=<id>` (`src/levels/test`: fixture-ök + `showcase` – minden anyag és objektum), `autoplay=1`, `seek=<tick>`, `pause=1`, `debug=1` (`window.__pathlings`: tick, stats, creatures). Paraméter nélkül attract mód (clockwork megoldása, címkártya alatt, újraindul).
- A tesztpályák átköltöztek: `tests/fixtures/levels` → `src/levels/test`.

## Kamera + input (T2.2)
- `src/render/camera.ts` – tiszta `Camera` (középpont + skála, CSS px / világpx): alap ≈ 200 világpx széles, csípés 1×–4× (lejjebb csak a „teljes pálya” skáláig; tableten a max ≥ alap), a nézet nem hagyja el a pályát (kisebb tengelyen középre), `frameStart` (bejárat + legközelebbi, beleférő kijárat), `doubleTap` (2× rá / vissza), `toggleWholeLevel`, easing-animáció `update(dt)`-vel.
- `src/input/gestures.ts` – tiszta gesztus-állapotgép: tap, doubleTap (300 ms / 30 px), pan 5 pt holtzónával (ugrás nélkül), két ujjas pinch + pan, harmadik ujj ignorálva. A tap jelenleg csak kamera-semleges (T2.3 köti a kijelöléshez); a doubleTap előtt egy tap is kimegy.
- `src/input/pointerInput.ts` – DOM pointer-események → gesztusok (+ egérgörgő-zoom webre).
- `src/app/playScreen.ts` – egy pálya a képernyőn: session + renderer + kamera + input; `main.ts` csak bootol. „Teljes pálya” gomb: `src/ui/App.tsx` (`whole-level` testid). Debug: `window.__pathlings.camera`, `.logLength`.

## Okos kijelölés (T2.3)
- `src/input/selection.ts` – tiszta pontozó: 28 pt sugár a test-téglalaptól, sorrend: jogosult (`canAssign`) > távolság 6 pt-es sávokban > még nincs képessége > a koppintás felé halad > kisebb id; irányszűrő (`both/left/right`). Ha senki sem jogosult, a legközelebbi kapja a (sikertelen) próbát → később „nem” visszajelzés.
- `src/input/gestures.ts` press-mód: ha az ujj lény közelében ér le (`hitTest`), nincs pan/tap, hanem `pressStart/Move/End/Cancel`; üres területen húzás = pásztázás.
- `src/input/selectionController.ts` – nyomás életciklusa: kiemelés követi az ujjat, 250 ms után lupe (2,5×, 56 pt sugár), a lupéból > 56 pt-re kihúzva = mégse, elengedés = kiosztás. `refresh()` minden frame-ben (a tömeg mozog).
- Render: `creatureLayer` kiemelés (keret + billegő nyíl; piros, ha nem jogosult), `src/render/loupe.ts` (RenderTexture-be újrarajzolt világ, kör maszk, az ujj fölött; felül lent jelenik meg).
- Kiosztás csak `GameSession.assign`-on át (szünetben is, logolva). Ideiglenes: `?skill=<id>` és `?filter=left|right`, amíg a T2.4 képességsávja nincs kész; irányszűrő-gomb bal lent (`direction-filter`).
- Tesztpálya: `src/levels/test/crowd.ts` (10 lény egy 44 px-es fém gödörben). Debug: `__pathlings.press`, `.lastAttempt`, `.pick(x,y)`, `.toScreen(x,y)`.

## Fontos tudnivalók a magról
- Publikus API: `src/core/index.ts`. Sim: `createSim`, `step`/`stepN`, `assign`, `popAll`, `setReleaseInterval`, `canAssign`, `drainEvents`, `stateHash`, `rewindTo`, `runSolution`, `exportSolution`.
- Tesztpályák referencia-megoldással: `tests/fixtures/levels/` (`FIXTURE_LEVELS`: walkHome, digDown, tunnel, clockwork, cliff) – a renderer/e2e ezekre építhet.
- A PLAN.md-ben nem rögzített, de most már golden hash-sel rögzített szabályok (pl. 60 px esés még túlélhető, 61 halálos; lelépés max. 3 px; első spawn a 30. tickben; egyirányú fal csak vízszintes/átlós ásást korlátoz; Mason deszka = föld; rewind eldobja a cél-tick utáni parancsokat). Bármilyen változtatás ezeken → `SIM_VERSION` emelés + golden hashek frissítése.
- A Vitest-perf teszt `--coverage` alatt kihagyódik (env flag a `vitest.config.ts`-ben).

## Nyitott döntések / ismert hiányok
- `npm run check` még nem validálja a beépített pályákat (`scripts/validate-levels` = T5.1).
- Perf-tartalék lassú CI runneren kb. 2,3×.
- Üzleti modell (PLAN.md §2): 30 pálya + napi pálya + szerkesztő + kódok ingyen, „Teljes játék” $2,99, opcionális Supporter $2,99 (kozmetikum).

## Következő lépések sorrendben
1. **T2.4 HUD + controls** (a képességsáv váltja le a `?skill=` paramétert; az irányszűrő- és teljes-pálya gomb kerüljön a vezérlősorba) + 5 kézi tesztpálya, e2e végigjátszással (a `src/levels/test` megoldásaival).
2. M2 végén `game-reviewer` kör (screenshotok 360×640 / 412×915).
3. M3 (effektek, rewind UI, hang/haptika, perf) → M4 (pályakód + szerkesztő).

## Munkamódszer
Lásd az orchestrator repót (`DanielArpadfalvi/orchestrator`, ág `claude/upbeat-bohr-rofk9t`): `CLAUDE.md`, `playbook/PIPELINE.md`, agent-szerepek `.claude/agents/`. Feladatonként egy `game-builder` agent → orkesztrátor ellenőrzi (check/build/e2e/screenshot) → `docs/TASKS.md` pipa → commit + push `main`-re → dashboard.

## Lokális futtatás
- `npm ci` (ha egy másik folyamat is telepít ugyanide, `ENOTEMPTY`-vel elhasal – egyszerre csak egy session dolgozzon egy klónban)
- Lokálisan nincs `/opt/pw-browsers`: egyszer `npx playwright install chromium` (ezen a gépen már telepítve; a `playwright.config.ts` a `/opt/pw-browsers`-re csak akkor esik vissza, ha létezik).
- Dev szerver a böngésző-panelhez: `.claude/launch.json` (`pathlings-dev`, port 5191).
- Node 22 `navigator.language`-t ad (ezen a gépen `hu-HU`) – a tesztek ne feltételezzenek angol kezdőnyelvet.
- `npm run check` · `npm run build` · `npm run test:e2e` (port felülírható: `PW_PORT=4391`).
- Natív Android/iOS build csak GitHub Actions-ben lesz (M7).
