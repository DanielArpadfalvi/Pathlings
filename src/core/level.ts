/**
 * Level definition (§3.3) and its validator (§1.8 editor validation).
 *
 * A level is pure data: size, terrain as an editor op list (see `raster.ts`), objects, creature
 * counts, skill stock, timing and – for published / built-in levels – a reference solution.
 * All numbers are integers; times are in 60 Hz ticks.
 */

import { MAX_OPS, type RasterOp, rasterize, validateOp } from './raster';
import { STAMPS, type StampLibrary } from './stamps';
import type { Rect, Terrain } from './terrain';
import { LEVEL_FORMAT_VERSION } from './version';

// --- Skills -----------------------------------------------------------------------------------

/** The 8 skills in their fixed order (also the order in level codes and the skill bar). */
export const SKILLS = [
  'scaler',
  'glider',
  'popper',
  'warden',
  'mason',
  'burrower',
  'sloper',
  'delver',
] as const;
export type SkillId = (typeof SKILLS)[number];
/** Permanent skills stack with each other and with one active skill. */
export const PERMANENT_SKILLS: readonly SkillId[] = ['scaler', 'glider'];
export type SkillSet = Record<SkillId, number>;
export const MAX_SKILL_STOCK = 99;

export function isSkillId(value: unknown): value is SkillId {
  return typeof value === 'string' && (SKILLS as readonly string[]).includes(value);
}

/** A skill set with every stock at `n` (default 0). */
export function emptySkillSet(n = 0): SkillSet {
  return {
    scaler: n,
    glider: n,
    popper: n,
    warden: n,
    mason: n,
    burrower: n,
    sloper: n,
    delver: n,
  };
}

// --- Themes -----------------------------------------------------------------------------------

/** Mossy Glade, Crystal Deep, Clockworks, Skyreach (§1.3). */
export const THEMES = ['glade', 'deep', 'clockworks', 'skyreach'] as const;
export type ThemeId = (typeof THEMES)[number];

// --- Numbers (§1.1, §1.8) ---------------------------------------------------------------------

export const TICKS_PER_SECOND = 60;
export const LEVEL_MIN_W = 160;
export const LEVEL_MAX_W = 640;
export const LEVEL_MIN_H = 240;
export const LEVEL_MAX_H = 960;
/** Level width/height must be a multiple of this (level codes store size ÷ 16). */
export const LEVEL_SIZE_STEP = 16;
/** Editor size presets. */
export const LEVEL_SIZE_PRESETS: readonly { w: number; h: number }[] = [
  { w: 320, h: 480 },
  { w: 480, h: 720 },
  { w: 640, h: 960 },
  { w: 640, h: 480 },
];
export const MAX_CREATURES = 100;
export const DEFAULT_TIME_LIMIT_TICKS = 5 * 60 * TICKS_PER_SECOND; // 5:00
export const MIN_TIME_LIMIT_TICKS = 2 * 60 * TICKS_PER_SECOND; // 2:00
export const MAX_TIME_LIMIT_TICKS = (9 * 60 + 59) * TICKS_PER_SECOND; // 9:59
/** Bounds for `minReleaseTicks` (ticks between two spawns at the slowest allowed rate). */
export const MIN_RELEASE_TICKS = 4;
export const MAX_RELEASE_TICKS = 240;
export const DEFAULT_RELEASE_TICKS = 60;
/** The player may speed the release rate up to 4× the level's minimum rate. */
export const MAX_RELEASE_SPEEDUP = 4;
export const MAX_TITLE_LENGTH = 32;
export const MAX_AUTHOR_LENGTH = 24;
export const MAX_HINTS = 2;
export const MAX_HINT_LENGTH = 160;
export const MAX_ID_LENGTH = 64;
export const MAX_FRUGAL = 999;
export const MIN_ENTRANCES = 1;
export const MAX_ENTRANCES = 2;
export const MIN_EXITS = 1;
export const MAX_EXITS = 3;
export const MAX_OBJECTS = 64;
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 10;

/** Fastest allowed spawn interval for a level: the minimum rate sped up `MAX_RELEASE_SPEEDUP`×. */
export function fastestReleaseTicks(minReleaseTicks: number): number {
  return Math.max(1, Math.floor((minReleaseTicks + MAX_RELEASE_SPEEDUP - 1) / MAX_RELEASE_SPEEDUP));
}

// --- Objects (§1.1 "Pályaobjektumok") ---------------------------------------------------------

