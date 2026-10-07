import type { LevelDef } from '../level';
import { runSolution } from '../replay';
import { SIM_VERSION } from '../version';
import { type DecodedLevel, decodeLevel } from './levelCode';

/**
 * "Verified" check of a shared level (§1.9, §3.3): the embedded solution is replayed headless on
 * the rasterized level; the level is verified only when the replay wins (saved ≥ required) and
 * ends in exactly the recorded state hash. Anything else is still playable, just not verified.
 */
export type VerifyStatus =
  | 'verified'
  /** The code carries no solution (draft). */
  | 'noSolution'
  /** The replay does not save enough creatures. */
  | 'unsolved'
  /** The replay wins but ends in a different state: level or solution was altered. */
  | 'hashMismatch'
  /** Made with an older engine whose behaviour this version does not reproduce. */
  | 'olderVersion';

export interface VerifyResult {
  status: VerifyStatus;
  verified: boolean;
  saved: number;
  required: number;
  ticks: number;
}

export function verifyLevel(level: LevelDef, simVersion: number = SIM_VERSION): VerifyResult {
  const base = { saved: 0, required: level.required, ticks: 0 };
  if (simVersion !== SIM_VERSION) return { ...base, status: 'olderVersion', verified: false };
  if (!level.solution) return { ...base, status: 'noSolution', verified: false };
  const r = runSolution(level);
  const result = { saved: r.saved, required: r.required, ticks: r.ticks };
  if (!r.won || r.rejected > 0) return { ...result, status: 'unsolved', verified: false };
  if (!r.hashMatches) return { ...result, status: 'hashMismatch', verified: false };
  return { ...result, status: 'verified', verified: true };
}

export interface LoadedCode extends DecodedLevel {
  verify: VerifyResult;
}

/** Decodes a pasted code and verifies its solution. Throws `LevelCodeError` for bad codes. */
export function loadLevelCode(text: string): LoadedCode {
  const decoded = decodeLevel(text);
  return { ...decoded, verify: verifyLevel(decoded.level, decoded.simVersion) };
}
