# Accessibility & localisation audit (T6.4)

Audit of the DOM overlay and the game's own options, 2026-10-07. Severity: **major** blocks a group of players, **minor** is friction. Status after this change.

## Checklist

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Every user-visible string goes through `src/i18n` (EN + HU) | ✅ | `tests/unit/i18nUsage.test.ts` scans `src/ui/*.tsx` for literal text and literal `aria-label`/`title`/`placeholder`; `tests/unit/i18n.test.ts` fails on a missing or empty key in either language; placeholders (`{n}`) must match the English text; dynamically built keys (skills, worlds, themes, settings options, modifiers) are enumerated in the test. |
| 2 | No information by colour alone | ✅ | Skills: code-drawn icon + name in the accessible label + stock number. Level select: solved = stars, locked = padlock, paid = padlock + dashed border + note with the price. Direction filter: arrow shape. Warden/selection highlight: arrow marker as well as colour. Help ready: a "!" badge (fixed in this change; it was a border colour only). |
| 3 | Touch targets ≥ 48 × 48 pt | ✅ | Fixed: HUD menu button (40 → 48), release −/+ (46 → 48), tutorial "skip" (44 → 48). Skill buttons, controls, options, level cards ≥ 48. |
| 4 | Adjustable touch precision | ✅ | Selection radius 20 / 28 / 36 pt; loupe after 250 ms hold; direction filter; pause while selecting. |
| 5 | Time pressure can be removed | ✅ | Pause at any time (skills can be assigned while paused), 0.5× speed, unlimited rewind, auto-pause while selecting. |
| 6 | Motion | ✅ | Reduced motion follows the system or is forced on/off: no screen shake, no Popper tremble, CSS transitions off. |
| 7 | Text size and contrast | ✅ | "Larger text" scales every font (`--text-scale` 1.25); "High contrast" = black backgrounds, white borders and text. Default dim text #a7b0c8 on #0b1020 ≈ 9:1. |
| 8 | One-handed / left-handed | ✅ | Portrait, controls in the bottom third; left-handed layout mirrors the skill bar, control bar and floating buttons. |
| 9 | Screen readers | ✅ (minor limits) | Dialogs have `role="dialog"`, `aria-modal`, a label; toggles are `role="switch"`, choices `role="radiogroup"`/`radio` with `aria-checked`; icon buttons have labels; the canvas is a named image (`app.canvas`). The level itself is visual by nature – documented limitation. |
| 10 | Keyboard / switch control | ✅ | Visible focus ring (`:focus-visible`); web shortcuts 1–8, space, +/−, f, r, z. |
| 11 | Audio and haptics | ✅ | Separate master / effects / music volumes, vibration toggle; no information is sound-only (every cue has a visual). |
| 12 | Language | ✅ | Auto (device) / English / Magyar, switches live, `<html lang>` follows. |

No open **major** findings.
