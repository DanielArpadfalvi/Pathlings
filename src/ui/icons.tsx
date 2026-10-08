import type { SkillId } from '../core/level';

/**
 * Code-drawn pixel icons (12 × 12 grid, crisp edges) – no bitmap assets. Every skill has its own
 * shape *and* colour, so the icon never relies on colour alone (§1.10).
 */

const SKILL_PATHS: Record<SkillId, string> = {
  // Climbing: an up arrow beside a wall.
  scaler: 'M9 0h3v12H9zM4 1l3 3H5v7H3V4H1z',
  // Leaf umbrella on a stem.
  glider: 'M3 1h6v1h2v1h1v1H0V3h1V2h2zM5 4h2v6H5zM3 9h2v2H3z',
  // Round fuse bomb with a spark.
  popper: 'M3 4h6v1h1v5H9v1H3v-1H2V5h1zM7 2h2v2H7zM9 0h2v2H9z',
  // Arms out: "stop".
  warden: 'M5 0h2v2H5zM0 3h12v2H0zM4 5h4v3H4zM4 8h1v4H4zM7 8h1v4H7z',
  // Rising staircase.
  mason: 'M0 10h4v2H0zM3 7h4v2H3zM6 4h4v2H6zM9 1h3v2H9z',
  // Horizontal arrow into a block.
  burrower: 'M8 0h4v12H8zM0 5h4V3l3 3-3 3V7H0z',
  // Diagonal arrow down-forward.
  sloper: 'M0 0h3l6 6V3h2v8H3V9h4L0 2z',
  // Down arrow into the ground.
  delver: 'M5 0h2v4h3l-4 4-4-4h3zM0 10h12v2H0z',
};

export const SKILL_COLORS: Record<SkillId, string> = {
  scaler: '#ffc94a',
  glider: '#8ff06a',
  popper: '#ff7a5c',
  warden: '#f4f1e8',
  mason: '#e0b072',
  burrower: '#6ac8ff',
  sloper: '#c89bff',
  delver: '#d9a06a',
};

function PixelIcon({ d, size = 24, color }: { d: string; size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shape-rendering="crispEdges"
      aria-hidden="true"
      style={color ? { color } : undefined}
    >
      <path fill="currentColor" d={d} />
    </svg>
  );
}

export function SkillIcon({ skill, size }: { skill: SkillId; size?: number }) {
  return <PixelIcon d={SKILL_PATHS[skill]} size={size} color={SKILL_COLORS[skill]} />;
}

export const PauseIcon = () => <PixelIcon d="M2 1h3v10H2zM7 1h3v10H7z" />;
export const PlayIcon = () => <PixelIcon d="M2 1h2v1h2v1h2v1h2v1h1v2h-1v1H8v1H6v1H4v1H2z" />;
export const MinusIcon = () => <PixelIcon d="M1 5h10v2H1z" size={18} />;
export const PlusIcon = () => <PixelIcon d="M5 1h2v4h4v2H7v4H5V7H1V5h4z" size={18} />;
export const RewindIcon = () => <PixelIcon d="M12 2L7 6l5 4zM6 2L1 6l5 4z" size={18} />;
export const FastIcon = () => <PixelIcon d="M0 2l5 4-5 4zM6 2l5 4-5 4z" size={18} />;
export const PopAllIcon = () => (
  <PixelIcon d="M5 0h2v3H5zM5 9h2v3H5zM0 5h3v2H0zM9 5h3v2H9zM1 1h2v2H1zM9 1h2v2H9zM1 9h2v2H1zM9 9h2v2H9zM4 4h4v4H4z" />
);
export const RetryIcon = () => (
  <PixelIcon
    d="M3 1h6v2H4v1H3v4h1v1h4V8h1V6h2v3h-1v1H9v1H3v-1H2V9H1V3h1V2h1zM8 0h3v4H8z"
    size={18}
  />
);
export const NextIcon = () => <PixelIcon d="M1 5h6V2l4 4-4 4V7H1z" size={18} />;

/** Five-point star in pixels: filled or hollow. */
export function StarIcon({ filled, size = 36 }: { filled: boolean; size?: number }) {
  const outline = 'M5 0h2v3h5v2h-2v1h-1v2h1v4h-2v-1H5v1H3V8h1V6H3V5H1V3h4z';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shape-rendering="crispEdges"
      aria-hidden="true"
      class={filled ? 'star star-on' : 'star'}
    >
      <path fill="currentColor" d={outline} />
    </svg>
  );
}
