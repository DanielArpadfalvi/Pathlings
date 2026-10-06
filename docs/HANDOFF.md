# Pathlings – átadási jegyzet (lokális session indulásához)

Utolsó frissítés: 2026-10-06. Az orkesztrátor (felhős session) itt állt le; minden munka pusholva a `main`-re, WIP-branch nincs.

## Hol tart a projekt
| Mérföldkő | Állapot |
|---|---|
| Terv (`docs/PLAN.md`, `docs/TASKS.md`) | ✅ |
| M0 Alapozás (Vite+TS+Pixi+Preact, lint, Vitest, Playwright smoke, CI) | ✅ T0.1, T0.2 |
| M1 Mag-motor (`src/core`) | ✅ T1.1–T1.7 – terep, raszterizáló, pálya-definíció+validátor, lények, 8 képesség, objektumok, sim loop, események, replay, rewind, state hash |
| M2 Játszható prototípus | ⏭ következik (T2.1 renderer) |
| M3–M10 | nincs elkezdve |

Ellenőrzés az átadáskor: `npm run check` 264/264 unit teszt zöld, `npm run build` zöld, `npm run test:e2e` 3/3 zöld; `src/core` 100% sorlefedettség; 18 000 tick × 100 lény ≈ 110–170 ms. GitHub CI zöld.

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
1. **T2.1 Renderer** – terep-textúra dirty-rect frissítéssel, kódból rajzolt lények/objektumok, tick-interpoláció (a `drainEvents` `terrainChanged` rect-jeire építve).
2. **T2.2 Camera** + **T2.3 Smart selection** (pontozó függvény unit tesztekkel, a `canAssign`/`bodyCenter` lekérdezésekre).
3. **T2.4 HUD + controls** + 5 kézi tesztpálya, e2e végigjátszással (a `tests/fixtures/levels` megoldásaival).
4. M2 végén `game-reviewer` kör (screenshotok 360×640 / 412×915).
5. M3 (effektek, rewind UI, hang/haptika, perf) → M4 (pályakód + szerkesztő).

## Munkamódszer
Lásd az orchestrator repót (`DanielArpadfalvi/orchestrator`, ág `claude/upbeat-bohr-rofk9t`): `CLAUDE.md`, `playbook/PIPELINE.md`, agent-szerepek `.claude/agents/`. Feladatonként egy `game-builder` agent → orkesztrátor ellenőrzi (check/build/e2e/screenshot) → `docs/TASKS.md` pipa → commit + push `main`-re → dashboard.

## Lokális futtatás
- `npm ci`
- Lokálisan nincs `/opt/pw-browsers`: egyszer `npx playwright install chromium` (a `playwright.config.ts` a `/opt/pw-browsers`-re csak akkor esik vissza, ha létezik).
- `npm run check` · `npm run build` · `npm run test:e2e` (port felülírható: `PW_PORT=4391`).
- Natív Android/iOS build csak GitHub Actions-ben lesz (M7).
