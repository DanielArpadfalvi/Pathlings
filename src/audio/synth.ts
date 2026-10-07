import type { ThemeId } from '../core/level';
import { MUSIC_STYLES, type MusicStyle, midiToHz, notesAt, tempoFactor } from './music';
import type { AudioSink, SfxId, SoundCue } from './sfx';
import { type AudioSettings, DEFAULT_AUDIO, effectiveGain } from './volume';

/**
 * Web Audio engine: synthesizes every sound effect from oscillators and noise (no audio files,
 * see CLAUDE.md) and schedules the generative music. The AudioContext is created on the first
 * user gesture (`unlock`), as browsers require; before that, sounds are silently dropped.
 */

/** Music scheduling: how far ahead notes are queued and how often the queue is topped up. */
const LOOKAHEAD_S = 0.2;
const SCHEDULE_MS = 50;

export class WebAudioEngine implements AudioSink {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private settings: AudioSettings = DEFAULT_AUDIO;
  private style: MusicStyle | null = null;
  private tempo = 1;
  private musicOn = false;
  private ducked = false;
  private step = 0;
  private nextStepTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Call from a user gesture (pointerdown / keydown). Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = globalThis.AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(ctx.destination);
    this.musicBus.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      data[i] = (seed / 0x80000000 - 1) * 0.8;
    }
    this.applyVolumes();
    if (this.musicOn) this.startScheduler();
  }

  /** App in the background: silence everything until `resume`. */
  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(s: AudioSettings): void {
    this.settings = s;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(effectiveGain(this.settings, 'sfx', 1), t, 0.02);
    const music = effectiveGain(this.settings, 'music', this.ducked ? 0.35 : 1);
    this.musicBus.gain.setTargetAtTime(music, t, 0.15);
  }

  // --- Music --------------------------------------------------------------------------------

  /** Starts (or switches to) the music of a world. */
  playMusic(theme: ThemeId): void {
    const style = MUSIC_STYLES[theme];
    if (this.style !== style) {
      this.style = style;
      this.step = 0;
    }
    this.musicOn = true;
    this.startScheduler();
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Tempo follows the game speed. */
  setSpeed(speed: number): void {
    this.tempo = tempoFactor(speed);
  }

  /** Quieter music while paused or on an end screen. */
  setDucked(ducked: boolean): void {
    if (ducked === this.ducked) return;
    this.ducked = ducked;
    this.applyVolumes();
  }

  private startScheduler(): void {
    if (!this.ctx || this.timer) return;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), SCHEDULE_MS);
  }

  private schedule(): void {
    const ctx = this.ctx;
    const style = this.style;
    if (!ctx || !style || !this.musicBus) return;
    const eighth = 60 / (style.bpm * this.tempo) / 2;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD_S) {
      for (const n of notesAt(style, this.step)) {
        const wave: OscillatorType =
          n.voice === 'lead' ? style.lead : n.voice === 'bass' ? 'triangle' : 'sine';
        this.tone(
          this.musicBus,
          wave,
          midiToHz(n.midi),
          this.nextStepTime,
          n.length * eighth,
          n.gain,
          n.voice === 'pad' ? 0.25 : 0.01,
        );
      }
      this.nextStepTime += eighth;
      this.step++;
    }
  }

  // --- Sound effects ------------------------------------------------------------------------

  play(cue: SoundCue): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    const p = cue.pitch;
    const g = cue.gain;
    const recipes: Record<SfxId, () => void> = {
      step: () => this.tone(bus, 'sine', 1400 * p, t, 0.03, 0.08 * g),
      dig: () => this.noiseBurst(bus, t, 0.07, 0.35 * g, 'bandpass', 700 * p),
      plank: () => this.tone(bus, 'square', 440 * p, t, 0.07, 0.12 * g),
      plankLow: () => {
        this.tone(bus, 'square', 440 * p, t, 0.05, 0.12 * g);
        this.tone(bus, 'square', 330 * p, t + 0.07, 0.06, 0.12 * g);
      },
      pop: () => {
        this.noiseBurst(bus, t, 0.3, 0.6 * g, 'lowpass', 900);
        this.sweep(bus, 'sine', 220, 50, t, 0.3, 0.5 * g);
      },
      save: () => {
        for (const [i, f] of [523.25, 659.25, 783.99].entries()) {
          this.tone(bus, 'triangle', f * p, t + i * 0.03, 0.35, 0.12 * g);
        }
      },
      assign: () => this.tone(bus, 'triangle', 880, t, 0.05, 0.18 * g),
      no: () => {
        this.tone(bus, 'square', 180, t, 0.07, 0.1 * g);
        this.tone(bus, 'square', 140, t + 0.09, 0.09, 0.1 * g);
      },
      splash: () => this.noiseBurst(bus, t, 0.2, 0.3 * g, 'highpass', 1200),
      sizzle: () => this.noiseBurst(bus, t, 0.35, 0.18 * g, 'highpass', 3000),
      thud: () => this.sweep(bus, 'sine', 140, 45, t, 0.12, 0.4 * g),
      trap: () => {
        this.tone(bus, 'square', 300, t, 0.05, 0.15 * g);
        this.noiseBurst(bus, t, 0.08, 0.25 * g, 'bandpass', 2500);
      },
      teleport: () => this.sweep(bus, 'sine', 400, 1300, t, 0.2, 0.15 * g),
      bounce: () => this.sweep(bus, 'sine', 280, 720, t, 0.12, 0.2 * g),
      win: () => {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone(bus, 'triangle', f, t + i * 0.12, 0.3, 0.16 * g),
        );
      },
      lose: () => {
        [392, 349.23, 293.66].forEach((f, i) =>
          this.tone(bus, 'triangle', f, t + i * 0.16, 0.35, 0.14 * g),
        );
      },
    };
    recipes[cue.id]();
  }

  private tone(
    bus: AudioNode,
    wave: OscillatorType,
    freq: number,
    start: number,
    dur: number,
    gain: number,
    attack = 0.005,
  ): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + Math.min(attack, dur / 2));
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(env).connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private sweep(
    bus: AudioNode,
    wave: OscillatorType,
    from: number,
    to: number,
    start: number,
    dur: number,
    gain: number,
  ): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(env).connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private noiseBurst(
    bus: AudioNode,
    start: number,
    dur: number,
    gain: number,
    filter: BiquadFilterType,
    freq: number,
  ): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(env).connect(bus);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  destroy(): void {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
  }
}
