import { describe, expect, it } from 'vitest';
import { stageResolution } from '../../src/render/resolution';

describe('stageResolution', () => {
  it('follows the device pixel ratio, capped at 3', () => {
    expect(stageResolution(1)).toBe(1);
    expect(stageResolution(2)).toBe(2);
    expect(stageResolution(2.625)).toBe(2.625);
    expect(stageResolution(4)).toBe(3);
  });

  it('falls back to 1 for invalid ratios', () => {
    expect(stageResolution(0)).toBe(1);
    expect(stageResolution(Number.NaN)).toBe(1);
  });
});
