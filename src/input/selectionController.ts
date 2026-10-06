/**
 * The life of one press on the play field (§1.7 points 2–3): the creature under the finger is
 * highlighted while pressing and follows the finger; after `LOUPE_DELAY_MS` a magnifier opens
 * above the finger; dragging the finger out of the loupe cancels; releasing assigns to the
 * highlighted creature. Pure: the picker (screen point → creature id) and the clock come in.
 */

export const LOUPE_DELAY_MS = 250;
export const LOUPE_ZOOM = 2.5;
/** Loupe radius on screen (pt); it is drawn this far above the finger plus a gap. */
export const LOUPE_RADIUS = 56;
/** Moving the finger this far from where the loupe opened cancels the press. */
export const LOUPE_CANCEL_DISTANCE = LOUPE_RADIUS;

export type Picker = (x: number, y: number) => number | null;

export interface PressView {
  /** Highlighted creature (null: nobody, or cancelled). */
  target: number | null;
  /** Finger position (screen) while pressing. */
  finger: { x: number; y: number } | null;
  /** Loupe centre point to magnify (screen), when open. */
  loupe: { x: number; y: number } | null;
  cancelled: boolean;
}

export class SelectionController {
  private pressing = false;
  private startT = 0;
  private fx = 0;
  private fy = 0;
  private loupeAt: { x: number; y: number } | null = null;
  private cancelled = false;
  private target: number | null = null;

  constructor(private readonly pick: Picker) {}

  get view(): PressView {
    return {
      target: this.pressing && !this.cancelled ? this.target : null,
      finger: this.pressing ? { x: this.fx, y: this.fy } : null,
      loupe: this.pressing && !this.cancelled && this.loupeAt ? { x: this.fx, y: this.fy } : null,
      cancelled: this.cancelled,
    };
  }

  start(x: number, y: number, t: number): void {
    this.pressing = true;
    this.cancelled = false;
    this.loupeAt = null;
    this.startT = t;
    this.moveTo(x, y);
  }

  move(x: number, y: number, t: number): void {
    if (!this.pressing) return;
    this.update(t);
    this.moveTo(x, y);
    if (
      this.loupeAt &&
      Math.hypot(x - this.loupeAt.x, y - this.loupeAt.y) > LOUPE_CANCEL_DISTANCE
    ) {
      this.cancelled = true;
    }
  }

  /** Opens the loupe once the finger has been down long enough. Call every frame. */
  update(t: number): void {
    if (this.pressing && !this.loupeAt && !this.cancelled && t - this.startT >= LOUPE_DELAY_MS) {
      this.loupeAt = { x: this.fx, y: this.fy };
    }
  }

  /** Finger released: the creature to assign to (null when nobody / cancelled). */
  end(x: number, y: number, t: number): number | null {
    if (!this.pressing) return null;
    this.move(x, y, t);
    const result = this.cancelled ? null : this.target;
    this.reset();
    return result;
  }

  cancel(): void {
    this.reset();
  }

  /** Re-evaluates the highlighted creature (the crowd moves while the finger rests). */
  refresh(): void {
    if (this.pressing) this.target = this.pick(this.fx, this.fy);
  }

  private moveTo(x: number, y: number): void {
    this.fx = x;
    this.fy = y;
    this.target = this.pick(x, y);
  }

  private reset(): void {
    this.pressing = false;
    this.loupeAt = null;
    this.cancelled = false;
    this.target = null;
  }
}
