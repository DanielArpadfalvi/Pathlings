# Pathlings – contributor guide (for humans and agents)

Portrait "guide the walkers home" puzzle game: creatures march automatically, the player hands out a limited set of skills on destructible/buildable pixel terrain. Includes a level editor and offline level-code sharing. Plan: `docs/PLAN.md` (Hungarian). Task list / status: `docs/TASKS.md`.

**Starting a new session? Read `docs/HANDOFF.md` first** (current state, next steps, local setup).

## Stack
Vite + TypeScript (strict) · PixiJS v8 (gameplay canvas) · Preact (DOM UI overlay) · Capacitor 8 (iOS/Android) · fflate · Vitest · Playwright.

## Architecture rules
- `src/core/` is pure, deterministic game logic: no DOM, no Pixi, no `Math.random`, no `Date.now`/`performance.now`, **integer-only simulation state** (positions in whole world pixels, timers in ticks). Fixed 60 Hz ticks. Seeded RNG (`src/core/rng.ts`) only where randomness is needed (daily level pick).
- Every level run must be replayable from level definition + input log. Commands reference creatures by stable id (spawn order), never by screen coordinates. Camera moves are not part of the log.
- The rasterizer (editor ops → terrain mask) lives in `src/core` and is integer-only: a level code must produce the identical terrain on every platform.
- `SIM_VERSION` (in `src/core`) must be bumped for any change that alters simulation results; update golden hashes and re-validate every built-in level solution in the same change. Never silently change behaviour that shipped – shared level codes depend on it.
- Built-in levels (`src/levels/**`) each carry a reference solution; `scripts/validate-levels` replays all of them in `npm run check`.
- A level code can only be generated for a level the author has solved in test-play; loading a code replays its embedded solution and marks it "verified" only on an exact match.
- `src/render/` reads core state and draws it; it never mutates core state. Terrain texture updates use dirty rects.
- `src/input/` turns pointer events into core commands (smart nearest-creature selection, loupe, direction filter) or camera moves.
- `src/platform/` wraps every native/Capacitor API (storage, haptics, IAP, clipboard, share, lifecycle, deep links) behind an interface with a web/mock implementation. No other module imports `@capacitor/*` or RevenueCat directly.
- All user-visible strings go through `src/i18n/` (EN + HU).
- No external bitmap assets: graphics (pixel sprites as code-defined grids, terrain patterns, icon, splash) and audio are generated in code.
- No analytics, crash-reporting or ad SDKs (the store privacy label is "Data Not Collected").
- Monetization: free download, non-consumable `full_game` unlock and optional cosmetic `supporter`. No ads, energy, currencies or consumables. Never gate editor tools/objects or playing shared codes. Never use the words "Lite", "Demo" or "Trial" in the app or store texts.
- Original IP only: never use the reference game's name, characters, skill names or art – not in code, assets, store texts or keywords.

## Commands
- `npm run dev` – dev server
- `npm run check` – typecheck + lint + unit tests + level validation (must pass before every commit)
- `npm run test:e2e` – Playwright (Chromium at /opt/pw-browsers; never run `playwright install`)
- `npm run build` – production web build

## Conventions
- Small focused modules, named exports, no default exports.
- Unit tests in `tests/unit/**`, e2e in `tests/e2e/**`.
- Core logic changes need unit tests (scenario tests on tiny hand-built terrains are preferred). Bug fixes need a regression test.
- Native Android/iOS builds run only in GitHub Actions (dl.google.com is blocked in the cloud dev container).
- Bundle ID `com.arpadfalvi.pathlings` is defined in exactly one place.
