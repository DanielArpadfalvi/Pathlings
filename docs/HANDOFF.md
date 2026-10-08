# Pathlings – átadási jegyzet (lokális session indulásához)

Utolsó frissítés: 2026-10-08 (T5.6 – felhős session, ág `claude/friendly-hypatia-lyign2`). A Pathlingset a **lokális, Pathlings-könyvtárban futó session** viszi (a lokális orkesztrátor-session a Craterpultot és az orchestrator repó könyvelését; ne dolgozzon egyszerre két session ugyanebben a klónban). Minden munka pusholva a `main`-re, WIP-branch nincs.

## Hol tart a projekt
| Mérföldkő | Állapot |
|---|---|
| Terv (`docs/PLAN.md`, `docs/TASKS.md`) | ✅ |
| M0 Alapozás (Vite+TS+Pixi+Preact, lint, Vitest, Playwright smoke, CI) | ✅ T0.1, T0.2 |
| M1 Mag-motor (`src/core`) | ✅ T1.1–T1.7 – terep, raszterizáló, pálya-definíció+validátor, lények, 8 képesség, objektumok, sim loop, események, replay, rewind, state hash |
| M2 Játszható prototípus | ✅ T2.1 renderer · T2.2 kamera · T2.3 okos kijelölés · T2.4 HUD |
| M3 Játékélmény | 🔄 T3.1 ✅ effektek · T3.2 ✅ rewind · T3.3 ✅ hang/haptika · T3.4 ✅ perf |
| M4 Szerkesztő + pályakód | ✅ T4.1 pályakód · T4.2 ellenőrzés · T4.3 szerkesztő-mag · T4.4 szerkesztő UI + közzététel · T4.5 megosztás |
| M5 Tartalom | 🔄 T5.1 ✅ pálya-pipeline · T5.2 ✅ Mohaliget (20) + tutorial · T5.3 ✅ Kristálymély (20) · T5.4 ✅ Óraműhely (20) · T5.5 ✅ Felhőszirt (20) · T5.6 ✅ bónusz (30) + napi pálya · következik T5.7 tippek |
| M6–M10 | nincs elkezdve |

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
- `src/levels/test/perf.ts` (640×960, 100 lény zárt arénában), `tests/e2e/perf.spec.ts`: egész pálya, 4× sebesség, CDP 4× CPU-lassítás, 20 s átlag ≥ 55 FPS; csak CI-n vagy `PERF=1`-gyel fut. Lokálisan ~60 FPS; a CI GPU nélküli runnerén a szoftveres GL miatt 16–21 FPS még lassítás nélkül is, ezért ott a fő szál frame-költsége (játék-JS + Pixi render, 4× lassítva) < 8 ms a kapu; a 55 FPS-es kapu `PERF_ENFORCE=1`-gyel (GPU-s gépen). Az eredményt `::notice::` annotációként írja ki (GitHub API-val olvasható: `/check-runs/<job>/annotations`).
- `tests/unit/core/tickBudget.test.ts`: átlagos core tick 100 lénnyel < 0,5 ms.
- CI-állapot hitelesítés nélkül: `curl https://api.github.com/repos/DanielArpadfalvi/Pathlings/actions/runs?per_page=5` (a logokhoz token kell).

## Pályakód (T4.1)
- `src/core/code/` – `bytes.ts` (varint/zigzag, saját UTF-8, szigorú base64url), `crc32.ts`, `levelCode.ts`: `PL1-` + base64url(deflate-raw 9 (payload) ‖ CRC32(tömörített)); a payload: magic, formátum- és `SIM_VERSION`, fejléc, készlet, szövegek, delta-kódolt op- és objektumlista, megoldás (delta tick, `creature*16+skill`, 8 = pop all), végén saját CRC32. `encodeLevel` (validál, 4 KB limit), `decodeLevel` (szóköz-tűrő, kisbetűs előtag is; újabb motor → `newerVersion`), `compressedSize` (szerkesztő mérője), `looksLikeCode`.
- `src/core/code/verify.ts` – `verifyLevel` (headless `runSolution`: `verified` / `noSolution` / `unsolved` / `hashMismatch` / `olderVersion`), `loadLevelCode` (dekódol + ellenőriz). 5 perces, 100 lényes pálya ellenőrzése < 300 ms.
- Kódban nincs `id`, `titleKey`, `hintKeys` (közösségi pályák). Teszt: 200 generált pálya oda-vissza, minden egybájtos/egykarakteres sérülés elutasítva.

