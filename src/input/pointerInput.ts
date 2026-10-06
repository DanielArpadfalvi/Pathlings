import type { Gesture, PointerPhase } from './gestures';
import { GestureRecognizer } from './gestures';

/** Wheel zoom step per 100 px of wheel delta (desktop / web). */
const WHEEL_ZOOM_PER_100 = 1.15;

export interface PointerInputHandlers {
  onGesture(g: Gesture): void;
  /** Mouse wheel / trackpad zoom around a point (web only). */
  onWheelZoom(x: number, y: number, factor: number): void;
}

/**
 * Feeds DOM pointer events of `el` into a `GestureRecognizer` (coordinates relative to `el`, in
 * CSS px). Returns a function that removes the listeners.
 */
export function attachPointerInput(el: HTMLElement, handlers: PointerInputHandlers): () => void {
  const rec = new GestureRecognizer();

  const feed = (e: PointerEvent, phase: PointerPhase): void => {
    const r = el.getBoundingClientRect();
    const gestures = rec.feed({
      id: e.pointerId,
      phase,
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      t: e.timeStamp,
    });
    for (const g of gestures) handlers.onGesture(g);
  };

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // Not an active pointer (e.g. synthesized events): input still works without capture.
    }
    feed(e, 'down');
  };
  const onMove = (e: PointerEvent): void => feed(e, 'move');
  const onUp = (e: PointerEvent): void => feed(e, 'up');
  const onCancel = (e: PointerEvent): void => feed(e, 'cancel');
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const factor = Math.pow(WHEEL_ZOOM_PER_100, -e.deltaY / 100);
    handlers.onWheelZoom(e.clientX - r.left, e.clientY - r.top, factor);
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('wheel', onWheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('wheel', onWheel);
  };
}
