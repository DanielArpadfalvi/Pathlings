import type { ThemeId } from '../core/level';

/**
 * Per-world colours (0xRRGGBB). Terrain materials get four shades (light → dark) for the
 * procedural patterns plus an edge highlight (top surface) and an edge shadow (underside).
 */

export interface MaterialColors {
  shades: readonly [number, number, number, number];
  /** Top surface (cell above is air). */
  highlight: number;
  /** Underside (cell below is air). */
  shadow: number;
}

export interface ThemePalette {
  /** Background gradient, top → bottom. */
  sky: readonly [number, number];
  /** Indexed by material code (air's entry is unused). */
  materials: readonly MaterialColors[];
  water: { body: number; surface: number; deep: number };
  lava: { body: number; surface: number; glow: number };
}

const AIR_COLORS: MaterialColors = { shades: [0, 0, 0, 0], highlight: 0, shadow: 0 };

/** Shared by every theme: metal, one-way walls and crumble read the same everywhere. */
const METAL: MaterialColors = {
  shades: [0xc9d2de, 0x9aa6b6, 0x6f7b8c, 0x4a5464],
  highlight: 0xeef3f8,
  shadow: 0x323a46,
};
const ONEWAY: MaterialColors = {
  shades: [0xf0c46a, 0xc98f3a, 0x9a6524, 0x6d4519],
  highlight: 0xffe3a0,
  shadow: 0x4a2e10,
};
const CRUMBLE: MaterialColors = {
  shades: [0xe8d3a8, 0xcdb184, 0xa88a60, 0x7a6244],
  highlight: 0xfaedcf,
  shadow: 0x5a4630,
};

function themeMaterials(soil: MaterialColors, rock: MaterialColors): MaterialColors[] {
  // Order = material codes: air, soil, rock, metal, one-way L, one-way R, crumble.
  return [AIR_COLORS, soil, rock, METAL, ONEWAY, ONEWAY, CRUMBLE];
}

export const PALETTES: Readonly<Record<ThemeId, ThemePalette>> = {
  glade: {
    sky: [0x1b2f4a, 0x3d6b6a],
    materials: themeMaterials(
      {
        shades: [0x9a6b3e, 0x7d5430, 0x633f22, 0x4a2d17],
        highlight: 0x7fd35a,
        shadow: 0x33200f,
      },
      {
        shades: [0x9c978c, 0x7f7a70, 0x635f57, 0x48453f],
        highlight: 0xbab5a8,
        shadow: 0x2f2d29,
      },
    ),
    water: { body: 0x2f7fd0, surface: 0x9fd8ff, deep: 0x1d4f8a },
    lava: { body: 0xe8541c, surface: 0xffd04a, glow: 0xff8a2a },
  },
  deep: {
    sky: [0x0d0f24, 0x22264a],
    materials: themeMaterials(
      {
        shades: [0x6e5a8a, 0x574672, 0x42355a, 0x2e2542],
        highlight: 0x9b86c4,
        shadow: 0x1d1730,
      },
      {
        shades: [0x7d8aa6, 0x5f6b88, 0x47516b, 0x323a50],
        highlight: 0x9fe6ff,
        shadow: 0x20263a,
      },
    ),
    water: { body: 0x2a6fc0, surface: 0x8fd0ff, deep: 0x163f78 },
    lava: { body: 0xf05a1a, surface: 0xffdc5a, glow: 0xff9a30 },
  },
  clockworks: {
    sky: [0x2a1a14, 0x5a3a24],
    materials: themeMaterials(
      {
        shades: [0xa8774a, 0x8a5e38, 0x6c4729, 0x50331c],
        highlight: 0xd9a86a,
        shadow: 0x341f10,
      },
      {
        shades: [0xa08a78, 0x837060, 0x67574a, 0x4c4037],
        highlight: 0xc4ad98,
        shadow: 0x312a24,
      },
    ),
    water: { body: 0x3a86c8, surface: 0xa6dcff, deep: 0x22558a },
    lava: { body: 0xe25a20, surface: 0xffcc48, glow: 0xff8c2c },
  },
  skyreach: {
    sky: [0x5aa0e0, 0xcfe8ff],
    materials: themeMaterials(
      {
        shades: [0x8fb06a, 0x739352, 0x5a763e, 0x42582c],
        highlight: 0xd8f5a8,
        shadow: 0x2e3e1e,
      },
      {
        shades: [0xd0d4dc, 0xaeb3be, 0x8c92a0, 0x6a7080],
        highlight: 0xf4f6fa,
        shadow: 0x4c5262,
      },
    ),
    water: { body: 0x3a90e0, surface: 0xc0e8ff, deep: 0x2260a8 },
    lava: { body: 0xe8541c, surface: 0xffd04a, glow: 0xff8a2a },
  },
};
