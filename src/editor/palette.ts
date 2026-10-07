import type { ThemeId } from '../core/level';

/**
 * The editor's stamp palette per world (§1.3: ~16 stamps per theme): eight shared shapes plus
 * eight themed ones. Ids refer to `STAMPS` in core.
 */
const SHARED = ['boulder', 'pillar', 'arch', 'ledge', 'slab', 'step', 'mound', 'block'];

export const THEME_STAMPS: Readonly<Record<ThemeId, readonly string[]>> = {
  glade: [...SHARED, 'tree', 'stump', 'log', 'bush', 'mushroom', 'rockpile', 'root', 'bridge'],
  deep: [
    ...SHARED,
    'crystal',
    'cluster',
    'stalactite',
    'stalagmite',
    'column',
    'vein',
    'cavemouth',
    'geode',
  ],
  clockworks: [...SHARED, 'gear', 'cog', 'pipe', 'elbow', 'piston', 'girder', 'crate', 'chain'],
  skyreach: [
    ...SHARED,
    'cloud',
    'island',
    'crumbles',
    'spire',
    'shelf',
    'windrock',
    'cliffedge',
    'bridge',
  ],
};

/** Materials offered by the material picker, in order. */
export const PAINT_MATERIALS = [1, 2, 3, 4, 5, 6] as const;
