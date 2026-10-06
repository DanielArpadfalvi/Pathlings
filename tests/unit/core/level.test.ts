import { describe, expect, it } from 'vitest';
import {
  type LevelDef,
  type LevelErrorCode,
  type LevelObject,
  BOUNCE_H,
  BOUNCE_W,
  ENTRANCE_H,
  EXIT_W,
  LEVEL_SIZE_PRESETS,
  SKILLS,
  TELEPORT_H,
  TRAP_W,
  assertValidLevel,
  buildTerrain,
  createLevel,
  emptySkillSet,
  fastestReleaseTicks,
  isSkillId,
  isValidLevel,
  objectRect,
  rectContains,
  totalSkills,
  validateLevel,
} from '../../../src/core/level';
import { MAX_OPS, type RasterOp } from '../../../src/core/raster';
import { SOIL, materialAt } from '../../../src/core/terrain';
import { LEVEL_FORMAT_VERSION } from '../../../src/core/version';

/** A small valid level used as the base for every error case. */
function validLevel(overrides: Partial<LevelDef> = {}): LevelDef {
  return createLevel({
    id: 'test-01',
    title: 'Over the Bridge',
    author: 'tester',
    difficulty: 3,
    ops: [{ op: 'rect', m: SOIL, x: 0, y: 440, w: 320, h: 40 }],
    objects: [
      { type: 'entrance', x: 40, y: 440, dir: 1 },
      { type: 'exit', x: 280, y: 428 },
      { type: 'water', x: 120, y: 470, w: 40, h: 10 },
      { type: 'lava', x: 170, y: 470, w: 20, h: 10 },
      { type: 'trap', x: 200, y: 430 },
      { type: 'teleport', x: 60, y: 428, tx: 250, ty: 440 },
      { type: 'bounce', x: 90, y: 436 },
    ],
    skills: { ...emptySkillSet(), mason: 3, delver: 2 },
    solution: {
      log: [
        { kind: 'assign', tick: 120, creature: 0, skill: 'mason' },
        { kind: 'assign', tick: 300, creature: 1, skill: 'delver' },
        { kind: 'popAll', tick: 9000 },
      ],
      releaseChanges: [{ tick: 0, interval: 30 }],
      finalHash: 0xdeadbeef,
    },
    ...overrides,
  });
}

const codes = (def: LevelDef): LevelErrorCode[] => validateLevel(def).map((e) => e.code);
const entrance: LevelObject = { type: 'entrance', x: 10, y: 10, dir: 1 };
const exit: LevelObject = { type: 'exit', x: 100, y: 100 };

describe('level helpers', () => {
  it('createLevel provides defaults without validating', () => {
    const l = createLevel({ w: 40, h: 20 });
    expect(l.v).toBe(LEVEL_FORMAT_VERSION);
    expect(l.w).toBe(40);
    expect(totalSkills(l.skills)).toBe(0);
    expect(codes(l)).toContain('size');
  });

  it('skills: ids, sets, totals', () => {
    expect(SKILLS).toHaveLength(8);
    expect(isSkillId('mason')).toBe(true);
    expect(isSkillId('builder')).toBe(false);
    expect(totalSkills(emptySkillSet(3))).toBe(24);
  });

  it('fastest release interval is the minimum rate sped up 4×', () => {
    expect(fastestReleaseTicks(60)).toBe(15);
    expect(fastestReleaseTicks(61)).toBe(16);
    expect(fastestReleaseTicks(4)).toBe(1);
    expect(fastestReleaseTicks(1)).toBe(1);
  });

  it('objectRect gives each object its zone', () => {
    expect(objectRect({ type: 'entrance', x: 50, y: 40, dir: -1 })).toEqual({
      x: 42,
      y: 40 - ENTRANCE_H,
      w: 16,
      h: ENTRANCE_H,
    });
    expect(objectRect(exit)).toEqual({ x: 100, y: 100, w: EXIT_W, h: 12 });
    expect(objectRect({ type: 'water', x: 1, y: 2, w: 3, h: 4 })).toEqual({
      x: 1,
      y: 2,
      w: 3,
      h: 4,
    });
    expect(objectRect({ type: 'lava', x: 1, y: 2, w: 3, h: 4 })).toEqual({
      x: 1,
      y: 2,
      w: 3,
      h: 4,
    });
    expect(objectRect({ type: 'trap', x: 5, y: 6 })).toEqual({ x: 5, y: 6, w: TRAP_W, h: 10 });
    expect(objectRect({ type: 'teleport', x: 5, y: 6, tx: 0, ty: 0 })).toEqual({
      x: 5,
      y: 6,
      w: 8,
      h: TELEPORT_H,
    });
    expect(objectRect({ type: 'bounce', x: 5, y: 6 })).toEqual({
      x: 5,
      y: 6,
      w: BOUNCE_W,
      h: BOUNCE_H,
    });
  });

  it('rectContains is half-open', () => {
    const r = { x: 0, y: 0, w: 12, h: 12 };
    expect(rectContains(r, 0, 0)).toBe(true);
    expect(rectContains(r, 11, 11)).toBe(true);
    expect(rectContains(r, 12, 5)).toBe(false);
    expect(rectContains(r, 5, -1)).toBe(false);
  });

  it('buildTerrain rasterizes the op list at the level size', () => {
    const t = buildTerrain(validLevel());
    expect(t.width).toBe(320);
    expect(t.height).toBe(480);
    expect(materialAt(t, 5, 450)).toBe(SOIL);
    expect(materialAt(t, 5, 400)).toBe(0);
  });
});

