import type { ThemeId } from '../core/level';

/**
 * Generative background music per world (§1.11): a bass line on the beats, a wandering melody on
 * eighths and a soft pad chord per bar, all from the world's scale. Pure pattern generation (a
 * seeded walk, so a world always sounds like itself); `synth.ts` schedules the notes. Tempo
 * follows the game speed (capped so 4× stays musical).
 */

export interface MusicStyle {
  /** Root note as a MIDI number. */
  root: number;
  /** Scale degrees in semitones above the root. */
  scale: readonly number[];
  bpm: number;
  /** Chord roots per bar (scale indices), cycled. */
  progression: readonly number[];
  /** Melody wave: 'triangle' sounds soft, 'square' chiptune-ish. */
  lead: OscillatorType;
  /** Chance (0…1) that an eighth carries a melody note. */
  density: number;
}

export const MUSIC_STYLES: Readonly<Record<ThemeId, MusicStyle>> = {
  glade: {
    root: 60,
    scale: [0, 2, 4, 7, 9],
    bpm: 96,
    progression: [0, 3, 4, 2],
    lead: 'triangle',
    density: 0.55,
  },
  deep: {
    root: 57,
    scale: [0, 3, 5, 7, 10],
    bpm: 84,
    progression: [0, 2, 3, 1],
    lead: 'sine',
    density: 0.4,
  },
  clockworks: {
    root: 62,
    scale: [0, 2, 3, 5, 7, 9, 10],
    bpm: 108,
    progression: [0, 3, 4, 3],
    lead: 'square',
    density: 0.6,
  },
  skyreach: {
    root: 65,
    scale: [0, 2, 4, 6, 7, 9, 11],
    bpm: 92,
    progression: [0, 4, 1, 5],
    lead: 'triangle',
    density: 0.5,
  },
};

/** Tempo multiplier for a game speed: proportional, but never slower than 0.75× or above 2×. */
export function tempoFactor(speed: number): number {
  return Math.max(0.75, Math.min(2, speed));
}

export interface Note {
  /** MIDI note number. */
  midi: number;
  /** Which instrument plays it. */
  voice: 'bass' | 'lead' | 'pad';
  /** Length in eighths. */
  length: number;
  gain: number;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Scale index (may exceed the scale length: wraps into higher octaves) → MIDI. */
export function degree(style: MusicStyle, index: number): number {
  const n = style.scale.length;
  const octave = Math.floor(index / n);
  const i = ((index % n) + n) % n;
  return style.root + octave * 12 + (style.scale[i] as number);
}

/**
 * The notes of eighth-note step `step` (8 per bar). Deterministic for a given style and step,
 * so the same world always plays the same tune.
 */
export function notesAt(style: MusicStyle, step: number): Note[] {
  const notes: Note[] = [];
  const bar = Math.floor(step / 8);
  const inBar = step % 8;
  const chord = style.progression[bar % style.progression.length] as number;
  if (inBar === 0) {
    for (const k of [0, 2, 4]) {
      notes.push({ midi: degree(style, chord + k) - 12, voice: 'pad', length: 8, gain: 0.12 });
    }
  }
  if (inBar % 2 === 0) {
    const fifth = inBar === 4 ? 2 : 0;
    notes.push({ midi: degree(style, chord + fifth) - 24, voice: 'bass', length: 2, gain: 0.32 });
  }
  const h = hash(step * 2654435761 + style.root * 97);
  if ((h & 0xff) / 256 < style.density) {
    // A melody that wanders around the chord within about an octave and a half.
    const offset = ((h >>> 8) % 7) - 2;
    notes.push({
      midi: degree(style, chord + offset + style.scale.length),
      voice: 'lead',
      length: (h >>> 16) % 3 === 0 ? 2 : 1,
      gain: 0.16,
    });
  }
  return notes;
}

function hash(n: number): number {
  let x = n >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}