/** Size of the hatch drawn above an entrance's spawn point. */
export const ENTRANCE_W = 16;
export const ENTRANCE_H = 10;
/** Exit zone: a creature whose foot point enters it is saved. */
export const EXIT_W = 12;
export const EXIT_H = 12;
/** Trap trigger zone. */
export const TRAP_W = 10;
export const TRAP_H = 10;
/** Teleporter entry zone. */
export const TELEPORT_W = 8;
export const TELEPORT_H = 12;
/** Bounce pad zone. */
export const BOUNCE_W = 12;
export const BOUNCE_H = 4;

/** Spawn point (creature foot point) at (x, y); new creatures face `dir` (1 = right, −1 = left). */
export interface EntranceObject {
  type: 'entrance';
  x: number;
  y: number;
  dir: 1 | -1;
}

/** Exit zone `EXIT_W` × `EXIT_H` with its top-left at (x, y). */
export interface ExitObject {
  type: 'exit';
  x: number;
  y: number;
}

/** Deadly liquid area (any size). */
export interface WaterObject {
  type: 'water';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LavaObject {
  type: 'lava';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Trap zone `TRAP_W` × `TRAP_H` at (x, y): kills one creature, then reloads. */
export interface TrapObject {
  type: 'trap';
  x: number;
  y: number;
}

/**
 * Teleporter pair: entry zone `TELEPORT_W` × `TELEPORT_H` at (x, y); creatures entering it
 * reappear with their foot point at (tx, ty), keeping their direction.
 */
export interface TeleportObject {
  type: 'teleport';
  x: number;
  y: number;
  tx: number;
  ty: number;
}

/** Bounce pad zone `BOUNCE_W` × `BOUNCE_H` at (x, y): launches creatures upwards. */
export interface BounceObject {
  type: 'bounce';
  x: number;
  y: number;
}

export type LevelObject =
  | EntranceObject
  | ExitObject
  | WaterObject
  | LavaObject
  | TrapObject
  | TeleportObject
  | BounceObject;
export type LevelObjectType = LevelObject['type'];
export const OBJECT_TYPES: readonly LevelObjectType[] = [
  'entrance',
  'exit',
  'water',
  'lava',
  'trap',
  'teleport',
  'bounce',
];

/**
 * The area an object occupies (its trigger zone; for an entrance the hatch above the spawn point).
 * Teleport: the entry zone only (the destination is a point).
 */
export function objectRect(o: LevelObject): Rect {
  switch (o.type) {
    case 'entrance':
      return {
        x: o.x - (ENTRANCE_W >> 1),
        y: o.y - ENTRANCE_H,
        w: ENTRANCE_W,
        h: ENTRANCE_H,
      };
    case 'exit':
      return { x: o.x, y: o.y, w: EXIT_W, h: EXIT_H };
    case 'water':
    case 'lava':
      return { x: o.x, y: o.y, w: o.w, h: o.h };
    case 'trap':
      return { x: o.x, y: o.y, w: TRAP_W, h: TRAP_H };
    case 'teleport':
      return { x: o.x, y: o.y, w: TELEPORT_W, h: TELEPORT_H };
    case 'bounce':
      return { x: o.x, y: o.y, w: BOUNCE_W, h: BOUNCE_H };
  }
}

/** Whether point (px, py) lies inside rect r. */
export function rectContains(r: Rect, px: number, py: number): boolean {
  return px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h;
}

// --- Solution (input log) ---------------------------------------------------------------------

/** Assign `skill` to the creature with stable id `creature` (spawn order, from 0) at `tick`. */
export interface AssignCommand {
  kind: 'assign';
  tick: number;
  creature: number;
  skill: SkillId;
}

/** Turn every creature into a Popper ("pop all"). */
export interface PopAllCommand {
  kind: 'popAll';
  tick: number;
}

export type LogCommand = AssignCommand | PopAllCommand;

/** From `tick` on, spawn a creature every `interval` ticks. */
export interface ReleaseChange {
  tick: number;
  interval: number;
}

export interface Solution {
  /** Commands in non-decreasing tick order. */
  log: LogCommand[];
  /** Release-rate changes in non-decreasing tick order. */
  releaseChanges: ReleaseChange[];
  /** FNV-1a state hash at the end of the solution run (unsigned 32-bit). */
  finalHash: number;
}

// --- Level definition -------------------------------------------------------------------------

export interface LevelDef {
  /** Schema version, `LEVEL_FORMAT_VERSION`. */
  v: number;
  /** Stable id (e.g. `w1-01` for built-ins); may be empty for community levels. */
  id: string;
  /** Literal title (community levels, ≤ 32 chars). Built-ins also set `titleKey`. */
  title: string;
  /** i18n key of the title for built-in levels (takes precedence over `title` in the UI). */
  titleKey?: string;
  /** Author nickname (optional, may be empty). */
  author: string;
  theme: ThemeId;
  /** Internal difficulty 1–10 for QA (built-ins). */
  difficulty?: number;
  w: number;
  h: number;
  /** Terrain as editor ops, rasterized in order onto an all-air mask. */
  ops: RasterOp[];
  /** Objects; iteration order in the sim is this definition order. */
  objects: LevelObject[];
  /** Number of creatures released. */
  creatures: number;
  /** ★: at least this many must be saved. */
  required: number;
  /** ★★ threshold (≥ required). */
  master: number;
  /** ★★★: win with at most this many skill assignments. */
  frugal: number;
  skills: SkillSet;
  timeLimitTicks: number;
  /** Ticks between spawns at the slowest (default) release rate. */
  minReleaseTicks: number;
  /** Up to 2 literal hints (community levels). */
  hints: string[];
  /** i18n keys of the hints for built-in levels. */
  hintKeys?: string[];
  /** Reference solution (required for built-ins and published codes; absent in drafts). */
  solution?: Solution;
}

/**
 * A level with sensible defaults, overridable field by field. Does not validate, so tests may use
 * tiny hand-built sizes (e.g. a 40 × 20 terrain) that the editor would never allow.
 */
export function createLevel(overrides: Partial<LevelDef> = {}): LevelDef {
  return {
    v: LEVEL_FORMAT_VERSION,
    id: '',
    title: 'Untitled',
    author: '',
    theme: 'glade',
    w: 320,
    h: 480,
    ops: [],
    objects: [],
    creatures: 10,
    required: 5,
    master: 5,
    frugal: 0,
    skills: emptySkillSet(),
    timeLimitTicks: DEFAULT_TIME_LIMIT_TICKS,
    minReleaseTicks: DEFAULT_RELEASE_TICKS,
    hints: [],
    ...overrides,
  };
}

/** Rasterizes the level's op list into a fresh terrain. */
export function buildTerrain(def: LevelDef, stamps: StampLibrary = STAMPS): Terrain {
  return rasterize(def.w, def.h, def.ops, stamps);
}

/** Total skill stock of a level. */
export function totalSkills(skills: SkillSet): number {
  let n = 0;
  for (const s of SKILLS) n += skills[s];
  return n;
}

// --- Validation -------------------------------------------------------------------------------

export type LevelErrorCode =
  | 'version'
  | 'id'
  | 'title'
  | 'author'
  | 'theme'
  | 'difficulty'
  | 'size'
  | 'creatures'
  | 'required'
  | 'master'
  | 'frugal'
  | 'skills'
  | 'timeLimit'
  | 'releaseRate'
  | 'hints'
  | 'noEntrance'
  | 'tooManyEntrances'
  | 'noExit'
  | 'tooManyExits'
  | 'tooManyObjects'
  | 'objectInvalid'
  | 'objectOutOfBounds'
  | 'opsInvalid'
  | 'tooManyOps'
  | 'opInvalid'
  | 'solution';

export interface LevelError {
  code: LevelErrorCode;
  /** Where the problem is, e.g. `objects[3]`, `ops[12]`, `skills.mason`. */
  path: string;
  message: string;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => isInt(v) && v >= lo && v <= hi;

function rectInside(r: Rect, w: number, h: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
}

function objectShapeError(o: LevelObject): string | null {
  if (typeof o !== 'object' || o === null) return 'object must be an object';
  if (!OBJECT_TYPES.includes(o.type)) return 'unknown object type';
  if (!isInt(o.x) || !isInt(o.y)) return 'position must be integers';
  switch (o.type) {
    case 'entrance':
      return o.dir === 1 || o.dir === -1 ? null : 'dir must be 1 or -1';
    case 'water':
    case 'lava':
      return inRange(o.w, 1, LEVEL_MAX_W) && inRange(o.h, 1, LEVEL_MAX_H) ? null : 'invalid size';
    case 'teleport':
      return isInt(o.tx) && isInt(o.ty) ? null : 'destination must be integers';
    default:
      return null;
  }
}

function objectInBounds(o: LevelObject, w: number, h: number): boolean {
  switch (o.type) {
    case 'entrance':
      return o.x >= 0 && o.y >= 0 && o.x < w && o.y < h;
    case 'teleport':
      return rectInside(objectRect(o), w, h) && o.tx >= 0 && o.ty >= 0 && o.tx < w && o.ty < h;
    default:
      return rectInside(objectRect(o), w, h);
  }
}

function solutionErrors(
  def: LevelDef,
  sol: Solution,
  add: (path: string, msg: string) => void,
): void {
  if (typeof sol !== 'object' || sol === null) {
    add('solution', 'solution must be an object');
    return;
  }
  if (!inRange(sol.finalHash, 0, 0xffffffff))
    add('solution.finalHash', 'must be an unsigned 32-bit integer');
  if (!Array.isArray(sol.log)) add('solution.log', 'must be an array');
  else {
    let prev = 0;
    sol.log.forEach((c, i) => {
      const p = `solution.log[${i}]`;
      if (typeof c !== 'object' || c === null) return add(p, 'must be an object');
      if (!inRange(c.tick, prev, def.timeLimitTicks)) {
        return add(p, 'tick must be a non-decreasing integer within the time limit');
      }
      prev = c.tick;
      if (c.kind === 'popAll') return;
      if (c.kind !== 'assign') return add(p, 'unknown command');
      if (!inRange(c.creature, 0, def.creatures - 1)) add(p, 'creature id out of range');
      if (!isSkillId(c.skill)) add(p, 'unknown skill');
    });
  }
  if (!Array.isArray(sol.releaseChanges)) add('solution.releaseChanges', 'must be an array');
  else {
    let prev = 0;
    const fastest = fastestReleaseTicks(def.minReleaseTicks);
    sol.releaseChanges.forEach((c, i) => {
      const p = `solution.releaseChanges[${i}]`;
      if (typeof c !== 'object' || c === null) return add(p, 'must be an object');
      if (!inRange(c.tick, prev, def.timeLimitTicks)) {
        return add(p, 'tick must be a non-decreasing integer within the time limit');
      }
      prev = c.tick;
      if (!inRange(c.interval, fastest, def.minReleaseTicks)) {
        add(p, `interval must be within ${fastest}–${def.minReleaseTicks}`);
      }
    });
  }
}

/**
 * Checks a level definition (editor live validation, level loading, CI). Returns every problem
 * found; an empty array means valid. Robust against malformed input (e.g. parsed JSON).
 */
export function validateLevel(def: LevelDef, stamps: StampLibrary = STAMPS): LevelError[] {
  const errors: LevelError[] = [];
  const add = (code: LevelErrorCode, path: string, message: string): void => {
    errors.push({ code, path, message });
  };

  if (def.v !== LEVEL_FORMAT_VERSION) add('version', 'v', `unsupported version ${String(def.v)}`);
  if (typeof def.id !== 'string' || def.id.length > MAX_ID_LENGTH) add('id', 'id', 'invalid id');
  if (
    typeof def.title !== 'string' ||
    def.title.trim().length === 0 ||
    def.title.length > MAX_TITLE_LENGTH
  ) {
    add('title', 'title', `title must be 1–${MAX_TITLE_LENGTH} characters`);
  }
  if (def.titleKey !== undefined && (typeof def.titleKey !== 'string' || def.titleKey === '')) {
    add('title', 'titleKey', 'titleKey must be a non-empty string');
  }
  if (typeof def.author !== 'string' || def.author.length > MAX_AUTHOR_LENGTH) {
    add('author', 'author', `author must be at most ${MAX_AUTHOR_LENGTH} characters`);
  }
  if (!(THEMES as readonly unknown[]).includes(def.theme)) add('theme', 'theme', 'unknown theme');
  if (def.difficulty !== undefined && !inRange(def.difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY)) {
    add('difficulty', 'difficulty', `difficulty must be ${MIN_DIFFICULTY}–${MAX_DIFFICULTY}`);
  }

  const sizeOk =
    inRange(def.w, LEVEL_MIN_W, LEVEL_MAX_W) &&
    inRange(def.h, LEVEL_MIN_H, LEVEL_MAX_H) &&
    def.w % LEVEL_SIZE_STEP === 0 &&
    def.h % LEVEL_SIZE_STEP === 0;
  if (!sizeOk) {
    add(
      'size',
      'w,h',
      `size must be ${LEVEL_MIN_W}–${LEVEL_MAX_W} × ${LEVEL_MIN_H}–${LEVEL_MAX_H}, multiples of ${LEVEL_SIZE_STEP}`,
    );
  }

  const creaturesOk = inRange(def.creatures, 1, MAX_CREATURES);
  if (!creaturesOk) add('creatures', 'creatures', `creatures must be 1–${MAX_CREATURES}`);
  const requiredOk = inRange(def.required, 1, creaturesOk ? def.creatures : MAX_CREATURES);
  if (!requiredOk) add('required', 'required', 'required must be 1–creatures');
  if (
    !inRange(def.master, requiredOk ? def.required : 1, creaturesOk ? def.creatures : MAX_CREATURES)
  ) {
    add('master', 'master', 'master must be between required and creatures');
  }
  if (!inRange(def.frugal, 0, MAX_FRUGAL))
    add('frugal', 'frugal', `frugal must be 0–${MAX_FRUGAL}`);

  if (typeof def.skills !== 'object' || def.skills === null) {
    add('skills', 'skills', 'skills must be an object');
  } else {
    for (const s of SKILLS) {
      if (!inRange(def.skills[s], 0, MAX_SKILL_STOCK)) {
        add('skills', `skills.${s}`, `stock must be 0–${MAX_SKILL_STOCK}`);
      }
    }
    for (const k of Object.keys(def.skills)) {
      if (!isSkillId(k)) add('skills', `skills.${k}`, 'unknown skill');
    }
  }

  const timeOk = inRange(def.timeLimitTicks, MIN_TIME_LIMIT_TICKS, MAX_TIME_LIMIT_TICKS);
  if (!timeOk) add('timeLimit', 'timeLimitTicks', 'time limit must be 2:00–9:59');
  const releaseOk = inRange(def.minReleaseTicks, MIN_RELEASE_TICKS, MAX_RELEASE_TICKS);
  if (!releaseOk) {
    add(
      'releaseRate',
      'minReleaseTicks',
      `release interval must be ${MIN_RELEASE_TICKS}–${MAX_RELEASE_TICKS} ticks`,
    );
  }

  if (!Array.isArray(def.hints) || def.hints.length > MAX_HINTS) {
    add('hints', 'hints', `at most ${MAX_HINTS} hints`);
  } else {
    def.hints.forEach((hint, i) => {
      if (typeof hint !== 'string' || hint.length > MAX_HINT_LENGTH) {
        add('hints', `hints[${i}]`, `hint must be at most ${MAX_HINT_LENGTH} characters`);
      }
    });
  }
  if (
    def.hintKeys !== undefined &&
    (!Array.isArray(def.hintKeys) ||
      def.hintKeys.length > MAX_HINTS ||
      !def.hintKeys.every((k) => typeof k === 'string' && k !== ''))
  ) {
    add('hints', 'hintKeys', `at most ${MAX_HINTS} non-empty hint keys`);
  }

  // Objects
  if (!Array.isArray(def.objects)) {
    add('objectInvalid', 'objects', 'objects must be an array');
  } else {
    let entrances = 0;
    let exits = 0;
    if (def.objects.length > MAX_OBJECTS)
      add('tooManyObjects', 'objects', `at most ${MAX_OBJECTS} objects`);
    def.objects.forEach((o, i) => {
      const path = `objects[${i}]`;
      const shapeErr = objectShapeError(o);
      if (shapeErr) return add('objectInvalid', path, shapeErr);
      if (o.type === 'entrance') entrances++;
      if (o.type === 'exit') exits++;
      if (sizeOk && !objectInBounds(o, def.w, def.h))
        add('objectOutOfBounds', path, `${o.type} is outside the level`);
    });
    if (entrances < MIN_ENTRANCES) add('noEntrance', 'objects', 'the level needs an entrance');
    if (entrances > MAX_ENTRANCES)
      add('tooManyEntrances', 'objects', `at most ${MAX_ENTRANCES} entrances`);
    if (exits < MIN_EXITS) add('noExit', 'objects', 'the level needs an exit');
    if (exits > MAX_EXITS) add('tooManyExits', 'objects', `at most ${MAX_EXITS} exits`);
  }

  // Terrain ops
  if (!Array.isArray(def.ops)) {
    add('opsInvalid', 'ops', 'ops must be an array');
  } else {
    if (def.ops.length > MAX_OPS) add('tooManyOps', 'ops', `at most ${MAX_OPS} terrain ops`);
    def.ops.forEach((op, i) => {
      const err = validateOp(op, stamps);
      if (err) add('opInvalid', `ops[${i}]`, err);
    });
  }

  if (def.solution !== undefined) {
    if (timeOk && releaseOk && creaturesOk) {
      solutionErrors(def, def.solution, (path, msg) => add('solution', path, msg));
    } else {
      add('solution', 'solution', 'cannot check the solution of an invalid level');
    }
  }

  return errors;
}

export function isValidLevel(def: LevelDef, stamps: StampLibrary = STAMPS): boolean {
  return validateLevel(def, stamps).length === 0;
}

/** Throws a RangeError listing every validation problem. */
export function assertValidLevel(def: LevelDef, stamps: StampLibrary = STAMPS): void {
  const errors = validateLevel(def, stamps);
  if (errors.length > 0) {
    throw new RangeError(
      `invalid level '${String(def.id)}': ${errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
    );
  }
}
