/** Upper bound for the backing-store resolution (keeps fill-rate sane on 3×+ phones). */
const MAX_RESOLUTION = 3;

/** Canvas resolution for a device pixel ratio: DPR-aware, capped, invalid values → 1. */
export function stageResolution(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(MAX_RESOLUTION, devicePixelRatio);
}
