import { describe, expect, it } from 'vitest';
import {
  ByteReader,
  ByteWriter,
  base64urlDecode,
  base64urlEncode,
  utf8Decode,
  utf8Encode,
} from '../../../src/core/code/bytes';
import { crc32 } from '../../../src/core/code/crc32';
import {
  CODE_PREFIX,
  LevelCodeError,
  MAX_CODE_BYTES,
  compressedSize,
  decodeLevel,
  deserializeLevel,
  encodeLevel,
  looksLikeCode,
  serializeLevel,
} from '../../../src/core/code/levelCode';
import {
  LEVEL_SIZE_PRESETS,
  type LevelDef,
  type LevelObject,
  SKILLS,
  THEMES,
  createLevel,
  emptySkillSet,
  validateLevel,
} from '../../../src/core/level';
import type { RasterOp } from '../../../src/core/raster';
import { createRng, randInt } from '../../../src/core/rng';
import { STAMPS } from '../../../src/core/stamps';
import { SIM_VERSION } from '../../../src/core/version';
import { FIXTURE_LEVELS, showcase, tunnel } from '../../../src/levels/test';

/** Seeded integer source for generated test data. */
function rngOf(seed: number): { nextInt(n: number): number } {
  const state = createRng(seed);
  return { nextInt: (n: number) => randInt(state, n) };
}

function expectCodeError(fn: () => unknown, kind?: LevelCodeError['kind']): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(LevelCodeError);
    if (kind) expect((e as LevelCodeError).kind).toBe(kind);
    return;
  }
  throw new Error('expected a LevelCodeError');
}

/** A level as it comes back from a code: no id, no i18n keys. */
function asShared(l: LevelDef): LevelDef {
  const shared: LevelDef = { ...l, id: '' };
  delete shared.titleKey;
  delete shared.hintKeys;
  return shared;
}

