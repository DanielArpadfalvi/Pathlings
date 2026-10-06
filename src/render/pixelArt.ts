/**
 * Code-defined pixel art: sprites are arrays of equal-length strings, one character per pixel,
 * looked up in a colour key (`.` = transparent). No bitmap assets (see CLAUDE.md).
 */

export interface PixelGrid {
  rows: readonly string[];
  /** Anchor column: the sprite's horizontal centre pixel (creatures: the foot point column). */
  ox: number;
}

/** Character → 0xRRGGBB. `.` is always transparent and must not be in the key. */
export type ColorKey = Readonly<Record<string, number>>;

export function gridSize(grid: PixelGrid): { w: number; h: number } {
  return { w: grid.rows[0]?.length ?? 0, h: grid.rows.length };
}

/** Problems with a grid (ragged rows, unknown characters, anchor outside); empty = valid. */
export function gridProblems(grid: PixelGrid, key: ColorKey): string[] {
  const problems: string[] = [];
  const { w, h } = gridSize(grid);
  if (w === 0 || h === 0) problems.push('empty grid');
  grid.rows.forEach((row, y) => {
    if (row.length !== w) problems.push(`row ${y}: length ${row.length} ≠ ${w}`);
    for (const ch of row) {
      if (ch !== '.' && key[ch] === undefined) problems.push(`row ${y}: unknown colour '${ch}'`);
    }
  });
  if (grid.ox < 0 || grid.ox >= w) problems.push(`anchor ${grid.ox} outside 0…${w - 1}`);
  return problems;
}

/** RGBA8 pixels of a grid (row-major). */
export function gridToRgba(grid: PixelGrid, key: ColorKey): Uint8Array {
  const { w, h } = gridSize(grid);
  const out = new Uint8Array(w * h * 4);
  grid.rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '.';
      if (ch === '.') continue;
      const rgb = key[ch] ?? 0xff00ff;
      const o = (y * w + x) * 4;
      out[o] = (rgb >> 16) & 0xff;
      out[o + 1] = (rgb >> 8) & 0xff;
      out[o + 2] = rgb & 0xff;
      out[o + 3] = 255;
    }
  });
  return out;
}
