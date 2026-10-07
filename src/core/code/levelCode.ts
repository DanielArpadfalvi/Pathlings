import { deflateSync, inflateSync } from 'fflate';
import type { LevelDef, LevelObject, LogCommand, SkillId } from '../level';
import {
  LEVEL_SIZE_STEP,
  MAX_AUTHOR_LENGTH,
  MAX_HINT_LENGTH,
  MAX_HINTS,
  MAX_TITLE_LENGTH,
  SKILLS,
  THEMES,
  createLevel,
  emptySkillSet,
  validateLevel,
} from '../level';
import type { RasterOp } from '../raster';
import type { Material } from '../terrain';
import { SIM_VERSION } from '../version';
import { ByteReader, ByteWriter, TruncatedError, base64urlDecode, base64urlEncode } from './bytes';
import { crc32 } from './crc32';

/**
 * Level codes (§1.9, §3.3): `PL1-` + base64url( deflate-raw(payload) ‖ CRC32(compressed) ).
 * The payload is a compact binary level (varints, coordinates delta-coded) ending in its own
 * CRC32. The outer CRC guarantees that any change to the transmitted bytes – even in the unused
 * padding bits of the deflate stream – is rejected. Pure and deterministic.
 */

export const CODE_PREFIX = 'PL1-';
/** First payload byte. */
export const CODE_MAGIC = 0x50; // 'P'
/** Binary layout version (bump with a migration path when the layout changes). */
export const CODE_FORMAT_VERSION = 1;
/** Hard limit for the compressed level (§3.3: 4 KB). */
export const MAX_CODE_BYTES = 4096;
/** Upper bound for the decompressed payload (guards against inflate bombs). */
export const MAX_PAYLOAD_BYTES = 256 * 1024;

export type LevelCodeErrorKind =
  | 'prefix'
  | 'encoding'
  | 'tooLarge'
  | 'checksum'
  | 'corrupt'
  | 'format'
  | 'newerVersion'
  | 'invalidLevel';

export class LevelCodeError extends Error {
  constructor(
    readonly kind: LevelCodeErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LevelCodeError';
  }
}

export interface DecodedLevel {
  level: LevelDef;
  /** Engine version the code was made with (older ones may need compatibility handling). */
  simVersion: number;
}

// --- Op / object codes ------------------------------------------------------------------------

const OP_KINDS = ['rect', 'circle', 'ramp', 'poly', 'brush', 'erase', 'stamp'] as const;
const OBJECT_KINDS = ['entrance', 'exit', 'water', 'lava', 'trap', 'teleport', 'bounce'] as const;
/** Log command code for "pop all" (skills use 0…7). */
const POP_ALL_CODE = 8;

function writePoints(w: ByteWriter, pts: readonly number[]): void {
  w.uv(pts.length / 2);
  let px = 0;
  let py = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] as number;
    const y = pts[i + 1] as number;
    w.sv(x - px);
    w.sv(y - py);
    px = x;
    py = y;
  }
}

function readPoints(r: ByteReader): number[] {
  const n = r.uv();
  if (n > 4096) throw new TruncatedError('too many points');
  const pts: number[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += r.sv();
    y += r.sv();
    pts.push(x, y);
  }
  return pts;
}

/** Op header byte: kind (3 bits) | material (3 bits) | extra (2 bits: rise / brush size / flip). */
function writeOp(w: ByteWriter, op: RasterOp, prev: { x: number; y: number }): void {
  const kind = OP_KINDS.indexOf(op.op);
  const m = op.op === 'erase' ? 0 : op.m;
  let extra = 0;
  if (op.op === 'ramp') extra = op.rise === 'right' ? 1 : 0;
  else if (op.op === 'brush' || op.op === 'erase') extra = op.size;
  else if (op.op === 'stamp') extra = op.flip ? 1 : 0;
  w.u8((kind << 5) | (m << 2) | extra);
  switch (op.op) {
    case 'rect':
    case 'ramp':
      w.sv(op.x - prev.x);
      w.sv(op.y - prev.y);
      w.uv(op.w);
      w.uv(op.h);
      prev.x = op.x;
      prev.y = op.y;
      break;
    case 'circle':
      w.sv(op.x - prev.x);
      w.sv(op.y - prev.y);
      w.uv(op.r);
      prev.x = op.x;
      prev.y = op.y;
      break;
    case 'stamp':
      w.str(op.id);
      w.sv(op.x - prev.x);
      w.sv(op.y - prev.y);
      prev.x = op.x;
      prev.y = op.y;
      break;
    case 'poly':
    case 'brush':
    case 'erase':
      writePoints(w, op.pts);
      break;
  }
}

