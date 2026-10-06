import { describe, expect, it } from 'vitest';
import { CreatureState } from '../../../src/core/creature';
import { createSim, stepN } from '../../../src/core/sim';
import {
  type Candidate,
  DISTANCE_BUCKET,
  SELECT_RADIUS,
  candidatesFromSim,
  distanceToBody,
  pickCandidate,
} from '../../../src/input/selection';
import { crowd } from '../../../src/levels/test';

/** A creature standing with its foot point at (x, 100): body x−2…x+2, y 91…99. */
function cand(id: number, x: number, over: Partial<Candidate> = {}): Candidate {
  return {
    id,
    x: x - 2,
    y: 91,
    w: 5,
    h: 9,
    cx: x + 0.5,
    dir: 1,
    eligible: true,
    skillsUsed: 0,
    ...over,
  };
}

/** Scale 2 (CSS px per world px) unless stated: 1 world px = 2 pt. */
const at = (x: number, y = 95, scale = 2) => ({ x, y, scale });

describe('distanceToBody', () => {
  it('is 0 inside the body and measured on screen outside', () => {
    const c = cand(0, 50);
    expect(distanceToBody(c, 50, 95, 2)).toBe(0);
    expect(distanceToBody(c, 58, 95, 2)).toBe((58 - 53) * 2);
    expect(distanceToBody(c, 50, 80, 3)).toBe((91 - 80) * 3);
  });
});

describe('pickCandidate – crowd cases', () => {
  it('1: nobody within the 28-pt radius ⇒ null', () => {
    // Body spans x 48…53 (5 cells); 15 world px right of it = 30 pt at 2×.
    expect(pickCandidate([cand(0, 50)], at(53 + SELECT_RADIUS / 2 + 1))).toBeNull();
    expect(pickCandidate([cand(0, 50)], at(53 + SELECT_RADIUS / 2))).toBe(0);
    expect(pickCandidate([], at(0))).toBeNull();
  });

  it('2: a tap on a body picks it even when others are within the radius', () => {
    const cs = [cand(0, 40), cand(1, 50), cand(2, 60)];
    expect(pickCandidate(cs, at(50))).toBe(1);
  });

  it('3: eligible beats closer-but-ineligible', () => {
    const cs = [cand(0, 50, { eligible: false }), cand(1, 58)];
    expect(pickCandidate(cs, at(50))).toBe(1);
  });

  it('4: with nobody eligible the nearest is still picked (for "no" feedback)', () => {
    const cs = [cand(0, 50, { eligible: false }), cand(1, 60, { eligible: false })];
    expect(pickCandidate(cs, at(51))).toBe(0);
  });

  it('5: clearly nearer wins over "has no skill yet"', () => {
    const cs = [cand(0, 50, { skillsUsed: 1 }), cand(1, 62)];
    expect(pickCandidate(cs, at(50))).toBe(0);
  });

  it('6: at the same distance, the one without a skill wins', () => {
    // Overlapping bodies, tap between them: both at distance 0.
    const cs = [cand(0, 49, { skillsUsed: 2 }), cand(1, 51)];
    expect(pickCandidate(cs, at(50))).toBe(1);
  });

  it('7: at the same distance and history, the one walking towards the tap wins', () => {
    const cs = [cand(0, 49, { dir: -1 }), cand(1, 51, { dir: -1 })];
    // Tap left of both centres: both walk left ⇒ both "towards"; id decides.
    expect(pickCandidate(cs, at(48))).toBe(0);
    // Tap between: 0 (centre 49.5) walks left, away from 50; 1 (centre 51.5) walks left, towards it.
    expect(pickCandidate(cs, at(50.5))).toBe(1);
  });

  it('8: full tie ⇒ smaller id (stable)', () => {
    const cs = [cand(5, 50), cand(3, 50), cand(4, 50)];
    expect(pickCandidate(cs, at(50))).toBe(3);
  });

  it('9: distances within one bucket count as equal', () => {
    // 0 is 1 pt nearer than 1, but 0 already has a skill.
    const cs = [cand(0, 50, { skillsUsed: 1 }), cand(1, 50)];
    cs[1]!.x += 0.5; // half a world px = 1 pt further
    expect(DISTANCE_BUCKET).toBeGreaterThan(1);
    expect(pickCandidate(cs, at(44))).toBe(1);
  });

  it('10: the direction filter removes creatures walking the other way', () => {
    const cs = [cand(0, 50, { dir: 1 }), cand(1, 56, { dir: -1 })];
    expect(pickCandidate(cs, { ...at(50), filter: 'left' })).toBe(1);
    expect(pickCandidate(cs, { ...at(56), filter: 'right' })).toBe(0);
    expect(pickCandidate([cand(0, 50)], { ...at(50), filter: 'left' })).toBeNull();
  });

  it('11: the radius is in screen points, so zooming in shrinks it in world px', () => {
    const cs = [cand(0, 50)];
    // 10 world px beside the body: 20 pt at 2×, 40 pt at 4×.
    expect(pickCandidate(cs, at(62, 95, 2))).toBe(0);
    expect(pickCandidate(cs, at(62, 95, 4))).toBeNull();
  });
});

describe('candidatesFromSim', () => {
  it('lists active creatures with eligibility from canAssign', () => {
    const sim = createSim(crowd);
    stepN(sim, 300);
    const cs = candidatesFromSim(sim, 'warden');
    expect(cs).toHaveLength(10);
    expect(cs.every((c) => c.eligible)).toBe(true);
    expect(candidatesFromSim(sim, null).every((c) => !c.eligible)).toBe(true);
    // Ineligible: a falling creature cannot become a Warden.
    sim.creatures[0]!.state = CreatureState.Fall;
    expect(candidatesFromSim(sim, 'warden').find((c) => c.id === 0)!.eligible).toBe(false);
    // Saved / dead creatures are no candidates.
    sim.creatures[1]!.state = CreatureState.Dead;
    expect(candidatesFromSim(sim, 'warden').some((c) => c.id === 1)).toBe(false);
  });
});
