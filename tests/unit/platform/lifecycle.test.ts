// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createWebLifecycle } from '../../../src/platform/lifecycle';

describe('web lifecycle', () => {
  it('reports hide / show, Escape as back and hash links', () => {
    window.location.hash = '#PL1-AbCdEfGh';
    const life = createWebLifecycle(window);
    const seen: string[] = [];
    life.onPause(() => seen.push('pause'));
    life.onResume(() => seen.push('resume'));
    life.onBack(() => {
      seen.push('back');
      return true;
    });
    life.onOpenUrl((url) => seen.push(`url:${new URL(url).hash}`));
    const setVisibility = (v: string): void => {
      Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    setVisibility('hidden');
    setVisibility('visible');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(seen).toEqual(['url:#PL1-AbCdEfGh', 'pause', 'resume', 'back']);
    expect(() => life.exit()).not.toThrow();
  });
});