## Szerkesztő (T4.3)
- `src/editor/doc.ts` – `EditorDoc`: immutábilis `LevelDef` vázlat + history (200 lépés), `addOps` (1024-es op-limit, túllépéskor nem fogyaszt lépést), objektum add/update/remove, `setProps` (§1.8 határokkal), `status` (validáció + tömörített kódméret vs 4 KB). `newDraft(preset, theme)`.
- `src/editor/tools.ts` – tiszta eszközök: `StrokeBuilder` (ecset/radír, ≤ 256 pontos, összeérő darabok), `shapeFromDrag` (téglalap/kör/rámpa; felfelé-jobbra húzás = jobbra emelkedő), `PolyBuilder` (koppintásonként, első pont közelében zár), `stampAt`, `objectAt` (pályán belülre szorítva), `objectAtPoint`, `moveObject`. `src/editor/palette.ts`: témánként 16 bélyeg (8 közös + 8 tematikus; az új bélyegek a `core/stamps.ts`-ben).
- `src/app/editorScreen.ts` – `EditorScreen`: dokumentum + `EditorRenderer` (`src/render/editorRenderer.ts`: terep újraraszterezése változáskor, áttetsző előnézet, sokszög-sarkok, kijelölés-keret, pályahatár) + kamera + gesztusok (egy ujj = aktív eszköz / kéz: objektum húzása, két ujj = pásztázás/zoom).
- `src/ui/EditorHud.tsx` – felül vissza/visszavonás/újra + állapot (op-szám, KB, javítandó), alul eszközsor és eszközönkénti opciók (méret, anyag, formák, bélyegek, objektumok, kijelölt objektum műveletei). `GameApp` `editor` mód (`openEditor`, `exitEditor`, Ctrl+Z / Ctrl+Shift+Z); `?editor=1`.
- Debug: `__pathlings.editor`, `editorToScreen(x,y)`, `step(n)` (teszt-hook).
- A web-haptika csak felhasználói gesztus után rezget (különben a Chrome konzolhibát ír).

## Szerkesztő UI + közzététel (T4.4)
- `src/ui/Panels.tsx` – `PropertySheet` (§1.8 mezők léptetőkkel), `PublishPanel` (kód + másolás), `CodePanel` („Kód lejátszása”: beillesztés vágólapról / kézzel, betöltés, ellenőrzött jelzés, játék, hibaüzenetek).
- `GameApp`: `testPlay` (a vázlat `PlayScreen`-ben, `hud.testPlay`), `backToEditor` (ugyanaz az `EditorDoc`, history-val), `publish()` (csak megnyert tesztjáték után: `exportSolution` → a saját visszajátszásnak ellenőrzöttnek kell lennie → `encodeLevel`), `loadCode` / `playLoaded`, `copyText`.
- `src/platform/clipboard.ts` – vágólap a platform mögött (web: Clipboard API + textarea-fallback; natív a T7.1-ben).
- Címkártya: Játék / Pályaszerkesztő / Kód lejátszása.

