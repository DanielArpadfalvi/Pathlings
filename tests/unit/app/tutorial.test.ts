import { describe, expect, it } from 'vitest';
import type { PlayScreen } from '../../../src/app/playScreen';
import { TutorialDirector } from '../../../src/app/tutorial';
import type { SkillId } from '../../../src/core/level';
import { GameSession } from '../../../src/game/session';
import { DICTIONARIES } from '../../../src/i18n';
import { BUILTIN_LEVELS } from '../../../src/levels/catalog';
import { TUTORIAL } from '../../../src/levels/tutorial';

/** The parts of a PlayScreen the tutorial uses. */
function fakeScreen(levelIndex = 0) {
  const level = BUILTIN_LEVELS.w1[levelIndex]!;
  const session = new GameSession(level);
  return {
    session,
    skill: null as SkillId | null,
    camera: { toScreen: (p: { x: number; y: number }) => ({ x: p.x * 2, y: p.y * 2 }) },
  };
}

describe('tutorial data', () => {
  it('levels 1–8 of World 1 have a tutorial, every text exists in every language', () => {
    for (let i = 1; i <= 8; i++) expect(TUTORIAL[`w1-0${i}`], `w1-0${i}`).toBeDefined();
    for (const steps of Object.values(TUTORIAL)) {
      for (const s of steps) {
        for (const dict of Object.values(DICTIONARIES)) {
          expect((dict as Record<string, string>)[s.text], s.text).toBeTruthy();
        }
      }
    }
  });

  it('every taught skill is available on its level', () => {
    for (const [id, steps] of Object.entries(TUTORIAL)) {
      const level = BUILTIN_LEVELS.w1.find((l) => l.id === id)!;
      for (const s of steps) {
        if (s.done.kind === 'skillSelected' || s.done.kind === 'assigned') {
          expect(level.skills[s.done.skill], `${id}: ${s.done.skill}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('TutorialDirector (level 1)', () => {
  it('walks through welcome → pick the Delver → tap the Pathling → follow-up', () => {
    const screen = fakeScreen(0);
    const d = new TutorialDirector(TUTORIAL['w1-01']!, screen as unknown as PlayScreen);
    let now = 0;
    d.update(now);
    expect(d.view?.text).toBe('tutorial.welcome');
    expect(d.view?.showOk).toBe(true);
    expect(screen.session.paused).toBe(true);
    d.ok();
    d.update((now += 16));
    expect(screen.session.paused).toBe(false);
    expect(d.view).toBeNull();

    // Run until the first Pathling reaches x ≥ 120: the game pauses and points at the button.
    for (let i = 0; i < 2000 && !screen.session.paused; i++) {
      screen.session.stepOnce();
      d.update((now += 16));
    }
    expect(d.view?.text).toBe('tutorial.pick.delver');
    expect(d.view?.target).toEqual({ ui: 'skill-delver' });
    expect(screen.session.sim.creatures[0]!.x).toBeGreaterThanOrEqual(120);

    screen.skill = 'delver';
    d.update((now += 16));
    expect(d.view?.text).toBe('tutorial.tapCreature');
    expect(screen.session.paused).toBe(true); // still paused for the tap
    const c = screen.session.sim.creatures[0]!;
    expect(d.view?.target).toEqual({ x: Math.round((c.x + 0.5) * 2), y: (c.y - 5) * 2 });

    expect(screen.session.assign(0, 'delver')).toBe(true);
    d.update((now += 16));
    expect(screen.session.paused).toBe(false);
    expect(d.view?.text).toBe('tutorial.follow');
    d.update(now + 5000);
    expect(d.finished).toBe(true);
    expect(d.view).toBeNull();
  });

  it('stop() hands control back', () => {
    const screen = fakeScreen(0);
    const d = new TutorialDirector(TUTORIAL['w1-01']!, screen as unknown as PlayScreen);
    d.update(0);
    expect(screen.session.paused).toBe(true);
    d.stop();
    expect(screen.session.paused).toBe(false);
    expect(d.finished).toBe(true);
  });
});
