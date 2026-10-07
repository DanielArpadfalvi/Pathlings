import { describe, expect, it } from 'vitest';
import { FeedbackDirector } from '../../../src/audio/feedback';
import { MUSIC_STYLES, degree, midiToHz, notesAt, tempoFactor } from '../../../src/audio/music';
import {
  type AudioSink,
  type SfxId,
  SfxMapper,
  type SoundCue,
  THROTTLE_TICKS,
  plankPitch,
} from '../../../src/audio/sfx';
import { DEFAULT_AUDIO, effectiveGain, sanitizeAudio } from '../../../src/audio/volume';
import { createSim } from '../../../src/core/sim';
import type { SimEvent } from '../../../src/core/world';
import { GameSession } from '../../../src/game/session';
import { cliff, crowd, tunnel } from '../../../src/levels/test';
import {
  type HapticKind,
  VIBRATION_PATTERNS,
  createWebHaptics,
} from '../../../src/platform/haptics';

class FakeSink implements AudioSink {
  cues: SoundCue[] = [];
  play(cue: SoundCue): void {
    this.cues.push(cue);
  }
  ids(): SfxId[] {
    return this.cues.map((c) => c.id);
  }
}

/** A sim with no walkers (so footsteps stay quiet) for single-event checks. */
const quietSim = createSim(crowd);

function cuesFor(ev: SimEvent): SfxId[] {
  const sink = new FakeSink();
  new SfxMapper(sink).onEvents(quietSim, [ev]);
  return sink.ids();
}

describe('SfxMapper: every sound comes from an event', () => {
  it('maps events to cues', () => {
    expect(cuesFor({ type: 'skillAssigned', tick: 1, id: 0, skill: 'warden' })).toEqual(['assign']);
    expect(cuesFor({ type: 'saved', tick: 1, id: 0 })).toEqual(['save']);
    expect(cuesFor({ type: 'plank', tick: 1, id: 0, planksLeft: 8 })).toEqual(['plank']);
    expect(cuesFor({ type: 'plank', tick: 1, id: 0, planksLeft: 2 })).toEqual(['plankLow']);
    expect(cuesFor({ type: 'teleported', tick: 1, id: 0, object: 0 })).toEqual(['teleport']);
    expect(cuesFor({ type: 'bounced', tick: 1, id: 0, object: 0 })).toEqual(['bounce']);
    const died = (cause: 'popped' | 'water' | 'lava' | 'trap' | 'fall'): SimEvent => ({
      type: 'died',
      tick: 1,
      id: 0,
      cause,
      x: 0,
      y: 0,
    });
    expect(cuesFor(died('popped'))).toEqual(['pop']);
    expect(cuesFor(died('water'))).toEqual(['splash']);
    expect(cuesFor(died('lava'))).toEqual(['sizzle']);
    expect(cuesFor(died('trap'))).toEqual(['trap']);
    expect(cuesFor(died('fall'))).toEqual(['thud']);
    expect(cuesFor({ type: 'terrainChanged', tick: 1, rect: { x: 0, y: 0, w: 1, h: 1 } })).toEqual([
      'dig',
    ]);
    const end = (won: boolean): SimEvent => ({
      type: 'levelEnded',
      tick: 1,
      saved: 1,
      required: 1,
      won,
      reason: 'done',
    });
    expect(cuesFor(end(true))).toEqual(['win']);
    expect(cuesFor(end(false))).toEqual(['lose']);
  });

  it('a crater does not also play the dig sound', () => {
    const sink = new FakeSink();
    new SfxMapper(sink).onEvents(quietSim, [
      { type: 'died', tick: 1, id: 0, cause: 'popped', x: 0, y: 0 },
      { type: 'terrainChanged', tick: 1, rect: { x: 0, y: 0, w: 1, h: 1 } },
    ]);
    expect(sink.ids()).toEqual(['pop']);
  });

  it('planks rise in pitch', () => {
    const pitches = [12, 9, 6, 3, 1].map(plankPitch);
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]!).toBeGreaterThan(pitches[i - 1]!);
  });

  it('throttles busy sounds and resets the throttle on rewind', () => {
    const sink = new FakeSink();
    const m = new SfxMapper(sink);
    const dig = (tick: number): SimEvent => ({
      type: 'terrainChanged',
      tick,
      rect: { x: 0, y: 0, w: 1, h: 1 },
    });
    const sim = createSim(crowd);
    for (let t = 0; t < 30; t++) {
      sim.tick = t;
      m.onEvents(sim, [dig(t)]);
    }
    expect(sink.ids().filter((i) => i === 'dig')).toHaveLength(Math.ceil(30 / THROTTLE_TICKS.dig!));
    sink.cues = [];
    m.onEvents(sim, [{ type: 'rewound', tick: 5 }]);
    sim.tick = 5;
    m.onEvents(sim, [dig(5)]);
    expect(sink.ids()).toEqual(['dig']);
  });

  it('a refused tap plays the "no" sound', () => {
    const sink = new FakeSink();
    new SfxMapper(sink).rejected(10);
    expect(sink.ids()).toEqual(['no']);
  });

  it('a real run: tunnel solution → assign, dig, footsteps, saves and the win jingle', () => {
    const sink = new FakeSink();
    const m = new SfxMapper(sink);
    const s = new GameSession(tunnel, { autoplay: tunnel.solution });
    s.onStep((sim, evs) => m.onEvents(sim, evs));
    s.seek(Infinity);
    const ids = new Set(sink.ids());
    for (const id of ['assign', 'dig', 'step', 'save', 'win'] as const)
      expect(ids.has(id), id).toBe(true);
    expect(sink.ids().filter((i) => i === 'save').length).toBeGreaterThan(1);
  });

  it('a real run: cliff solution (pop all) → pops', () => {
    const sink = new FakeSink();
    const m = new SfxMapper(sink);
    const s = new GameSession(cliff, { autoplay: cliff.solution });
    s.onStep((sim, evs) => m.onEvents(sim, evs));
    s.seek(Infinity);
    expect(sink.ids()).toContain('pop');
  });
});

