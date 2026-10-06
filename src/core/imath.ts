/** Exact integer helpers (no float rounding involved for integer inputs). */

/** Floor of a / b for integers, b ≠ 0 (rounds toward −∞, unlike `Math.trunc`). */
export function floorDiv(a: number, b: number): number {
  const r = ((a % b) + b) % b;
  return (a - r) / b;
}

/** Ceiling of a / b for integers, b ≠ 0. */
export function ceilDiv(a: number, b: number): number {
  return 0 - floorDiv(-a, b);
}

export function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
