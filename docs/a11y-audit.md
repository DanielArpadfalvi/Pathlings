# Accessibility audit (T6.4) – 2026-10-08

Checklist from PLAN §1.7 / §1.10 plus WCAG 2.1 AA for the DOM overlay. The Pixi canvas is the game
world; every control the player operates is DOM.

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Automated WCAG 2.1 A/AA scan (axe-core) of title, world map, level select, settings, play-a-code, level HUD, help, end screen, editor | ✅ 0 violations | `tests/e2e/a11y.spec.ts` (runs in CI) |
| 2 | Text contrast ≥ 4.5:1 | ✅ fixed: primary button green darkened (`#2e7320`) | axe `color-contrast` |
| 3 | Touch targets ≥ 48 pt (skill / control / icon buttons, menu tiles, settings rows, segmented choices) | ✅ fixed: segmented choices 44 → 48 px | `styles.css` |
| 4 | No colour-only information: skills = icon + stock number; locked levels = padlock (+ price); stars = filled/outlined shapes; skill marks above creatures are symbols | ✅ | `icons.tsx`, `Menu.tsx`, `creatureLayer.ts` |
| 5 | Every icon-only button has an accessible name; star rows are labelled images | ✅ fixed: `role="img"` on star rows | axe `button-name`, `aria-prohibited-attr` |
| 6 | Dialogs: `role="dialog"`, `aria-modal`, title, close button, Escape closes | ✅ added Escape (`useEscape`) | `HelpPanel`, `SettingsPanel`, full-game note |
| 7 | Settings: 0.5× speed, pause-while-selecting, touch area 20/28/36 pt, left-handed, high contrast, reduce motion, larger text | ✅ | `tests/e2e/settings.spec.ts` |
| 8 | Language: EN + HU complete, same placeholders, no hard-coded UI text, `<html lang>` follows the setting | ✅ | `tests/unit/i18n.test.ts` |
| 9 | Sound and haptics are never the only signal (e.g. "last 3 planks" = red sparkle + rising pitch) | ✅ | `effects.ts`, `sfx.ts` |
| 10 | Page zoom | ➖ intentionally off (`meta-viewport` rule disabled): pinch zooms the game camera; "Larger text and buttons" covers enlargement | `index.html` |

Minor findings left for later (not blocking):
- The low-time warning in the HUD changes colour only; the clock itself stays readable. Could add an icon.
- The level editor sheets (`Panels.tsx`) close with their buttons only, not with Escape.
- Start speed and reduce motion apply from the next level, not to the running one.
