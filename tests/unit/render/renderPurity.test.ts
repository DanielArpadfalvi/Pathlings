import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * src/render reads core state and never mutates it (CLAUDE.md). Statically: value imports from
 * src/core must be pure readers / constants from this allowlist (types are always fine), and the
 * renderer never imports the game layer that steps the sim. The runtime check lives in
 * worldRenderer.test.ts.
 */

const RENDER_DIR = join(import.meta.dirname, '../../../src/render');

/** Pure queries and constants the renderer may use. Add only functions that do not write. */
export const CORE_READ_ALLOWLIST = new Set([
  // terrain materials + pure rect helper
  'AIR',
  'SOIL',
  'ROCK',
  'METAL',
  'ONEWAY_LEFT',
  'ONEWAY_RIGHT',
  'CRUMBLE',
  'unionRect',
  // creatures
  'CreatureState',
  'EXIT_TICKS',
  'PERM_SCALER',
  'PERM_GLIDER',
  'hasPerm',
  'fuseSeconds',
  // objects
  'objectRect',
  'trapArmed',
  // editor preview: rasterizes a level definition into a fresh terrain (no sim involved)
  'buildTerrain',
]);

interface CoreImport {
  file: string;
  names: string[];
}

/** Value (non-type) names imported from core modules, per import statement. */
export function coreValueImports(source: string, file = ''): CoreImport[] {
  const out: CoreImport[] = [];
  const re = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]((?:\.\.\/)+core(?:\/[^'"]*)?)['"]/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    if (m[1]) continue; // `import type { … }`
    const names = (m[2] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('type '))
      .map((s) => s.split(/\s+as\s+/)[0]!.trim());
    out.push({ file, names });
  }
  if (/import\s+\*\s+as\s+\w+\s+from\s+['"](\.\.\/)+core/.test(source)) {
    out.push({ file, names: ['* (namespace import)'] });
  }
  return out;
}

function listTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listTsFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe('render purity (static)', () => {
  it('parses value vs type imports (self-test)', () => {
    const src = [
      "import type { Sim } from '../core/world';",
      "import { type Creature, CreatureState, step as s } from '../core/creature';",
      "import { AIR } from '../../core/terrain';",
    ].join('\n');
    expect(coreValueImports(src).flatMap((i) => i.names)).toEqual(['CreatureState', 'step', 'AIR']);
    expect(coreValueImports("import * as core from '../core';")[0]!.names).toEqual([
      '* (namespace import)',
    ]);
  });

  it('src/render imports only pure readers from src/core', () => {
    const files = listTsFiles(RENDER_DIR);
    expect(files.length).toBeGreaterThan(5);
    const problems = files.flatMap((f) =>
      coreValueImports(readFileSync(f, 'utf8'), relative(RENDER_DIR, f)).flatMap((imp) =>
        imp.names.filter((n) => !CORE_READ_ALLOWLIST.has(n)).map((n) => `${imp.file}: ${n}`),
      ),
    );
    expect(problems).toEqual([]);
  });

  it('src/render never imports the game layer (which steps the sim)', () => {
    const offenders = listTsFiles(RENDER_DIR).filter((f) =>
      /from\s+['"](\.\.\/)+game(\/|['"])/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