function readOp(r: ByteReader, prev: { x: number; y: number }): RasterOp {
  const head = r.u8();
  const kind = OP_KINDS[head >> 5];
  const m = ((head >> 2) & 7) as Material;
  const extra = head & 3;
  const pos = (): { x: number; y: number } => {
    prev.x += r.sv();
    prev.y += r.sv();
    return { x: prev.x, y: prev.y };
  };
  switch (kind) {
    case 'rect': {
      const p = pos();
      return { op: 'rect', m, x: p.x, y: p.y, w: r.uv(), h: r.uv() };
    }
    case 'ramp': {
      const p = pos();
      return {
        op: 'ramp',
        m,
        x: p.x,
        y: p.y,
        w: r.uv(),
        h: r.uv(),
        rise: extra === 1 ? 'right' : 'left',
      };
    }
    case 'circle': {
      const p = pos();
      return { op: 'circle', m, x: p.x, y: p.y, r: r.uv() };
    }
    case 'stamp': {
      const id = r.str(64);
      const p = pos();
      const op: RasterOp = { op: 'stamp', id, m, x: p.x, y: p.y };
      if (extra === 1) op.flip = true;
      return op;
    }
    case 'poly':
      return { op: 'poly', m, pts: readPoints(r) };
    case 'brush':
      return { op: 'brush', m, size: extra as 0 | 1 | 2, pts: readPoints(r) };
    case 'erase':
      return { op: 'erase', size: extra as 0 | 1 | 2, pts: readPoints(r) };
    default:
      throw new TruncatedError('unknown op kind');
  }
}

function writeObject(w: ByteWriter, o: LevelObject, prev: { x: number; y: number }): void {
  const kind = OBJECT_KINDS.indexOf(o.type);
  const flag = o.type === 'entrance' && o.dir < 0 ? 1 : 0;
  w.u8((kind << 1) | flag);
  w.sv(o.x - prev.x);
  w.sv(o.y - prev.y);
  prev.x = o.x;
  prev.y = o.y;
  if (o.type === 'water' || o.type === 'lava') {
    w.uv(o.w);
    w.uv(o.h);
  } else if (o.type === 'teleport') {
    w.sv(o.tx - o.x);
    w.sv(o.ty - o.y);
  }
}

function readObject(r: ByteReader, prev: { x: number; y: number }): LevelObject {
  const head = r.u8();
  const kind = OBJECT_KINDS[head >> 1];
  prev.x += r.sv();
  prev.y += r.sv();
  const x = prev.x;
  const y = prev.y;
  switch (kind) {
    case 'entrance':
      return { type: 'entrance', x, y, dir: head & 1 ? -1 : 1 };
    case 'exit':
      return { type: 'exit', x, y };
    case 'water':
      return { type: 'water', x, y, w: r.uv(), h: r.uv() };
    case 'lava':
      return { type: 'lava', x, y, w: r.uv(), h: r.uv() };
    case 'trap':
      return { type: 'trap', x, y };
    case 'teleport':
      return { type: 'teleport', x, y, tx: x + r.sv(), ty: y + r.sv() };
    case 'bounce':
      return { type: 'bounce', x, y };
    default:
      throw new TruncatedError('unknown object kind');
  }
}

// --- Payload ----------------------------------------------------------------------------------

