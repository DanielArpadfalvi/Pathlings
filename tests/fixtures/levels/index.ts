/**
 * Small hand-made test levels with reference solutions (valid per `validateLevel`). Shared by
 * core, renderer and e2e tests; the solutions are golden – see tests/unit/core/fixtures.test.ts.
 */

import type { LevelDef } from '../../../src/core/level';
import { clockwork } from './clockwork';
import { cliff } from './cliff';
import { digDown } from './digDown';
import { tunnel } from './tunnel';
import { walkHome } from './walkHome';

export { cliff, clockwork, digDown, tunnel, walkHome };

export const FIXTURE_LEVELS: readonly LevelDef[] = [walkHome, digDown, tunnel, clockwork, cliff];
