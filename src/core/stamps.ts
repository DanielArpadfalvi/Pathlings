/**
 * Data-defined stamp shapes for the editor's stamp tool (§1.3 "bélyeg").
 *
 * Each stamp is a grid of characters: `.` = leave the cell untouched, `#` = the op's material,
 * `0`–`6` = that exact material (`0` cuts air). Stamps are referenced from levels by id, so a
 * shipped stamp must never change (that would alter shared level codes – bump `SIM_VERSION`).
 * New stamps may be added freely.
 */

export interface StampDef {
  readonly rows: readonly string[];
}

export type StampLibrary = Readonly<Record<string, StampDef>>;

export const STAMPS: StampLibrary = {
  boulder: {
    rows: [
      '...####...',
      '.########.',
      '##########',
      '##########',
      '##########',
      '.########.',
      '...####...',
    ],
  },
  pillar: {
    rows: ['######', '.####.', '.####.', '.####.', '.####.', '.####.', '.####.', '######'],
  },
  arch: {
    rows: [
      '############',
      '############',
      '###......###',
      '##........##',
      '##........##',
      '##........##',
    ],
  },
  ledge: {
    rows: ['##########', '.########.', '...####...'],
  },
  crystal: {
    rows: ['..#..', '.###.', '.###.', '#####', '#####', '.###.', '..#..'],
  },
  gear: {
    rows: [
      '...##...',
      '.######.',
      '.##33##.',
      '###33###',
      '###33###',
      '.##33##.',
      '.######.',
      '...##...',
    ],
  },
};

/** Width/height of a stamp (all rows have the same length). */
export function stampSize(def: StampDef): { w: number; h: number } {
  return { w: def.rows[0]?.length ?? 0, h: def.rows.length };
}