/** Binary payload of a level (without compression), ending in its CRC32. */
export function serializeLevel(def: LevelDef): Uint8Array {
  const w = new ByteWriter();
  w.u8(CODE_MAGIC);
  w.u8(CODE_FORMAT_VERSION);
  w.u8(SIM_VERSION);
  w.uv(def.w / LEVEL_SIZE_STEP);
  w.uv(def.h / LEVEL_SIZE_STEP);
  w.u8(THEMES.indexOf(def.theme));
  w.u8(def.difficulty ?? 0);
  w.uv(def.creatures);
  w.uv(def.required);
  w.uv(def.master);
  w.uv(def.frugal);
  w.uv(def.timeLimitTicks);
  w.uv(def.minReleaseTicks);
  for (const s of SKILLS) w.u8(def.skills[s]);
  w.str(def.title);
  w.str(def.author);
  w.uv(def.hints.length);
  for (const h of def.hints) w.str(h);

  w.uv(def.ops.length);
  const opPrev = { x: 0, y: 0 };
  for (const op of def.ops) writeOp(w, op, opPrev);
  w.uv(def.objects.length);
  const objPrev = { x: 0, y: 0 };
  for (const o of def.objects) writeObject(w, o, objPrev);

  const sol = def.solution;
  w.u8(sol ? 1 : 0);
  if (sol) {
    w.uv(sol.log.length);
    let t = 0;
    for (const c of sol.log) {
      w.uv(c.tick - t);
      t = c.tick;
      w.uv(c.kind === 'popAll' ? POP_ALL_CODE : c.creature * 16 + SKILLS.indexOf(c.skill));
    }
    w.uv(sol.releaseChanges.length);
    t = 0;
    for (const rc of sol.releaseChanges) {
      w.uv(rc.tick - t);
      t = rc.tick;
      w.uv(rc.interval);
    }
    w.u32(sol.finalHash >>> 0);
  }
  const body = w.finish();
  const out = new ByteWriter();
  out.bytes(body);
  out.u32(crc32(body));
  return out.finish();
}

/** Parses a payload produced by `serializeLevel` (does not validate the level). */
export function deserializeLevel(bytes: Uint8Array): DecodedLevel {
  if (bytes.length < 8) throw new LevelCodeError('corrupt', 'payload too short');
  const body = bytes.subarray(0, bytes.length - 4);
  const stored = new ByteReader(bytes.subarray(bytes.length - 4)).u32();
  if (crc32(body) !== stored) throw new LevelCodeError('checksum', 'payload checksum mismatch');
  const r = new ByteReader(body);
  try {
    if (r.u8() !== CODE_MAGIC) throw new LevelCodeError('format', 'not a level code');
    const format = r.u8();
    if (format > CODE_FORMAT_VERSION) {
      throw new LevelCodeError('newerVersion', 'made with a newer version of the game');
    }
    if (format !== CODE_FORMAT_VERSION) throw new LevelCodeError('format', 'unknown format');
    const simVersion = r.u8();
    if (simVersion > SIM_VERSION) {
      throw new LevelCodeError('newerVersion', 'made with a newer version of the game');
    }
    const width = r.uv() * LEVEL_SIZE_STEP;
    const height = r.uv() * LEVEL_SIZE_STEP;
    const theme = THEMES[r.u8()];
    if (!theme) throw new LevelCodeError('format', 'unknown theme');
    const difficulty = r.u8();
    const creatures = r.uv();
    const required = r.uv();
    const master = r.uv();
    const frugal = r.uv();
    const timeLimitTicks = r.uv();
    const minReleaseTicks = r.uv();
    const skills = emptySkillSet();
    for (const s of SKILLS) skills[s] = r.u8();
    const title = r.str(MAX_TITLE_LENGTH * 4);
    const author = r.str(MAX_AUTHOR_LENGTH * 4);
    const hintCount = r.uv();
    if (hintCount > MAX_HINTS) throw new LevelCodeError('format', 'too many hints');
    const hints: string[] = [];
    for (let i = 0; i < hintCount; i++) hints.push(r.str(MAX_HINT_LENGTH * 4));

    const opCount = r.uv();
    if (opCount > 100_000) throw new TruncatedError('too many ops');
    const ops: RasterOp[] = [];
    const opPrev = { x: 0, y: 0 };
    for (let i = 0; i < opCount; i++) ops.push(readOp(r, opPrev));
    const objCount = r.uv();
    if (objCount > 10_000) throw new TruncatedError('too many objects');
    const objects: LevelObject[] = [];
    const objPrev = { x: 0, y: 0 };
    for (let i = 0; i < objCount; i++) objects.push(readObject(r, objPrev));

    const level = createLevel({
      id: '',
      title,
      author,
      theme,
      w: width,
      h: height,
      ops,
      objects,
      creatures,
      required,
      master,
      frugal,
      skills,
      timeLimitTicks,
      minReleaseTicks,
      hints,
    });
    if (difficulty > 0) level.difficulty = difficulty;

    const hasSolution = r.u8();
    if (hasSolution > 1) throw new LevelCodeError('format', 'bad solution flag');
    if (hasSolution) {
      const n = r.uv();
      if (n > 100_000) throw new TruncatedError('log too long');
      const log: LogCommand[] = [];
      let t = 0;
      for (let i = 0; i < n; i++) {
        t += r.uv();
        const code = r.uv();
        if (code === POP_ALL_CODE) log.push({ kind: 'popAll', tick: t });
        else {
          const skill = SKILLS[code % 16];
          if (!skill) throw new LevelCodeError('format', 'bad log command');
          log.push({
            kind: 'assign',
            tick: t,
            creature: Math.floor(code / 16),
            skill: skill as SkillId,
          });
        }
      }
      const m = r.uv();
      if (m > 100_000) throw new TruncatedError('too many release changes');
      const releaseChanges = [];
      t = 0;
      for (let i = 0; i < m; i++) {
        t += r.uv();
        releaseChanges.push({ tick: t, interval: r.uv() });
      }
      level.solution = { log, releaseChanges, finalHash: r.u32() };
    }
    if (r.remaining !== 0) throw new LevelCodeError('format', 'trailing data');
    return { level, simVersion };
  } catch (e) {
    if (e instanceof LevelCodeError) throw e;
    throw new LevelCodeError('corrupt', e instanceof Error ? e.message : 'corrupt code');
  }
}

