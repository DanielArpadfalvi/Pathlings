import type { ColorKey, PixelGrid } from './pixelArt';

/**
 * Level objects as pixel grids, each exactly the size of its zone (`objectRect` in core), drawn
 * with its top-left at the zone's top-left. Water and lava have free sizes and are drawn with
 * Graphics instead (see `objectLayer.ts`).
 */

export const OBJECT_KEY: ColorKey = {
  // wood
  w: 0xb07a44,
  W: 0x7a4e26,
  d: 0x4a2c14,
  // metal / dark
  m: 0xb8c2cf,
  M: 0x6e7888,
  k: 0x1a1626,
  // exit glow
  y: 0xfff1a8,
  Y: 0xffd34a,
  o: 0xff9a2a,
  // leaves
  l: 0x5cb83a,
  L: 0x2f7a2a,
  // portal
  v: 0xc89bff,
  V: 0x7a4ad8,
  u: 0x3a1f7a,
  // trap
  r: 0xe0473a,
  R: 0x8a1f1a,
  // spring
  s: 0x8ff06a,
  S: 0x3f9a2a,
};

/** Entrance hatch (16 × 10): a wooden trapdoor in a frame, open at the bottom. */
export const ENTRANCE_ART: PixelGrid = {
  rows: [
    'dWWWWWWWWWWWWWWd',
    'dwwwwwwwwwwwwwwd',
    'dwWwwwwwwwwwwWwd',
    'dwwMMwwwwwwMMwwd',
    'dWWWWWWWWWWWWWWd',
    'dk............kd',
    'dk............kd',
    'dW............Wd',
    'dw............wd',
    'dd............dd',
  ],
  ox: 8,
};

/** Exit (12 × 12): a little leaf-roofed burrow door with a warm glow. */
export const EXIT_ART: PixelGrid = {
  rows: [
    '....lLLl....',
    '..lllLLlll..',
    '.lLlllllLLl.',
    'lllLLllllLll',
    '.dWWWWWWWWd.',
    '.dWkyyyykWd.',
    '.dWyYYYYyWd.',
    '.dWyYooYyWd.',
    '.dWyYooYyWd.',
    '.dWyYooYyWd.',
    '.dWyYooYyWd.',
    'dddddddddddd',
  ],
  ox: 6,
};

/** Trap (10 × 10): spiked jaws on a post; the spikes go dark while it reloads. */
export const TRAP_ART: PixelGrid = {
  rows: [
    '.r.r..r.r.',
    'rRrRrrRrRr',
    'MmmmmmmmmM',
    'M........M',
    'M........M',
    'MmmmmmmmmM',
    'rRrRrrRrRr',
    '.r.r..r.r.',
    '....MM....',
    '...MMMM...',
  ],
  ox: 5,
};

export const TRAP_RELOADING_ART: PixelGrid = {
  rows: TRAP_ART.rows.map((r) => r.replace(/r/g, 'M').replace(/R/g, 'k')),
  ox: 5,
};

/** Teleporter entry (8 × 12): a swirling oval portal. */
export const TELEPORT_ART: PixelGrid = {
  rows: [
    '..VVVV..',
    '.VvvvvV.',
    'VvuuuuvV',
    'Vvu..uvV',
    'Vu.vv.uV',
    'Vu.vv.uV',
    'Vu.vv.uV',
    'Vu.vv.uV',
    'Vvu..uvV',
    'VvuuuuvV',
    '.VvvvvV.',
    'MMMMMMMM',
  ],
  ox: 4,
};

/** Teleporter destination marker (5 × 3), drawn just above the target foot point. */
export const TELEPORT_TARGET_ART: PixelGrid = { rows: ['v...v', '.vVv.', '..V..'], ox: 2 };

/** Bounce pad (12 × 4): a green spring plate. */
export const BOUNCE_ART: PixelGrid = {
  rows: ['ssssssssssss', 'SSSSSSSSSSSS', '.M.M.M.M.M.M', 'MMMMMMMMMMMM'],
  ox: 6,
};
