import { describe, expect, it } from 'vitest';
import {
  FNV_OFFSET,
  fnv1aByte,
  fnv1aBytes,
  fnv1aString,
  fnv1aU32,
  hashBytes,
  hashHex,
} from '../../../src/core/hash';
import { ceilDiv, clampInt, floorDiv } from '../../../src/core/imath';

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

describe('FNV-1a', () => {
  it('matches the reference 32-bit test vectors', () => {
    expect(hashBytes([])).toBe(0x811c9dc5);
    expect(hashBytes(ascii('a'))).toBe(0xe40c292c);
    expect(hashBytes(ascii('foobar'))).toBe(0xbf9cf968);
  });

  it('folds bytes, u32 (little-endian) and strings consistently', () => {
    expect(fnv1aByte(FNV_OFFSET, 0x161)).toBe(fnv1aByte(FNV_OFFSET, 0x61));
    expect(fnv1aU32(FNV_OFFSET, 0x04030201)).toBe(hashBytes([1, 2, 3, 4]));
    expect(fnv1aU32(FNV_OFFSET, -1)).toBe(hashBytes([255, 255, 255, 255]));
    expect(fnv1aString(FNV_OFFSET, 'ab')).toBe(fnv1aBytes(fnv1aU32(FNV_OFFSET, 2), [97, 0, 98, 0]));
    expect(fnv1aString(FNV_OFFSET, 'ő')).not.toBe(fnv1aString(FNV_OFFSET, 'o'));
    expect(fnv1aBytes(FNV_OFFSET, new Uint8Array([1, 2]))).toBe(hashBytes([1, 2]));
  });

  it('formats as 8 hex digits', () => {
    expect(hashHex(0x1a)).toBe('0000001a');
    expect(hashHex(0xbf9cf968)).toBe('bf9cf968');
  });
});

describe('integer math', () => {
  it('floorDiv / ceilDiv round toward −∞ / +∞', () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(7, -2)).toBe(-4);
    expect(floorDiv(6, 3)).toBe(2);
    expect(ceilDiv(7, 2)).toBe(4);
    expect(ceilDiv(-7, 2)).toBe(-3);
    expect(ceilDiv(0, 5)).toBe(0);
    expect(Object.is(ceilDiv(0, 5), 0)).toBe(true);
    expect(ceilDiv(-1, 2)).toBe(0);
  });

  it('clampInt', () => {
    expect(clampInt(5, 0, 3)).toBe(3);
    expect(clampInt(-1, 0, 3)).toBe(0);
    expect(clampInt(2, 0, 3)).toBe(2);
  });
});
