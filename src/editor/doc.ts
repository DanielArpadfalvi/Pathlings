import { MAX_CODE_BYTES, compressedSize } from '../core/code/levelCode';
import type { LevelDef, LevelError, LevelObject, ThemeId } from '../core/level';
import {
  LEVEL_SIZE_PRESETS,
  MAX_CREATURES,
  MAX_SKILL_STOCK,
  MAX_TIME_LIMIT_TICKS,
  MAX_RELEASE_TICKS,
  MIN_RELEASE_TICKS,
  MIN_TIME_LIMIT_TICKS,
  MAX_TITLE_LENGTH,
  MAX_AUTHOR_LENGTH,
  MAX_HINT_LENGTH,
  SKILLS,
  createLevel,
  emptySkillSet,
  validateLevel,
} from '../core/level';
import { MAX_OPS, type RasterOp } from '../core/raster';

/**
 * The level being edited (§1.8): an immutable `LevelDef` draft plus undo/redo history. Every
 * edit produces a new draft (ops / objects arrays are copied, the op objects themselves are never
 * mutated), so undo is a pointer move. Terrain stays an op list (≤ `MAX_OPS`), never a bitmap.
 */

export const MAX_UNDO = 200;

/** Fields of the properties sheet (§1.8). */
export interface LevelProps {
  title: string;
  author: string;
  theme: ThemeId;
  /** Index into `LEVEL_SIZE_PRESETS`. */
  sizePreset: number;
  creatures: number;
  required: number;
  master: number;
  frugal: number;
  skills: Record<(typeof SKILLS)[number], number>;
  timeLimitTicks: number;
  minReleaseTicks: number;
  hints: string[];
}

export interface EditorStatus {
  errors: LevelError[];
  opCount: number;
  /** Compressed code size in bytes (code-size meter) and the hard limit. */
  codeBytes: number;
  codeLimit: number;
  /** All checks pass: test-play allowed. */
  playable: boolean;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));
}

/** A fresh level: a floor, an entrance on the left, an exit on the right. */
export function newDraft(sizePreset = 0, theme: ThemeId = 'glade'): LevelDef {
  const size = LEVEL_SIZE_PRESETS[sizePreset] ?? LEVEL_SIZE_PRESETS[0]!;
  const floorY = size.h - 40;
  return createLevel({
    title: 'My level',
    theme,
    w: size.w,
    h: size.h,
    ops: [{ op: 'rect', m: 1, x: 0, y: floorY, w: size.w, h: 40 }],
    objects: [
      { type: 'entrance', x: 40, y: floorY - 20, dir: 1 },
      { type: 'exit', x: size.w - 52, y: floorY - 12 },
    ],
    creatures: 10,
    required: 5,
    master: 8,
    frugal: 3,
    skills: emptySkillSet(5),
  });
}

export class EditorDoc {
  private history: LevelDef[];
  private index = 0;
  /** Called after every change (incl. undo/redo) with the new draft. */
  onChange: ((level: LevelDef) => void) | null = null;

  constructor(initial: LevelDef = newDraft()) {
    const draft = { ...initial };
    delete draft.solution;
    this.history = [draft];
  }

  get level(): LevelDef {
    return this.history[this.index] as LevelDef;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.history.length - 1;
  }

  /** Number of undo steps kept. */
  get undoDepth(): number {
    return this.index;
  }

  private commit(next: LevelDef): void {
    this.history = this.history.slice(0, this.index + 1);
    this.history.push(next);
    if (this.history.length > MAX_UNDO + 1) this.history.shift();
    this.index = this.history.length - 1;
    this.onChange?.(next);
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    this.index--;
    this.onChange?.(this.level);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    this.index++;
    this.onChange?.(this.level);
    return true;
  }

  // --- Terrain ops ----------------------------------------------------------------------------

  get opsLeft(): number {
    return MAX_OPS - this.level.ops.length;
  }

  /** Appends ops as one undo step. Returns false (nothing changes) beyond the op limit. */
  addOps(ops: readonly RasterOp[]): boolean {
    if (ops.length === 0 || this.level.ops.length + ops.length > MAX_OPS) return false;
    this.commit({ ...this.level, ops: [...this.level.ops, ...ops] });
    return true;
  }

  // --- Objects --------------------------------------------------------------------------------

  addObject(o: LevelObject): number {
    this.commit({ ...this.level, objects: [...this.level.objects, o] });
    return this.level.objects.length - 1;
  }

  updateObject(index: number, o: LevelObject): void {
    if (!this.level.objects[index]) return;
    const objects = this.level.objects.slice();
    objects[index] = o;
    this.commit({ ...this.level, objects });
  }

  removeObject(index: number): void {
    if (!this.level.objects[index]) return;
    this.commit({ ...this.level, objects: this.level.objects.filter((_, i) => i !== index) });
  }

  // --- Properties -----------------------------------------------------------------------------

  get props(): LevelProps {
    const l = this.level;
    const preset = LEVEL_SIZE_PRESETS.findIndex((p) => p.w === l.w && p.h === l.h);
    return {
      title: l.title,
      author: l.author,
      theme: l.theme,
      sizePreset: Math.max(0, preset),
      creatures: l.creatures,
      required: l.required,
      master: l.master,
      frugal: l.frugal,
      skills: { ...l.skills },
      timeLimitTicks: l.timeLimitTicks,
      minReleaseTicks: l.minReleaseTicks,
      hints: [...l.hints],
    };
  }

  /** Applies a properties patch with the §1.8 limits (one undo step). */
  setProps(patch: Partial<LevelProps>): void {
    const p = { ...this.props, ...patch };
    const size = LEVEL_SIZE_PRESETS[clampInt(p.sizePreset, 0, LEVEL_SIZE_PRESETS.length - 1)]!;
    const creatures = clampInt(p.creatures, 1, MAX_CREATURES);
    const required = clampInt(p.required, 1, creatures);
    const skills = emptySkillSet();
    for (const s of SKILLS) skills[s] = clampInt(p.skills[s], 0, MAX_SKILL_STOCK);
    this.commit({
      ...this.level,
      title: p.title.slice(0, MAX_TITLE_LENGTH),
      author: p.author.slice(0, MAX_AUTHOR_LENGTH),
      theme: p.theme,
      w: size.w,
      h: size.h,
      creatures,
      required,
      master: clampInt(p.master, required, creatures),
      frugal: clampInt(p.frugal, 0, 999),
      skills,
      timeLimitTicks: clampInt(p.timeLimitTicks, MIN_TIME_LIMIT_TICKS, MAX_TIME_LIMIT_TICKS),
      minReleaseTicks: clampInt(p.minReleaseTicks, MIN_RELEASE_TICKS, MAX_RELEASE_TICKS),
      hints: p.hints
        .slice(0, 2)
        .map((h) => h.slice(0, MAX_HINT_LENGTH))
        .filter((h) => h.trim().length > 0),
    });
  }

  // --- Validation -----------------------------------------------------------------------------

  /** Live validation (§1.8): level rules, op limit and code-size limit. */
  get status(): EditorStatus {
    const errors = validateLevel(this.level);
    let codeBytes: number;
    try {
      codeBytes = compressedSize(this.level);
    } catch {
      codeBytes = 0; // malformed draft: validation already lists the problem
    }
    if (codeBytes > MAX_CODE_BYTES) {
      errors.push({ code: 'tooManyOps', path: 'ops', message: 'level code too large' });
    }
    return {
      errors,
      opCount: this.level.ops.length,
      codeBytes,
      codeLimit: MAX_CODE_BYTES,
      playable: errors.length === 0,
    };
  }
}