describe('validateLevel', () => {
  it('accepts a valid level with every object type, every editor size preset', () => {
    expect(validateLevel(validLevel())).toEqual([]);
    expect(isValidLevel(validLevel())).toBe(true);
    expect(() => assertValidLevel(validLevel())).not.toThrow();
    for (const { w, h } of LEVEL_SIZE_PRESETS) {
      expect(codes(validLevel({ w, h }))).toEqual([]);
    }
    expect(codes(validLevel({ solution: undefined, difficulty: undefined }))).toEqual([]);
    expect(codes(validLevel({ titleKey: 'level.w1.01.title', hintKeys: ['a', 'b'] }))).toEqual([]);
  });

  const cases: [string, Partial<LevelDef>, LevelErrorCode][] = [
    ['wrong version', { v: 99 }, 'version'],
    ['non-string id', { id: 5 as unknown as string }, 'id'],
    ['id too long', { id: 'x'.repeat(65) }, 'id'],
    ['empty title', { title: '   ' }, 'title'],
    ['title too long', { title: 'x'.repeat(33) }, 'title'],
    ['empty title key', { titleKey: '' }, 'title'],
    ['author too long', { author: 'x'.repeat(25) }, 'author'],
    ['non-string author', { author: undefined as unknown as string }, 'author'],
    ['unknown theme', { theme: 'space' as 'glade' }, 'theme'],
    ['difficulty 0', { difficulty: 0 }, 'difficulty'],
    ['difficulty 11', { difficulty: 11 }, 'difficulty'],
    ['width too small', { w: 144 }, 'size'],
    ['height too large', { h: 976 }, 'size'],
    ['width not a multiple of 16', { w: 330 }, 'size'],
    ['float height', { h: 480.5 }, 'size'],
    ['zero creatures', { creatures: 0 }, 'creatures'],
    ['101 creatures', { creatures: 101 }, 'creatures'],
    ['required > creatures', { creatures: 10, required: 11, master: 11 }, 'required'],
    ['required 0', { required: 0 }, 'required'],
    ['master < required', { required: 5, master: 4 }, 'master'],
    ['master > creatures', { master: 11 }, 'master'],
    ['negative frugal', { frugal: -1 }, 'frugal'],
    ['skill stock 100', { skills: { ...emptySkillSet(), popper: 100 } }, 'skills'],
    ['float skill stock', { skills: { ...emptySkillSet(), popper: 1.5 } }, 'skills'],
    [
      'unknown skill',
      { skills: { ...emptySkillSet(), digger: 1 } as LevelDef['skills'] },
      'skills',
    ],
    ['missing skill', { skills: { scaler: 1 } as LevelDef['skills'] }, 'skills'],
    ['skills not an object', { skills: null as unknown as LevelDef['skills'] }, 'skills'],
    ['time limit 1:59', { timeLimitTicks: 119 * 60, solution: undefined }, 'timeLimit'],
    ['time limit 10:00', { timeLimitTicks: 600 * 60, solution: undefined }, 'timeLimit'],
    ['release interval too short', { minReleaseTicks: 3, solution: undefined }, 'releaseRate'],
    ['release interval too long', { minReleaseTicks: 241, solution: undefined }, 'releaseRate'],
    ['three hints', { hints: ['a', 'b', 'c'] }, 'hints'],
    ['hint too long', { hints: ['x'.repeat(161)] }, 'hints'],
    ['hints not an array', { hints: 'x' as unknown as string[] }, 'hints'],
    ['bad hint keys', { hintKeys: ['a', ''] }, 'hints'],
    ['no entrance', { objects: [exit] }, 'noEntrance'],
    ['three entrances', { objects: [entrance, entrance, entrance, exit] }, 'tooManyEntrances'],
    ['no exit', { objects: [entrance] }, 'noExit'],
    ['four exits', { objects: [entrance, exit, exit, exit, exit] }, 'tooManyExits'],
    [
      'too many objects',
      {
        objects: [entrance, exit, ...new Array<LevelObject>(63).fill({ type: 'trap', x: 0, y: 0 })],
      },
      'tooManyObjects',
    ],
    ['objects not an array', { objects: {} as LevelObject[] }, 'objectInvalid'],
    ['null object', { objects: [entrance, exit, null as unknown as LevelObject] }, 'objectInvalid'],
    [
      'unknown object type',
      { objects: [entrance, exit, { type: 'wind', x: 0, y: 0 } as unknown as LevelObject] },
      'objectInvalid',
    ],
    [
      'float object position',
      { objects: [entrance, { type: 'exit', x: 1.5, y: 0 }] },
      'objectInvalid',
    ],
    [
      'bad entrance dir',
      { objects: [{ type: 'entrance', x: 10, y: 10, dir: 0 as 1 }, exit] },
      'objectInvalid',
    ],
    [
      'zero-size water',
      { objects: [entrance, exit, { type: 'water', x: 0, y: 0, w: 0, h: 5 }] },
      'objectInvalid',
    ],
    [
      'float teleport target',
      { objects: [entrance, exit, { type: 'teleport', x: 0, y: 0, tx: 1.5, ty: 0 }] },
      'objectInvalid',
    ],
    [
      'entrance outside',
      { objects: [{ type: 'entrance', x: 320, y: 10, dir: 1 }, exit] },
      'objectOutOfBounds',
    ],
    [
      'exit sticking out',
      { objects: [entrance, { type: 'exit', x: 310, y: 0 }] },
      'objectOutOfBounds',
    ],
    [
      'lava below the level',
      { objects: [entrance, exit, { type: 'lava', x: 0, y: 470, w: 10, h: 20 }] },
      'objectOutOfBounds',
    ],
    [
      'teleport target outside',
      { objects: [entrance, exit, { type: 'teleport', x: 0, y: 0, tx: 0, ty: 480 }] },
      'objectOutOfBounds',
    ],
    [
      'bounce pad outside',
      { objects: [entrance, exit, { type: 'bounce', x: -1, y: 0 }] },
      'objectOutOfBounds',
    ],
    [
      'trap outside',
      { objects: [entrance, exit, { type: 'trap', x: 0, y: 475 }] },
      'objectOutOfBounds',
    ],
    ['ops not an array', { ops: null as unknown as RasterOp[] }, 'opsInvalid'],
    [
      'more than 1024 ops',
      {
        ops: new Array<RasterOp>(MAX_OPS + 1).fill({ op: 'rect', m: SOIL, x: 0, y: 0, w: 1, h: 1 }),
      },
      'tooManyOps',
    ],
    ['invalid op', { ops: [{ op: 'rect', m: SOIL, x: 0.5, y: 0, w: 1, h: 1 }] }, 'opInvalid'],
    ['unknown stamp', { ops: [{ op: 'stamp', id: 'nope', m: SOIL, x: 0, y: 0 }] }, 'opInvalid'],
  ];

  it.each(cases)('reports %s', (_name, overrides, code) => {
    const errors = validateLevel(validLevel(overrides));
    expect(errors.map((e) => e.code)).toContain(code);
    for (const e of errors) {
      expect(e.path.length).toBeGreaterThan(0);
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it('exactly 1024 ops, 2 entrances, 3 exits and 64 objects are still fine', () => {
    const ops = new Array<RasterOp>(MAX_OPS).fill({ op: 'rect', m: SOIL, x: 0, y: 0, w: 1, h: 1 });
    expect(codes(validLevel({ ops }))).toEqual([]);
    const objects = [
      entrance,
      entrance,
      exit,
      exit,
      exit,
      ...new Array<LevelObject>(59).fill({ type: 'trap', x: 0, y: 0 }),
    ];
    expect(codes(validLevel({ objects }))).toEqual([]);
  });

  it('reports the offending index in the path', () => {
    const errors = validateLevel(
      validLevel({
        ops: [
          { op: 'rect', m: SOIL, x: 0, y: 0, w: 1, h: 1 },
          { op: 'circle', m: SOIL, x: 0, y: 0, r: -2 },
        ],
      }),
    );
    expect(errors).toEqual([{ code: 'opInvalid', path: 'ops[1]', message: 'invalid radius' }]);
  });

  describe('solution', () => {
    const withSolution = (patch: Partial<NonNullable<LevelDef['solution']>>): LevelDef => {
      const base = validLevel();
      return { ...base, solution: { ...base.solution!, ...patch } };
    };

    const solutionCases: [string, LevelDef][] = [
      ['not an object', validLevel({ solution: 5 as unknown as LevelDef['solution'] })],
      ['negative hash', withSolution({ finalHash: -1 })],
      ['hash above 32 bits', withSolution({ finalHash: 2 ** 32 })],
      ['log not an array', withSolution({ log: {} as [] })],
      ['null command', withSolution({ log: [null as unknown as never] })],
      [
        'decreasing ticks',
        withSolution({
          log: [
            { kind: 'popAll', tick: 10 },
            { kind: 'popAll', tick: 5 },
          ],
        }),
      ],
      ['tick after the time limit', withSolution({ log: [{ kind: 'popAll', tick: 18001 }] })],
      ['float tick', withSolution({ log: [{ kind: 'popAll', tick: 1.5 }] })],
      ['unknown command', withSolution({ log: [{ kind: 'jump', tick: 1 } as unknown as never] })],
      [
        'creature id out of range',
        withSolution({ log: [{ kind: 'assign', tick: 1, creature: 10, skill: 'mason' }] }),
      ],
      [
        'unknown skill',
        withSolution({
          log: [{ kind: 'assign', tick: 1, creature: 0, skill: 'digger' as 'mason' }],
        }),
      ],
      ['release changes not an array', withSolution({ releaseChanges: null as unknown as [] })],
      ['null release change', withSolution({ releaseChanges: [null as unknown as never] })],
      ['release interval too slow', withSolution({ releaseChanges: [{ tick: 0, interval: 61 }] })],
      [
        'release interval faster than 4×',
        withSolution({ releaseChanges: [{ tick: 0, interval: 14 }] }),
      ],
      [
        'release ticks decreasing',
        withSolution({
          releaseChanges: [
            { tick: 50, interval: 20 },
            { tick: 40, interval: 20 },
          ],
        }),
      ],
      ['solution on a level with invalid timing', validLevel({ timeLimitTicks: 5 })],
    ];

    it.each(solutionCases)('reports %s', (_name, def) => {
      expect(codes(def)).toContain('solution');
    });

    it('accepts boundary values', () => {
      expect(
        codes(
          withSolution({
            log: [
              { kind: 'assign', tick: 0, creature: 9, skill: 'scaler' },
              { kind: 'assign', tick: 0, creature: 0, skill: 'glider' },
              { kind: 'popAll', tick: 18000 },
            ],
            releaseChanges: [
              { tick: 0, interval: 15 },
              { tick: 0, interval: 60 },
            ],
            finalHash: 0xffffffff,
          }),
        ),
      ).toEqual([]);
    });
  });

  it('assertValidLevel lists every problem', () => {
    expect(() => assertValidLevel(validLevel({ creatures: 0, objects: [] }))).toThrow(
      /creatures.*objects: the level needs an entrance/,
    );
  });
});
