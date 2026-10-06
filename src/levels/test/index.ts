/**
 * Small hand-made test levels with reference solutions (valid per `validateLevel`). Shared by
 * core tests, the renderer / e2e (`?level=<id>`) and the playable prototype; the solutions are
 * golden – see tests/unit/core/sim.test.ts.
 */

import type { LevelDef } from '../../core/level';
import { clockwork } from './clockwork';
import { cliff } from './cliff';
import { digDown } from './digDown';
import { showcase } from './showcase';
import { tunnel } from './tunnel';
import { walkHome } from './walkHome';

export { cliff, clockwork, digDown, showcase, tunnel, walkHome };

export const FIXTURE_LEVELS: readonly LevelDef[] = [walkHome, digDown, tunnel, clockwork, cliff];

/** Every level loadable via `?level=<id>`: the fixtures plus the renderer showcase. */
export const TEST_LEVELS: readonly LevelDef[] = [...FIXTURE_LEVELS, showcase];

export function findTestLevel(id: string): LevelDef | undefined {
  return TEST_LEVELS.find((l) => l.id === id);
}
