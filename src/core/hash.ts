/**
 * FNV-1a (32-bit) hashing for state hashes, golden tests and level-code verification.
 *
 * The running hash is a plain unsigned 32-bit number; every helper takes the current value and
 * returns the next one, so callers can fold arbitrary data in a fixed order:
 * `let h = FNV_OFFSET; h = fnv1aU32(h, tick); h = fnv1aBytes(h, cells);`.
 * Multi-byte values are folded little-endian. Output is identical on every platform.
 */

export const FNV_OFFSET = 0x811c9dc5;
export const FNV_PRIME = 0x01000193;

/** Folds one byte (the low 8 bits of `byte`). */
export function fnv1aByte(h: number, byte: number): number {
  return Math.imul(h ^ (byte & 0xff), FNV_PRIME) >>> 0;
}

export function fnv1aBytes(h: number, bytes: ArrayLike<number>): number {
  let x = h;
  for (let i = 0; i < bytes.length; i++) {
    x = Math.imul(x ^ ((bytes[i] as number) & 0xff), FNV_PRIME) >>> 0;
  }
  return x;
}

/** Folds a 32-bit integer (signed or unsigned; only the low 32 bits count), little-endian. */
export function fnv1aU32(h: number, value: number): number {
  let x = fnv1aByte(h, value);
  x = fnv1aByte(x, value >>> 8);
  x = fnv1aByte(x, value >>> 16);
  return fnv1aByte(x, value >>> 24);
}

/** Folds a string as its length followed by UTF-16 code units (2 bytes each). */
export function fnv1aString(h: number, s: string): number {
  let x = fnv1aU32(h, s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    x = fnv1aByte(x, c);
    x = fnv1aByte(x, c >>> 8);
  }
  return x;
}

/** One-shot FNV-1a of a byte array. */
export function hashBytes(bytes: ArrayLike<number>): number {
  return fnv1aBytes(FNV_OFFSET, bytes);
}

/** 8-digit lowercase hex, for readable golden values and debug output. */
export function hashHex(h: number): string {
  return (h >>> 0).toString(16).padStart(8, '0');
}