describe('bytes', () => {
  it('varints and zigzag round-trip', () => {
    const values = [0, 1, 127, 128, 255, 300, 16383, 16384, 2 ** 31, 2 ** 34];
    const signed = [0, -1, 1, -64, 64, -1024, 2047, -100000];
    const w = new ByteWriter();
    values.forEach((v) => w.uv(v));
    signed.forEach((v) => w.sv(v));
    w.u32(0xdeadbeef);
    w.str('Árvíztűrő 🐸');
    const r = new ByteReader(w.finish());
    expect(values.map(() => r.uv())).toEqual(values);
    expect(signed.map(() => r.sv())).toEqual(signed);
    expect(r.u32()).toBe(0xdeadbeef);
    expect(r.str(100)).toBe('Árvíztűrő 🐸');
    expect(r.remaining).toBe(0);
    expect(() => r.u8()).toThrow();
  });

  it('rejects non-canonical varints and over-long strings', () => {
    expect(() => new ByteReader(Uint8Array.from([0x80, 0x00])).uv()).toThrow();
    const w = new ByteWriter();
    w.str('hello');
    expect(() => new ByteReader(w.finish()).str(3)).toThrow();
  });

  it('UTF-8 matches the platform encoder', () => {
    const s = 'Pathlings – Kőműves ✓ 🌿';
    expect(utf8Encode(s)).toEqual(new TextEncoder().encode(s));
    expect(utf8Decode(new TextEncoder().encode(s))).toBe(s);
    expect(() => utf8Decode(Uint8Array.from([0xc3]))).toThrow();
  });

  it('base64url round-trips every length and is strict', () => {
    const rng = rngOf(7);
    for (let n = 0; n < 40; n++) {
      const b = Uint8Array.from({ length: n }, () => rng.nextInt(256));
      const s = base64urlEncode(b);
      expect(s).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(base64urlDecode(s)).toEqual(b);
      expect(s).toBe(Buffer.from(b).toString('base64url'));
    }
    expect(() => base64urlDecode('abc!')).toThrow();
    expect(() => base64urlDecode('A')).toThrow();
    // "AB" decodes to one byte; "AC" sets unused padding bits → non-canonical.
    expect(() => base64urlDecode('AC')).toThrow();
  });

  it('CRC-32 matches the standard check value', () => {
    expect(crc32(utf8Encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('level codes', () => {
  it('every fixture and the showcase round-trip exactly', () => {
    for (const l of [...FIXTURE_LEVELS, showcase]) {
      const code = encodeLevel(l);
      expect(code.startsWith(CODE_PREFIX)).toBe(true);
      const { level, simVersion } = decodeLevel(code);
      expect(simVersion).toBe(SIM_VERSION);
      expect(level).toEqual(asShared(l));
      // Deterministic: the same level always gives the same code.
      expect(encodeLevel(level)).toBe(code);
    }
  });

  it('a typical test level is well under 1 KB compressed', () => {
    for (const l of [...FIXTURE_LEVELS, showcase])
      expect(compressedSize(l), l.id).toBeLessThan(1024);
    expect(encodeLevel(tunnel).length).toBeLessThan(400);
  });

  it('tolerates whitespace, line breaks and a lower-case prefix', () => {
    const code = encodeLevel(tunnel);
    const prefix = code.slice(0, 4).toLowerCase();
    const messy = `  ${prefix}${code.slice(4, 10)}\n${code.slice(10, 30)} \t${code.slice(30)}\n`;
    expect(decodeLevel(messy).level).toEqual(asShared(tunnel));
    expect(looksLikeCode(messy)).toBe(true);
    expect(looksLikeCode('hello world')).toBe(false);
  });

  it('any single-byte corruption of the code is rejected', () => {
    const code = encodeLevel(showcase);
    const raw = base64urlDecode(code.slice(CODE_PREFIX.length));
    for (let i = 0; i < raw.length; i++) {
      for (const flip of [0x01, 0x80, 0xff]) {
        const bad = raw.slice();
        bad[i] = (bad[i] as number) ^ flip;
        expectCodeError(() => decodeLevel(CODE_PREFIX + base64urlEncode(bad)));
      }
    }
  });

  it('any single-character change of the text is rejected', () => {
    const code = encodeLevel(tunnel);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = CODE_PREFIX.length; i < code.length; i++) {
      const c = code[i] as string;
      const other = alphabet[(alphabet.indexOf(c) + 17) % 64] as string;
      expectCodeError(() => decodeLevel(code.slice(0, i) + other + code.slice(i + 1)));
    }
    // Truncation and junk.
    expectCodeError(() => decodeLevel(code.slice(0, -3)));
    expectCodeError(() => decodeLevel(code + 'AAAA'));
    expectCodeError(() => decodeLevel('XL1-' + code.slice(4)), 'prefix');
    expectCodeError(() => decodeLevel('PL1-'));
  });

  it('rejects codes from a newer engine', () => {
    const payload = serializeLevel(tunnel);
    const body = payload.slice(0, -4);
    body[2] = SIM_VERSION + 1;
    const w = new ByteWriter();
    w.bytes(body);
    w.u32(crc32(body));
    expectCodeError(() => deserializeLevel(w.finish()), 'newerVersion');
  });

  it('refuses to encode invalid or oversized levels', () => {
    expectCodeError(() => encodeLevel({ ...tunnel, required: 99 }), 'invalidLevel');
    // Long random brush strokes do not compress: blow the 4 KB limit.
    const rng = rngOf(3);
    const ops: RasterOp[] = Array.from({ length: 40 }, () => ({
      op: 'brush',
      m: 1,
      size: 1,
      pts: Array.from({ length: 200 }, () => rng.nextInt(640)),
    }));
    expectCodeError(() => encodeLevel({ ...showcase, w: 640, h: 960, ops }), 'tooLarge');
    expect(MAX_CODE_BYTES).toBe(4096);
  });
});

// --- Property test: 200 generated levels -----------------------------------------------------

function generateLevel(seed: number): LevelDef {
  const rng = rngOf(seed);
  const pick = <T>(xs: readonly T[]): T => xs[rng.nextInt(xs.length)] as T;
  const size = pick(LEVEL_SIZE_PRESETS);
  const W = size.w;
  const H = size.h;
  const coord = (max: number): number => rng.nextInt(max + 64) - 32;
  const pts = (n: number): number[] =>
    Array.from({ length: n * 2 }, (_, i) => coord(i % 2 ? H : W));
  const ops: RasterOp[] = [];
  const opCount = rng.nextInt(25);
  const stampIds = Object.keys(STAMPS);
  for (let i = 0; i < opCount; i++) {
    const m = (1 + rng.nextInt(6)) as 1;
    switch (rng.nextInt(7)) {
      case 0:
        ops.push({
          op: 'rect',
          m,
          x: coord(W),
          y: coord(H),
          w: 1 + rng.nextInt(200),
          h: 1 + rng.nextInt(200),
        });
        break;
      case 1:
        ops.push({ op: 'circle', m, x: coord(W), y: coord(H), r: rng.nextInt(80) });
        break;
      case 2:
        ops.push({
          op: 'ramp',
          m,
          x: coord(W),
          y: coord(H),
          w: 1 + rng.nextInt(120),
          h: 1 + rng.nextInt(120),
          rise: rng.nextInt(2) ? 'left' : 'right',
        });
        break;
      case 3:
        ops.push({ op: 'poly', m, pts: pts(3 + rng.nextInt(8)) });
        break;
      case 4:
        ops.push({ op: 'brush', m, size: rng.nextInt(3) as 0, pts: pts(1 + rng.nextInt(12)) });
        break;
      case 5:
        ops.push({ op: 'erase', size: rng.nextInt(3) as 0, pts: pts(1 + rng.nextInt(12)) });
        break;
      default: {
        const op: RasterOp = { op: 'stamp', id: pick(stampIds), m, x: coord(W), y: coord(H) };
        if (rng.nextInt(2)) op.flip = true;
        ops.push(op);
      }
    }
  }
  const inside = (w: number, h: number) => ({ x: rng.nextInt(W - w), y: rng.nextInt(H - h) });
  const objects: LevelObject[] = [];
  for (let i = 0, n = 1 + rng.nextInt(2); i < n; i++) {
    objects.push({
      type: 'entrance',
      x: 8 + rng.nextInt(W - 16),
      y: 10 + rng.nextInt(H - 20),
      dir: rng.nextInt(2) ? 1 : -1,
    });
  }
  for (let i = 0, n = 1 + rng.nextInt(3); i < n; i++)
    objects.push({ type: 'exit', ...inside(12, 12) });
  for (let i = 0, n = rng.nextInt(5); i < n; i++) {
    const kind = rng.nextInt(5);
    if (kind === 0)
      objects.push({
        type: 'water',
        ...inside(40, 20),
        w: 1 + rng.nextInt(40),
        h: 1 + rng.nextInt(20),
      });
    else if (kind === 1)
      objects.push({
        type: 'lava',
        ...inside(40, 20),
        w: 1 + rng.nextInt(40),
        h: 1 + rng.nextInt(20),
      });
    else if (kind === 2) objects.push({ type: 'trap', ...inside(10, 10) });
    else if (kind === 3)
      objects.push({ type: 'teleport', ...inside(8, 12), tx: rng.nextInt(W), ty: rng.nextInt(H) });
    else objects.push({ type: 'bounce', ...inside(12, 4) });
  }
  const creatures = 1 + rng.nextInt(100);
  const required = 1 + rng.nextInt(creatures);
  const minReleaseTicks = 4 + rng.nextInt(237);
  const timeLimitTicks = 7200 + rng.nextInt(28741);
  const skills = emptySkillSet();
  for (const s of SKILLS) skills[s] = rng.nextInt(100);
  const level = createLevel({
    title: `Level ${seed} – ő`,
    author: rng.nextInt(2) ? 'Ádám' : '',
    theme: pick(THEMES),
    w: W,
    h: H,
    ops,
    objects,
    creatures,
    required,
    master: required + rng.nextInt(creatures - required + 1),
    frugal: rng.nextInt(1000),
    skills,
    timeLimitTicks,
    minReleaseTicks,
    hints: rng.nextInt(2) ? ['Dig early.', 'Mind the lava — ügyelj!'] : [],
  });
  if (rng.nextInt(2)) level.difficulty = 1 + rng.nextInt(10);
  if (rng.nextInt(3)) {
    let t = 0;
    const log = Array.from({ length: rng.nextInt(30) }, () => {
      t += rng.nextInt(400);
      return rng.nextInt(10)
        ? {
            kind: 'assign' as const,
            tick: t,
            creature: rng.nextInt(creatures),
            skill: pick(SKILLS),
          }
        : { kind: 'popAll' as const, tick: t };
    }).filter((c) => c.tick <= timeLimitTicks);
    const fastest = Math.ceil(minReleaseTicks / 4);
    let rt = 0;
    const releaseChanges = Array.from({ length: rng.nextInt(4) }, () => {
      rt += rng.nextInt(600);
      return { tick: rt, interval: fastest + rng.nextInt(minReleaseTicks - fastest + 1) };
    }).filter((c) => c.tick <= timeLimitTicks);
    level.solution = {
      log,
      releaseChanges,
      finalHash: rng.nextInt(0x7fffffff) * 2 + rng.nextInt(2),
    };
  }
  return level;
}

describe('level codes – property test', () => {
  it('200 generated valid levels round-trip exactly', () => {
    let checked = 0;
    for (let seed = 1; checked < 200; seed++) {
      const l = generateLevel(seed);
      expect(validateLevel(l), `seed ${seed}`).toEqual([]);
      const code = encodeLevel(l);
      expect(decodeLevel(code).level, `seed ${seed}`).toEqual(asShared(l));
      checked++;
    }
  });
});