## Megosztás + saját pályák (T4.5)
- `src/platform/storage.ts` (kulcs-érték; web: localStorage + memória-fallback, soha nem dob), `src/platform/share.ts` (Web Share API, különben vágólapra másol; natív a T7.1-ben).
- `src/app/myLevels.ts` – `MyLevels`: kódok + metaadat (`mine`/`received`, kedvenc, ellenőrzött), id = a kód CRC32-je (nincs duplikátum; újra közzétett kapott kód → saját), sérült tárhely → üres lista. Szerkesztő-vázlat automatikus mentése (`saveDraft`/`loadDraft`/`clearDraft`).
- `GameApp`: közzétételkor „saját”, betöltéskor „kapott” bejegyzés; `toggleFavourite`, `removeLevel`, `playMyLevel`, `editMyLevel`, `shareLevel`, `newLevel`; a szerkesztő a mentett vázlattal nyílik.
- UI: „Saját pályák” panel (fülek, kedvenc, játék, megosztás, szerkesztés, törlés megerősítéssel), beillesztés-felismerés a kódmezőben, „Új pálya kezdése” a tulajdonság-lapon. Debug: `__pathlings.testCode(id)`.
- E2E-tipp: a HUD frame-enként publikál – akció után `expect.poll`-lal olvasd.

## Pálya-pipeline (T5.1)
- Beépített pályák: `src/levels/<w1|w2|w3|w4|bonus>/NN.json` (`LevelDef` + `titleKey`/`hintKeys` + `difficulty` + `solution`, opcionálisan `plan`). Az app a `src/levels/catalog.ts`-ből (`import.meta.glob`) tölti, a `plan`-t eldobja.
- Szövegek: `src/i18n/levels.en.ts` / `levels.hu.ts` (`level.<id>.title|hint1|hint2`), a szótárakba fésülve.
- `src/levels/plan.ts` – `compilePlan`: feltételes lépések (`assign` + `when: {tick,xGte,xLte,yGte,yLte,state,dir}`, `popAll`, `release`) → pontos napló + hash. `npm run levels:solve [id…]` újraírja a JSON-ok `solution`-jét.
- `src/levels/validate.ts` – `checkBuiltIn`: id = útvonal, érvényes, téma és nehézségi tartomány világonként (w1 1–6, w2 3–8, w3 5–9, w4 7–10, bonus 1–10), szövegek minden nyelven, a megoldás lefut, hash egyezik, **a referencia mindhárom csillagot megszerzi**. `npm run validate-levels` (a `check` része) – CI-kapu.

## Tartalom-szerkesztés + Mohaliget (T5.2)
- Pályák kódból: `scripts/author/build.ts` (segédek: `rect`, `cut`, `ramp`, `sideWalls`, `entrance`, `exitOn`, `water`, `each(skill, ids, when)`), világonként `scripts/author/w1.ts` (`LevelSpec`: geometria, objektumok, lényszám, szükséges, készlet, terv, EN/HU cím+tippek). `npm run levels:author [world|id…]` lefordítja a tervet, a ★★-t a referencia mentettjeire, a ★★★-t a kiosztásszámra kalibrálja, kiírja a JSON-t és a `src/i18n/levels.*.ts`-t; figyelmeztet, ha egy pálya képesség nélkül is nyerhető. Hibakeresés: `npx tsx scripts/trace-level.ts <id> [lény…]` (halálok okkal, lépések, pályák).
- **Tervezési szabályok:** egy akna/alagút tetejétől a lenti talajig ≤ 60 px (a követők a tetejéről esnek!); az egymás alatti Ásók ne ugyanabba az oszlopba ássanak; ugrópárna után a fal pontosan a párna kezdete + 20 px-nél legyen (40 px emelkedés, 20 px sodródás); a csapda az első odaérőt öli meg (a terv ne rá építsen); a tervlépések szekvenciálisak; a morzsalék csak a talppont cellájára reagál és 60 tick múlva tűnik el (1 soros morzsalék-híd csak a vezető utáni ~20 px-en belülieket viszi át; a belépés alá tegyél szilárd foltot).
- W1: 20 pálya (1–8 egy-egy képesség, 9–20 kombinációk; 19–20 480×720), mind ellenőrizve.
- Tutorial: `src/levels/tutorial.ts` (lépések: trigger `start`/`creatureX`/`tick`, cél UI-testid vagy lény, `pause`, teljesítés `ok`/`skillSelected`/`assigned`/`timeout`), `src/app/tutorial.ts` (`TutorialDirector`), `src/ui/TutorialOverlay.tsx` (buborék, szellemkéz, célkiemelés, kihagyás – `pathlings.tutorialSkipped.v1`). Az 1–3. pálya a vezérlést is bemutatja (szünet, sebesség, kamera, visszatekerés).
- A „Játék” gomb a W1-et indítja; `?level=w1-07` közvetlenül (a világ sorrendjében, „következő” működik).

