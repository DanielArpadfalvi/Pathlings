import { describe, expect, it } from 'vitest';
import {
  CAMERA_ANIM_MS,
  Camera,
  DEFAULT_VIEW_WIDTH,
  DOUBLE_TAP_ZOOM,
  MAX_ZOOM,
} from '../../../src/render/camera';

/** A 390 × 844 phone looking at a 640 × 960 level unless stated otherwise. */
function cam(worldW = 640, worldH = 960, viewW = 390, viewH = 844): Camera {
  const c = new Camera(worldW, worldH);
  c.setViewport(viewW, viewH);
  return c;
}

function finish(c: Camera): void {
  c.update(CAMERA_ANIM_MS * 2);
}

describe('Camera scale rules', () => {
  it('defaults to ~200 world px across', () => {
    const c = cam();
    expect(c.defaultScale).toBeCloseTo(390 / DEFAULT_VIEW_WIDTH);
  });

  it('clamps pinch zoom to 1×…4× on a big level', () => {
    const c = cam();
    c.set({ cx: 320, cy: 480, scale: 10 });
    expect(c.scale).toBe(MAX_ZOOM);
    // 640 × 960 does not fit at 1× on a phone, so zooming out stops at the whole-level scale.
    c.set({ cx: 320, cy: 480, scale: 0.01 });
    expect(c.scale).toBeCloseTo(c.fitScale);
    expect(c.fitScale).toBeLessThan(1);
  });

  it('never zooms out below 1× when the level already fits at 1×', () => {
    const c = cam(160, 240);
    c.set({ cx: 80, cy: 120, scale: 0.2 });
    expect(c.scale).toBe(1);
  });

  it('allows the default view on tablets even above 4×', () => {
    const c = cam(640, 960, 1024, 1366);
    expect(c.defaultScale).toBeCloseTo(1024 / 200);
    expect(c.maxScale).toBeGreaterThanOrEqual(c.defaultScale);
  });
});