describe('FeedbackDirector haptics', () => {
  function director() {
    const sink = new FakeSink();
    const buzz: HapticKind[] = [];
    const fb = new FeedbackDirector(sink, { trigger: (k) => buzz.push(k) });
    return { fb, buzz, sink };
  }

  it('one buzz per tick, strongest wins; refused taps double-buzz', () => {
    const { fb, buzz } = director();
    fb.onEvents(quietSim, [{ type: 'skillAssigned', tick: 1, id: 0, skill: 'warden' }]);
    fb.onEvents(quietSim, [
      { type: 'saved', tick: 2, id: 0 },
      { type: 'died', tick: 2, id: 1, cause: 'fall', x: 0, y: 0 },
    ]);
    fb.onEvents(quietSim, [{ type: 'saved', tick: 3, id: 0 }]);
    fb.rejected(4);
    expect(buzz).toEqual(['light', 'heavy', 'medium', 'warning']);
  });

  it('respects the haptics setting', () => {
    const { fb, buzz, sink } = director();
    fb.hapticsEnabled = false;
    fb.onEvents(quietSim, [{ type: 'skillAssigned', tick: 1, id: 0, skill: 'warden' }]);
    fb.rejected(2);
    expect(buzz).toEqual([]);
    expect(sink.ids()).toEqual(['assign', 'no']);
  });
});

describe('web haptics', () => {
  it('vibrates with the pattern of each kind and survives a missing API', () => {
    const calls: unknown[] = [];
    const fakeNav = {
      vibrate: (p: unknown) => {
        calls.push(p);
        return true;
      },
    } as unknown as Navigator;
    const h = createWebHaptics(fakeNav);
    h.trigger('warning');
    h.trigger('light');
    expect(calls).toEqual([VIBRATION_PATTERNS.warning, VIBRATION_PATTERNS.light]);
    const blocked: unknown[] = [];
    const idle = {
      userActivation: { hasBeenActive: false },
      vibrate: (p: unknown) => blocked.push(p),
    } as unknown as Navigator;
    createWebHaptics(idle).trigger('heavy');
    expect(blocked).toEqual([]);
    expect(() => createWebHaptics(undefined).trigger('heavy')).not.toThrow();
    expect(() => createWebHaptics({}).trigger('heavy')).not.toThrow();
  });
});

describe('volume settings', () => {
  it('multiplies master × channel × sound gain', () => {
    const s = { master: 0.5, sfx: 0.8, music: 0.25 };
    expect(effectiveGain(s, 'sfx', 1)).toBeCloseTo(0.4);
    expect(effectiveGain(s, 'music', 0.5)).toBeCloseTo(0.0625);
  });

  it('muting master or a channel silences it', () => {
    expect(effectiveGain({ ...DEFAULT_AUDIO, master: 0 }, 'sfx', 1)).toBe(0);
    expect(effectiveGain({ ...DEFAULT_AUDIO, music: 0 }, 'music', 1)).toBe(0);
    expect(effectiveGain({ ...DEFAULT_AUDIO, music: 0 }, 'sfx', 1)).toBeGreaterThan(0);
  });

  it('sanitizes stored values', () => {
    expect(sanitizeAudio({ master: 2, sfx: -1, music: Number.NaN })).toEqual({
      master: 1,
      sfx: 0,
      music: 0,
    });
    expect(sanitizeAudio({})).toEqual(DEFAULT_AUDIO);
  });
});

describe('generative music', () => {
  it('is deterministic per world and stays in a sane range', () => {
    for (const style of Object.values(MUSIC_STYLES)) {
      for (let step = 0; step < 64; step++) {
        const a = notesAt(style, step);
        expect(notesAt(style, step)).toEqual(a);
        for (const n of a) {
          expect(n.midi).toBeGreaterThanOrEqual(24);
          expect(n.midi).toBeLessThanOrEqual(96);
          expect(n.gain).toBeGreaterThan(0);
        }
      }
    }
  });

  it('has a bass note on every beat and a chord at each bar start', () => {
    const style = MUSIC_STYLES.glade;
    for (let step = 0; step < 32; step += 2) {
      expect(notesAt(style, step).some((n) => n.voice === 'bass')).toBe(true);
    }
    expect(notesAt(style, 8).filter((n) => n.voice === 'pad')).toHaveLength(3);
  });

  it('worlds sound different', () => {
    const tune = (t: keyof typeof MUSIC_STYLES) =>
      Array.from({ length: 32 }, (_, i) => notesAt(MUSIC_STYLES[t], i).map((n) => n.midi)).join();
    expect(tune('glade')).not.toBe(tune('deep'));
  });

  it('tempo follows speed within limits; pitch helpers', () => {
    expect(tempoFactor(1)).toBe(1);
    expect(tempoFactor(2)).toBe(2);
    expect(tempoFactor(4)).toBe(2);
    expect(tempoFactor(0.5)).toBe(0.75);
    expect(midiToHz(69)).toBe(440);
    expect(degree(MUSIC_STYLES.glade, 5)).toBe(72);
  });
});
