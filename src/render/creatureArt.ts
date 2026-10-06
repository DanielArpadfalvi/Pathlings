import type { ColorKey, PixelGrid } from './pixelArt';

/**
 * The Pathling: a small round-headed forest creature with a leaf cap (original design, §1.11).
 * Every frame faces right; the renderer mirrors it for left-walkers. Frames are 7 × 11 with the
 * feet on the bottom row and the foot column at x = 3 (the glider adds a leaf canopy on top).
 */

export const CREATURE_KEY: ColorKey = {
  g: 0xb6ef6a, // leaf highlight
  l: 0x5cb83a, // leaf
  L: 0x2f7a2a, // leaf shade
  s: 0xf4d6a2, // skin
  S: 0xcf9f6c, // skin shade
  e: 0x1a1626, // eye
  b: 0x4f8fe0, // tunic
  B: 0x2c5aa4, // tunic shade
  f: 0x5a3a20, // feet
  t: 0xd2d8e2, // tool blade
  h: 0x9a6a38, // tool handle
  p: 0xe0b072, // plank
};

// Heads: rows 0–5 (leaf cap, round head). Side view looks right.
const HEAD_SIDE = ['...lg..', '..llLl.', '.sssss.', 'Sssses.', 'Ssssss.', '.SSss..'];
const HEAD_FRONT = ['...lg..', '..llLl.', '.sssss.', '.seses.', '.sssss.', '..SSS..'];

function frame(head: readonly string[], body: readonly string[], ox = 3): PixelGrid {
  return { rows: [...head, ...body], ox };
}

/** Replaces row 5 of a head (used for raised hands beside the chin). */
function withChin(head: readonly string[], row5: string): string[] {
  return [...head.slice(0, 5), row5];
}

const walk: PixelGrid[] = [
  frame(HEAD_SIDE, ['..bbb..', '.bbbbs.', '..bBb..', '..f.f..', '.f...f.']),
  frame(HEAD_SIDE, ['..bbb..', '..bbbs.', '..bBb..', '...f...', '..ff...']),
  frame(HEAD_SIDE, ['..bbb..', '.sbbbb.', '..bBb..', '..f.f..', '.f..f..']),
  frame(HEAD_SIDE, ['..bbb..', '..bbbs.', '..bBb..', '...f...', '...ff..']),
];

const fall: PixelGrid[] = [
  frame(withChin(HEAD_SIDE, 's.SSs.s'), ['bbbbbbb', '..bbb..', '..bBb..', '..f.f..', '.f...f.']),
  frame(withChin(HEAD_SIDE, '.sSSss.'), ['.bbbbb.', '..bbb..', '..bBb..', '.f...f.', 'f.....f']),
];

const CANOPY = ['.ggllllg.', 'glllLLlll', 'L.L...L.L', '....h....'];
const glide: PixelGrid[] = [0, 1].map((k) => ({
  rows: [
    ...CANOPY,
    ...withChin(HEAD_SIDE, '.sSSss.').map((r) => `.${r}.`),
    '..bbbbb..',
    '...bbb...',
    '...bBb...',
    k === 0 ? '...f.f...' : '..f...f..',
    k === 0 ? '..f...f..' : '...f.f...',
  ],
  ox: 4,
}));

const climb: PixelGrid[] = [
  frame(
    ['...lg..', '..llLls', '.ssssss', 'Sssses.', 'Ssssss.', '.SSss..'],
    ['..bbbb.', '..bbbs.', '..bBb..', '...ff..', '...f.f.'],
  ),
  frame(HEAD_SIDE, ['..bbbbs', '..bbbb.', '..bBbs.', '...f.f.', '...ff..']),
];

const warden: PixelGrid[] = [
  frame(HEAD_FRONT, ['.bbbbb.', 'sbbbbbs', '..bBb..', '..f.f..', '.ff.ff.']),
  frame(withChin(HEAD_FRONT, 's.SSS.s'), ['bbbbbbb', '..bbb..', '..bBb..', '..f.f..', '.ff.ff.']),
];

const build: PixelGrid[] = [
  frame(HEAD_SIDE, ['..bbb..', '.bbbspp', '..bBb..', '..ff...', '.ff.f..']),
  frame(HEAD_SIDE, ['..bbb..', '.bbbs..', '..bBbpp', '..ff...', '.ff.f..']),
];

const burrow: PixelGrid[] = [
  frame(HEAD_SIDE, ['..bbb..', '.bbbsht', '..bBb.t', '..f.f..', '.f...f.']),
  frame(HEAD_SIDE, ['..bbb..', 'shbbb..', 't.bBb..', '..f.f..', '.f...f.']),
];

const slope: PixelGrid[] = [
  frame(
    ['...lg.t', '..llLht', '.sssssh', 'Sssses.', 'Ssssss.', '.SSss..'],
    ['..bbbs.', '.bbbb..', '..bBb..', '..f.f..', '.f...f.'],
  ),
  frame(HEAD_SIDE, ['..bbb..', '.bbbbs.', '..bBbh.', '..f.fh.', '.f...tt']),
];

const delve: PixelGrid[] = [
  frame(HEAD_SIDE, ['..bbbh.', '.bbbsh.', '..bBbh.', '..f.fh.', '.f..tt.']),
  frame(withChin(HEAD_SIDE, '.SSssh.'), ['..bbbh.', '.bbbsh.', '..bBbt.', '..f.ft.', '.f...f.']),
];

export type PoseId =
  'walk' | 'fall' | 'glide' | 'climb' | 'warden' | 'build' | 'burrow' | 'slope' | 'delve';

export const CREATURE_FRAMES: Readonly<Record<PoseId, readonly PixelGrid[]>> = {
  walk,
  fall,
  glide,
  climb,
  warden,
  build,
  burrow,
  slope,
  delve,
};

/** 3 × 5 digits for the Popper countdown shown above the head. */
export const DIGIT_KEY: ColorKey = { w: 0xffffff, k: 0x1a1626 };
const DIGIT_ROWS = [
  ['www', 'w.w', 'w.w', 'w.w', 'www'],
  ['.w.', 'ww.', '.w.', '.w.', 'www'],
  ['www', '..w', 'www', 'w..', 'www'],
  ['www', '..w', '.ww', '..w', 'www'],
  ['w.w', 'w.w', 'www', '..w', '..w'],
  ['www', 'w..', 'www', '..w', 'www'],
  ['www', 'w..', 'www', 'w.w', 'www'],
  ['www', '..w', '..w', '.w.', '.w.'],
  ['www', 'w.w', 'www', 'w.w', 'www'],
  ['www', 'w.w', 'www', '..w', 'www'],
];
export const DIGITS: readonly PixelGrid[] = DIGIT_ROWS.map((rows) => ({ rows, ox: 1 }));

/** 3 × 3 badges above the head for permanent skills (shape + colour, §1.10). */
export const BADGE_KEY: ColorKey = { c: 0xffc94a, g: 0x8ff06a };
export const SCALER_BADGE: PixelGrid = { rows: ['.c.', 'ccc', 'c.c'], ox: 1 };
export const GLIDER_BADGE: PixelGrid = { rows: ['ggg', 'g.g', '.g.'], ox: 1 };
