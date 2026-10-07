# Pathlings – átadási jegyzet (lokális session indulásához)

Utolsó frissítés: 2026-10-06 este. A Pathlingset a **lokális, Pathlings-könyvtárban futó session** viszi (a lokális orkesztrátor-session a Craterpultot és az orchestrator repó könyvelését; ne dolgozzon egyszerre két session ugyanebben a klónban). Minden munka pusholva a `main`-re, WIP-branch nincs.

## Hol tart a projekt
| Mérföldkő | Állapot |
|---|---|
| Terv (`docs/PLAN.md`, `docs/TASKS.md`) | ✅ |
| M0 Alapozás (Vite+TS+Pixi+Preact, lint, Vitest, Playwright smoke, CI) | ✅ T0.1, T0.2 |
| M1 Mag-motor (`src/core`) | ✅ T1.1–T1.7 – terep, raszterizáló, pálya-definíció+validátor, lények, 8 képesség, objektumok, sim loop, események, replay, rewind, state hash |
| M2 Játszható prototípus | ✅ T2.1 renderer · T2.2 kamera · T2.3 okos kijelölés · T2.4 HUD |
| M3 Játékélmény | 🔄 T3.1 ✅ effektek · T3.2 ✅ rewind · T3.3 ✅ hang/haptika · T3.4 perf-mérő kész, CI-n még ellenőrizendő |
| M4 Szerkesztő + pályakód | 🔄 T4.1 ✅ pályakód · T4.2 ✅ ellenőrzés · következik T4.3 szerkesztő-mag |
| M5–M10 | nincs elkezdve |

Ellenőrzés (T3.3 után): `npm run check` 419/419 unit teszt zöld, `npm run build` zöld, `npm run test:e2e` 26/26 zöld; `src/core` 100% sorlefedettség; 18 000 tick × 100 lény ≈ 110–170 ms.

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

## HUD + vezérlés (T2.4)
- `src/app/gameApp.ts` – `GameApp`: címképernyő (attract demó + „Játék”) vagy a prototípus-pályasor (az 5 fixture), HUD-store (`src/app/store.ts`, `src/app/hud.ts` – sima adat), `GameActions` (képesség, szünet, sebesség 1→2→4→0,5, ütem ±, mind pukkan, újra/következő, szűrő, teljes pálya, insetek), web-billentyűk (1–8, szóköz, +/−, f, r).
- `src/ui/PlayHud.tsx` – felső HUD (kint, haza/szükséges, idő), 2×4 képesség-gomb (kódból rajzolt SVG ikon + készlet, ≥ 48 pt), vezérlősor, mind pukkan: 0,6 s nyomás → „armed” 2,5 s-ig → megerősítő koppintás, pálya-vége kártya csillagokkal. A HUD magasságát `ResizeObserver` jelenti → `Camera.setInsets` (a kamera a két UI-sáv közti részt keretezi; `screenCenter`).
- `src/core/stars.ts` – `rateRun` (★/★★/★★★); szimulációt nem érint.
- `GameSession.popAll`, `changeRelease(±1)` (egy nyomás = a tartomány 1/8-a).

## Effektek (T3.1)
- `src/render/effects.ts` – `EffectsLayer`: eseményvezérelt részecskék (kráter + szikra + képernyőrázás, víz-csobbanás, láva-parázs, levél-puff halálnál, hazaérés-csillogás, deszka-csillanás – piros az utolsó 3-nál, teleport, ugrópárna-por, kiosztás-gyűrű, csapda), max. 600 részecske, valós idejű, a szimet nem érinti. `reducedMotion` (a `prefers-reduced-motion` alapján; T6.2-ben beállítás) → nincs rázás és Popper-remegés.
- Popper az utolsó 90 tickben remeg (`creatureLayer`), kijárat-felvillanás belépéskor, láva-buborékok (`objectLayer`).
- Ha a Vite dev szerver félkész modulállapotnál beragad (HMR „does not provide an export”), indítsd újra.

## Visszatekerés (T3.2)
- `GameSession.rewindBy(ticks)` (core `rewindTo`: kulcsképkocka + újraszimulálás, a cél utáni parancsok törlődnek, `rewound` esemény a listenereknek).
- `GameApp.rewindStart/End`: nyomva tartva 4× valós idejű visszafelé futás, utána szünet; HUD idővonal-sáv (`progress`), „Visszatekerés” jelvény; billentyű: `z`/Backspace.
- Auto-szünet kijelöléskor: `PlayScreen.autoPause` (egyelőre `?autopause=1`, T6.2 beállítás lesz).
- Memória: `tests/unit/core/memoryBudget.test.ts` – 10 perc, 100 lény, folyamatos ásás → kulcsképkockák < 30 MB.