## Bónuszkészlet + napi pálya (T5.6)
- `scripts/author/bonus.ts` → `src/levels/bonus/01–30.json` (vegyes témák: `LevelSpec.theme`, nehézség 1–10). A JSON-ban a `daily` mező: `{ mod, solution }[]` – minden módosító, amit a terv (vagy a spec `daily[modifierKey]` külön terve) még megnyer, saját felvett megoldással. A készletek szándékosan hagynak egy kis tartalékot, hogy több módosító is működjön.
- `src/core/daily.ts` (tiszta, egész aritmetika): módosítók (`fewer` skill −1 / `shorter` −60 s, min. 2:00 marad / `more` +1 szükséges), `applyModifier`, `candidateModifiers`, `epochDay`/`dayLabel`/`parseDayLabel` (UTC naptár Date nélkül), `dailyPick(day, variantCounts)`: 30 naponként seedelt keverés (minden pálya egyszer, blokkhatáron sincs ismétlés), a változat külön seedből.
- `src/levels/catalog.ts` → `BONUS_DAILY` (a pályadefiníciókból a `daily` le van választva), `src/levels/daily.ts` → `dailyLevel(day, pool, variants)`.
- `validate-levels`: bónusz-pályánként `checkDailyVariants` (érvényes, nem duplikált, alkalmazható, a megoldás nyer + hash egyezik), plusz a következő 365 nap minden választása létező változat.
- UI: címképernyő „Napi pálya” gomb a mai módosítóval (`play-daily`, `daily-modifier`), játék közben `daily-badge`; `GameApp.playDaily()`. URL: `?daily=1` vagy `?daily=YYYY-MM-DD` (e2e: `tests/e2e/daily.spec.ts`). Az ingyenes/fizetős kapuzás (csak a mai ingyenes, archívum = Teljes játék) a T8.2-ben jön.
- Figyelem: a bónuszkészlet vagy a változatok listájának módosítása megváltoztatja a jövőbeli napi választásokat (a szimet nem, így `SIM_VERSION` nem érintett).

## Következő lépések sorrendben
1. M5: T5.7 tippek + megoldás-visszajátszás; utána M6–M9.

## Munkamódszer
Lásd az orchestrator repót (`DanielArpadfalvi/orchestrator`, ág `claude/upbeat-bohr-rofk9t`): `CLAUDE.md`, `playbook/PIPELINE.md`, agent-szerepek `.claude/agents/`. Feladatonként egy `game-builder` agent → orkesztrátor ellenőrzi (check/build/e2e/screenshot) → `docs/TASKS.md` pipa → commit + push `main`-re → dashboard.

## Lokális futtatás
- `npm ci` (ha egy másik folyamat is telepít ugyanide, `ENOTEMPTY`-vel elhasal – egyszerre csak egy session dolgozzon egy klónban)
- Lokálisan nincs `/opt/pw-browsers`: egyszer `npx playwright install chromium` (ezen a gépen már telepítve; a `playwright.config.ts` a `/opt/pw-browsers`-re csak akkor esik vissza, ha létezik).
- Dev szerver a böngésző-panelhez: `.claude/launch.json` (`pathlings-dev`, port 5191).
- Node 22 `navigator.language`-t ad (ezen a gépen `hu-HU`) – a tesztek ne feltételezzenek angol kezdőnyelvet.
- `npm run check` · `npm run build` · `npm run test:e2e` (port felülírható: `PW_PORT=4391`).
- Natív Android/iOS build csak GitHub Actions-ben lesz (M7).