// --- Text codes -------------------------------------------------------------------------------

/**
 * Encodes a valid level as a `PL1-…` code. Throws `LevelCodeError` ('invalidLevel') for levels
 * that fail validation and ('tooLarge') above the 4 KB limit.
 */
export function encodeLevel(def: LevelDef): string {
  const problems = validateLevel(def);
  if (problems.length > 0) {
    throw new LevelCodeError('invalidLevel', problems.map((p) => p.message).join('; '));
  }
  const compressed = deflateSync(serializeLevel(def), { level: 9 });
  if (compressed.length > MAX_CODE_BYTES) {
    throw new LevelCodeError(
      'tooLarge',
      `level code is ${compressed.length} bytes (max ${MAX_CODE_BYTES})`,
    );
  }
  const w = new ByteWriter();
  w.bytes(compressed);
  w.u32(crc32(compressed));
  return CODE_PREFIX + base64urlEncode(w.finish());
}

/** Size in bytes of a level's compressed payload (the editor's code-size meter). */
export function compressedSize(def: LevelDef): number {
  return deflateSync(serializeLevel(def), { level: 9 }).length;
}

/** Removes everything a chat app or copy-paste may add: whitespace, line breaks. */
export function normalizeCode(text: string): string {
  return text.replace(/\s+/g, '');
}

/** Whether a pasted text looks like a level code (for paste detection). */
export function looksLikeCode(text: string): boolean {
  return /^pl1-[A-Za-z0-9_-]{8,}$/i.test(normalizeCode(text));
}

/**
 * Decodes a `PL1-…` code (whitespace-tolerant, prefix case-insensitive). Throws `LevelCodeError`
 * for anything that is not a well-formed, valid level. Verification of the embedded solution is
 * a separate step (T4.2).
 */
export function decodeLevel(text: string): DecodedLevel {
  const s = normalizeCode(text);
  if (s.slice(0, CODE_PREFIX.length).toUpperCase() !== CODE_PREFIX) {
    throw new LevelCodeError('prefix', 'not a level code');
  }
  const body = s.slice(CODE_PREFIX.length);
  if (body.length > Math.ceil(((MAX_CODE_BYTES + 4) * 4) / 3)) {
    throw new LevelCodeError('tooLarge', 'level code too long');
  }
  let raw: Uint8Array;
  try {
    raw = base64urlDecode(body);
  } catch {
    throw new LevelCodeError('encoding', 'damaged level code');
  }
  if (raw.length < 5) throw new LevelCodeError('corrupt', 'level code too short');
  const compressed = raw.subarray(0, raw.length - 4);
  const stored = new ByteReader(raw.subarray(raw.length - 4)).u32();
  if (crc32(compressed) !== stored) throw new LevelCodeError('checksum', 'damaged level code');
  let payload: Uint8Array;
  try {
    payload = inflateSync(compressed);
  } catch {
    throw new LevelCodeError('corrupt', 'damaged level code');
  }
  if (payload.length > MAX_PAYLOAD_BYTES) throw new LevelCodeError('tooLarge', 'level too large');
  const decoded = deserializeLevel(payload);
  const problems = validateLevel(decoded.level);
  if (problems.length > 0) {
    throw new LevelCodeError('invalidLevel', problems.map((p) => p.message).join('; '));
  }
  return decoded;
}