## Hang + haptika (T3.3)
- `src/audio/sfx.ts` – `SfxMapper`: esemény → hang-cue (tiszta, hamis sinkkel tesztelve), ritkítás (lépés/ásás/…), deszka-hangmagasság emelkedik, „no” az elutasított koppintásra.
- `src/audio/synth.ts` – `WebAudioEngine`: minden hang oszcillátorból/zajból; az AudioContext az első gesztusra jön létre (`unlock`); zene-ütemező lookahead-del, tempó = `tempoFactor(speed)` (0,75–2×), szünet/pálya vége alatt halkít.
- `src/audio/music.ts` – világonkénti stílus (skála, bpm, akkordmenet), determinisztikus `notesAt(style, step)`.
- `src/audio/volume.ts` – master/sfx/zene hangerő (T6.2/T6.3 köti be); `GameApp.setAudio`, `setHaptics`.
- `src/platform/haptics.ts` – `Haptics` interfész, web: Vibration API; natív Capacitor implementáció a T7.1-ben `setHaptics`-szel.
- `src/audio/feedback.ts` – SFX + haptika (könnyű: kiosztás, közepes: hazaérés, erős: halál, dupla: elutasítás).

## Teljesítmény (T3.4)
- `src/levels/test/perf.ts` (640×960, 100 lény zárt arénában), `tests/e2e/perf.spec.ts`: egész pálya, 4× sebesség, CDP 4× CPU-lassítás, 20 s átlag ≥ 55 FPS; csak CI-n vagy `PERF=1`-gyel fut. Lokálisan ~60 FPS. Az eredményt `::notice::` annotációként írja ki (GitHub API-val olvasható: `/check-runs/<job>/annotations`).
- `tests/unit/core/tickBudget.test.ts`: átlagos core tick 100 lénnyel < 0,5 ms.
- CI-állapot hitelesítés nélkül: `curl https://api.github.com/repos/DanielArpadfalvi/Pathlings/actions/runs?per_page=5` (a logokhoz token kell).

## Pályakód (T4.1)
- `src/core/code/` – `bytes.ts` (varint/zigzag, saját UTF-8, szigorú base64url), `crc32.ts`, `levelCode.ts`: `PL1-` + base64url(deflate-raw 9 (payload) ‖ CRC32(tömörített)); a payload: magic, formátum- és `SIM_VERSION`, fejléc, készlet, szövegek, delta-kódolt op- és objektumlista, megoldás (delta tick, `creature*16+skill`, 8 = pop all), végén saját CRC32. `encodeLevel` (validál, 4 KB limit), `decodeLevel` (szóköz-tűrő, kisbetűs előtag is; újabb motor → `newerVersion`), `compressedSize` (szerkesztő mérője), `looksLikeCode`.
- `src/core/code/verify.ts` – `verifyLevel` (headless `runSolution`: `verified` / `noSolution` / `unsolved` / `hashMismatch` / `olderVersion`), `loadLevelCode` (dekódol + ellenőriz). 5 perces, 100 lényes pálya ellenőrzése < 300 ms.
- Kódban nincs `id`, `titleKey`, `hintKeys` (közösségi pályák). Teszt: 200 generált pálya oda-vissza, minden egybájtos/egykarakteres sérülés elutasítva.

## Következő lépések sorrendben
1. M3: T3.4 perf.
2. M4: T4.3 szerkesztő-mag → T4.4 szerkesztő UI → T4.5 megosztás; M5 (tartalom + `scripts/validate-levels`), M6–M9.

## Munkamódszer
Lásd az orchestrator repót (`DanielArpadfalvi/orchestrator`, ág `claude/upbeat-bohr-rofk9t`): `CLAUDE.md`, `playbook/PIPELINE.md`, agent-szerepek `.claude/agents/`. Feladatonként egy `game-builder` agent → orkesztrátor ellenőrzi (check/build/e2e/screenshot) → `docs/TASKS.md` pipa → commit + push `main`-re → dashboard.

## Lokális futtatás
- `npm ci` (ha egy másik folyamat is telepít ugyanide, `ENOTEMPTY`-vel elhasal – egyszerre csak egy session dolgozzon egy klónban)
- Lokálisan nincs `/opt/pw-browsers`: egyszer `npx playwright install chromium` (ezen a gépen már telepítve; a `playwright.config.ts` a `/opt/pw-browsers`-re csak akkor esik vissza, ha létezik).
- Dev szerver a böngésző-panelhez: `.claude/launch.json` (`pathlings-dev`, port 5191).
- Node 22 `navigator.language`-t ad (ezen a gépen `hu-HU`) – a tesztek ne feltételezzenek angol kezdőnyelvet.
- `npm run check` · `npm run build` · `npm run test:e2e` (port felülírható: `PW_PORT=4391`).
- Natív Android/iOS build csak GitHub Actions-ben lesz (M7).
