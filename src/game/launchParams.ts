/**
 * Launch options from the page URL (prototype / e2e hooks until the menus exist):
 * - `level=<id>`  play that test level (default: attract mode on the clockwork level);
 * - `autoplay=1`  replay the level's reference solution (always on in attract mode);
 * - `seek=<tick>` fast-forward to that tick on start;
 * - `pause=1`     start paused (with `seek`: a frozen frame for screenshots);
 * - `skill=<id>`  preselect a skill (e2e / testing; players use the skill bar);
 * - `filter=left|right` start with that direction filter;
 * - `autopause=1` pause while a finger is selecting (settings arrive with T6.2);
 * - `editor=1`   open the level editor;
 * - `daily=<YYYY-MM-DD>|today` play the daily level of that UTC date (the title card uses today);
 * - `debug=1`     expose read-only render stats as `window.__pathlings`.
 */
import { type SkillId, isSkillId } from '../core/level';
import type { DirectionFilter } from '../input/selection';

export interface LaunchParams {
  levelId: string | null;
  autoplay: boolean;
  seek: number;
  paused: boolean;
  debug: boolean;
  skill: SkillId | null;
  filter: DirectionFilter;
  autoPause: boolean;
  editor: boolean;
  /** UTC date of the daily level to open (`today` resolves at start), null: none. */
  daily: string | null;
}

export const ATTRACT_LEVEL_ID = 'test-clockwork';

function flag(p: URLSearchParams, name: string): boolean {
  const v = p.get(name);
  return v !== null && v !== '0' && v !== 'false';
}

export function parseLaunchParams(search: string): LaunchParams {
  const p = new URLSearchParams(search);
  const seek = Number.parseInt(p.get('seek') ?? '', 10);
  return {
    levelId: p.get('level') || null,
    autoplay: flag(p, 'autoplay'),
    seek: Number.isFinite(seek) && seek > 0 ? Math.min(seek, 60 * 60 * 10) : 0,
    paused: flag(p, 'pause'),
    debug: flag(p, 'debug'),
    skill: isSkillId(p.get('skill')) ? (p.get('skill') as SkillId) : null,
    autoPause: flag(p, 'autopause'),
    editor: flag(p, 'editor'),
    daily: /^(\d{4}-\d{2}-\d{2}|today)$/.test(p.get('daily') ?? '') ? p.get('daily') : null,
    filter: p.get('filter') === 'left' ? 'left' : p.get('filter') === 'right' ? 'right' : 'both',
  };
}