describe('Camera bounds', () => {
  it('keeps the view on the level', () => {
    const c = cam();
    c.set({ cx: -500, cy: -500, scale: 2 });
    expect(c.toWorld({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    c.set({ cx: 5000, cy: 5000, scale: 2 });
    const br = c.toWorld({ x: 390, y: 844 });
    expect(br.x).toBeCloseTo(640);
    expect(br.y).toBeCloseTo(960);
  });

  it('centres the level on an axis where the view is larger', () => {
    const c = cam(160, 240);
    c.set({ cx: 0, cy: 0, scale: 1 });
    expect(c.cx).toBe(80);
    expect(c.cy).toBe(120);
  });

  it('keeps the centre on resize', () => {
    const c = cam();
    c.set({ cx: 300, cy: 400, scale: 2 });
    c.setViewport(412, 915);
    expect(c.cx).toBe(300);
    expect(c.cy).toBe(400);
  });
});

describe('Camera moves', () => {
  it('toWorld and toScreen are inverse', () => {
    const c = cam();
    c.set({ cx: 300, cy: 400, scale: 2.5 });
    const p = { x: 123, y: 456 };
    const back = c.toScreen(c.toWorld(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('pans so the content follows the finger', () => {
    const c = cam();
    c.set({ cx: 300, cy: 400, scale: 2 });
    const before = c.toWorld({ x: 100, y: 100 });
    c.panBy(20, -10);
    const after = c.toWorld({ x: 120, y: 90 });
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('zooms around the pinch point', () => {
    const c = cam();
    c.set({ cx: 300, cy: 400, scale: 2 });
    const at = { x: 250, y: 300 };
    const w = c.toWorld(at);
    c.zoomAt(at, 1.5);
    expect(c.scale).toBeCloseTo(3);
    const w2 = c.toWorld(at);
    expect(w2.x).toBeCloseTo(w.x);
    expect(w2.y).toBeCloseTo(w.y);
    c.zoomAt(at, 0);
    expect(c.scale).toBeCloseTo(3);
  });

  it('double tap zooms in around the tap and back to the default', () => {
    const c = cam();
    c.set({ cx: 300, cy: 400, scale: c.defaultScale });
    const at = { x: 200, y: 500 };
    const w = c.toWorld(at);
    c.doubleTap(at);
    expect(c.animating).toBe(true);
    finish(c);
    expect(c.animating).toBe(false);
    expect(c.scale).toBeCloseTo(c.defaultScale * DOUBLE_TAP_ZOOM);
    expect(c.toWorld(at).x).toBeCloseTo(w.x);
    c.doubleTap(at);
    finish(c);
    expect(c.scale).toBeCloseTo(c.defaultScale);
  });

  it('animates smoothly and monotonically', () => {
    const c = cam();
    c.set({ cx: 300, cy: 400, scale: 2 });
    c.animateTo({ cx: 300, cy: 400, scale: 4 });
    let last = c.scale;
    for (let t = 0; t < CAMERA_ANIM_MS; t += 16) {
      c.update(16);
      expect(c.scale).toBeGreaterThanOrEqual(last);
      last = c.scale;
    }
    finish(c);
    expect(c.scale).toBe(4);
  });

  it('a pan cancels a running animation', () => {
    const c = cam();
    c.set({ cx: 300, cy: 400, scale: 2 });
    c.animateTo({ cx: 300, cy: 400, scale: 4 });
    c.update(16);
    c.panBy(5, 5);
    expect(c.animating).toBe(false);
  });

  it('whole-level button toggles between the full level and the default zoom', () => {
    const c = cam();
    c.set({ cx: 100, cy: 100, scale: c.defaultScale });
    c.toggleWholeLevel();
    finish(c);
    expect(c.showsWholeLevel).toBe(true);
    expect(c.toWorld({ x: 0, y: 0 }).y).toBeLessThanOrEqual(0);
    c.toggleWholeLevel();
    finish(c);
    expect(c.scale).toBeCloseTo(c.defaultScale);
    expect(c.showsWholeLevel).toBe(false);
  });
});

describe('Camera start framing', () => {
  const entrance = { x: 100, y: 800, w: 16, h: 10 };

  it('centres on entrance and exit when both fit', () => {
    const c = cam();
    c.frameStart(entrance, [{ x: 200, y: 850, w: 12, h: 12 }]);
    expect(c.scale).toBeCloseTo(c.defaultScale);
    const a = c.toScreen({ x: 100, y: 800 });
    const b = c.toScreen({ x: 212, y: 862 });
    for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(390);
    }
    expect(c.cx).toBeCloseTo(156);
  });

  it('centres on the entrance alone when the exit is too far', () => {
    const c = cam();
    c.frameStart({ x: 300, y: 100, w: 16, h: 10 }, [{ x: 300, y: 900, w: 12, h: 12 }]);
    expect(c.cx).toBeCloseTo(308);
    expect(c.cy).toBeCloseTo(c.clamped({ cx: 308, cy: 105, scale: c.scale }).cy);
  });

  it('picks the exit that fits', () => {
    const c = cam();
    c.frameStart({ x: 300, y: 500, w: 16, h: 10 }, [
      { x: 600, y: 100, w: 12, h: 12 },
      { x: 260, y: 520, w: 12, h: 12 },
    ]);
    expect(c.cx).toBeCloseTo((260 + 316) / 2);
  });

  it('without an entrance shows the level centre', () => {
    const c = cam();
    c.frameStart(undefined, []);
    expect(c.cx).toBe(320);
    expect(c.cy).toBe(480);
  });
});

describe('Camera UI insets', () => {
  it('frames the strip between the HUD and the controls', () => {
    const c = cam(160, 240);
    c.setInsets(40, 200);
    expect(c.screenCenter).toEqual({ x: 195, y: 40 + (844 - 240) / 2 });
    // The whole level fits the visible 604-px strip; it is centred in it, not in the screen.
    c.set({ cx: 0, cy: 0, scale: c.fitScale });
    const top = c.toScreen({ x: 80, y: 0 }).y;
    const bottom = c.toScreen({ x: 80, y: 240 }).y;
    expect(top).toBeGreaterThanOrEqual(40 - 1e-6);
    expect(bottom).toBeLessThanOrEqual(844 - 200 + 1e-6);
  });

  it('uses the visible height for the whole-level scale and the bounds', () => {
    const c = cam(160, 960); // a tall shaft: height-limited
    const full = c.fitScale;
    c.setInsets(40, 200);
    expect(c.fitScale).toBeLessThan(full);
    expect(c.fitScale).toBeCloseTo(604 / 960);
    c.set({ cx: 80, cy: 5000, scale: 2 });
    expect(c.toWorld({ x: 0, y: 844 - 200 }).y).toBeCloseTo(960);
  });

  it('keeps toWorld / toScreen inverse with insets', () => {
    const c = cam();
    c.setInsets(30, 150);
    c.set({ cx: 300, cy: 400, scale: 2.2 });
    const p = { x: 77, y: 333 };
    const back = c.toScreen(c.toWorld(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});
