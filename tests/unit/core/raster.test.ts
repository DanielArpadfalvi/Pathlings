import { describe, expect, it } from 'vitest';
import { hashHex } from '../../../src/core/hash';
import {
  BRUSH_RADII,
  MAX_OPS,
  type RasterOp,
  applyOp,
  bresenham,
  rasterize,
  validateOp,
} from '../../../src/core/raster';
import { STAMPS, stampSize } from '../../../src/core/stamps';
import {
  AIR,
  METAL,
  ROCK,
  SOIL,
  createTerrain,
  fillRect,
  hashTerrain,
  isMaterial,
  terrainToRows,
} from '../../../src/core/terrain';

const rows = (w: number, h: number, ops: RasterOp[]): string[] =>
  terrainToRows(rasterize(w, h, ops));
const hashOf = (w: number, h: number, ops: RasterOp[]): string =>
  hashHex(hashTerrain(rasterize(w, h, ops)));

describe('rasterizer shapes', () => {
  it('rect fills [x, x+w) × [y, y+h), clipped', () => {
    expect(rows(5, 3, [{ op: 'rect', m: ROCK, x: 1, y: 1, w: 3, h: 5 }])).toEqual([
      '.....',
      '.222.',
      '.222.',
    ]);
  });

  it('circle is a disc of diameter 2r + 1', () => {
    expect(rows(5, 5, [{ op: 'circle', m: SOIL, x: 2, y: 2, r: 1 }])).toEqual([
      '.....',
      '.111.',
      '.111.',
      '.111.',
      '.....',
    ]);
    expect(rows(3, 3, [{ op: 'circle', m: SOIL, x: 1, y: 1, r: 0 }])).toEqual([
      '...',
      '.1.',
      '...',
    ]);
  });

  it('ramp rises to the given side, last row full width', () => {
    expect(rows(4, 4, [{ op: 'ramp', m: SOIL, x: 0, y: 0, w: 4, h: 4, rise: 'right' }])).toEqual([
      '...1',
      '..11',
      '.111',
      '1111',
    ]);
    expect(rows(6, 2, [{ op: 'ramp', m: SOIL, x: 0, y: 0, w: 6, h: 2, rise: 'left' }])).toEqual([
      '111...',
      '111111',
    ]);
    expect(rows(3, 2, [{ op: 'ramp', m: SOIL, x: 0, y: -1, w: 3, h: 3, rise: 'left' }])).toEqual([
      '11.',
      '111',
    ]);
  });

  it('polygon on cell corners matches the equivalent rect', () => {
    const poly = rasterize(8, 8, [{ op: 'poly', m: SOIL, pts: [1, 1, 5, 1, 5, 4, 1, 4] }]);
    const rect = rasterize(8, 8, [{ op: 'rect', m: SOIL, x: 1, y: 1, w: 4, h: 3 }]);
    expect(terrainToRows(poly)).toEqual(terrainToRows(rect));
  });

  it('polygon triangle uses pixel-centre sampling', () => {
    expect(rows(4, 4, [{ op: 'poly', m: SOIL, pts: [0, 0, 4, 4, 0, 4] }])).toEqual([
      '....',
      '1...',
      '11..',
      '111.',
    ]);
  });

  it('self-intersecting polygon uses the even-odd rule', () => {
    // Bow-tie: two triangles meeting in the middle.
    expect(rows(6, 4, [{ op: 'poly', m: SOIL, pts: [0, 0, 6, 4, 6, 0, 0, 4] }])).toEqual([
      '1....1',
      '11..11',
      '11..11',
      '1....1',
    ]);
  });

  it('polygon fully outside the level is a no-op', () => {
    const t = createTerrain(4, 4);
    expect(applyOp(t, { op: 'poly', m: SOIL, pts: [10, 10, 20, 10, 20, 20] })).toBeNull();
  });

  it('brush stroke stamps discs along a Bresenham line', () => {
    const r = rows(12, 5, [{ op: 'brush', m: SOIL, size: 0, pts: [2, 2, 9, 2] }]);
    expect(BRUSH_RADII[0]).toBe(2);
    expect(r).toEqual([
      '.1111111111.',
      '111111111111',
      '111111111111',
      '111111111111',
      '.1111111111.',
    ]);
    expect(rows(5, 5, [{ op: 'brush', m: METAL, size: 0, pts: [2, 2] }])).toEqual([
      '.333.',
      '33333',
      '33333',
      '33333',
      '.333.',
    ]);
  });

  it('multi-segment strokes, all three brush sizes', () => {
    for (const size of [0, 1, 2] as const) {
      const t = rasterize(64, 64, [{ op: 'brush', m: SOIL, size, pts: [10, 10, 30, 30, 50, 10] }]);
      const r = BRUSH_RADII[size];
      expect(t.cells[30 * 64 + 30]).toBe(SOIL);
      expect(t.cells[(30 + r) * 64 + 30]).toBe(SOIL);
      expect(t.cells[(30 + r + 1) * 64 + 30]).toBe(AIR);
    }
  });

  it('eraser removes every material (including metal)', () => {
    expect(
      rows(5, 1, [
        { op: 'rect', m: METAL, x: 0, y: 0, w: 5, h: 1 },
        { op: 'erase', size: 0, pts: [0, 0] },
      ]),
    ).toEqual(['...33']);
  });

  it('stamps place data-defined shapes, with flip and fixed materials', () => {
    const lib = { step: { rows: ['#..', '##0', '.3#'] } };
    const t = createTerrain(4, 3);
    fillRect(t, 0, 0, 4, 3, ROCK);
    applyOp(t, { op: 'stamp', id: 'step', m: SOIL, x: 1, y: 0 }, lib);
    expect(terrainToRows(t)).toEqual(['2122', '211.', '2231']);
    const f = rasterize(3, 3, [{ op: 'stamp', id: 'step', m: SOIL, x: 0, y: 0, flip: true }], lib);
    expect(terrainToRows(f)).toEqual(['..1', '.11', '13.']);
    const clipped = rasterize(2, 2, [{ op: 'stamp', id: 'step', m: SOIL, x: -1, y: -1 }], lib);
    expect(terrainToRows(clipped)).toEqual(['1.', '31']);
  });

  it('built-in stamps are rectangular and use only valid characters', () => {
    expect(Object.keys(STAMPS).length).toBeGreaterThanOrEqual(6);
    for (const [id, def] of Object.entries(STAMPS)) {
      const { w, h } = stampSize(def);
      expect(w, id).toBeGreaterThan(0);
      expect(h, id).toBeGreaterThan(0);
      for (const row of def.rows) {
        expect(row.length, id).toBe(w);
        for (const ch of row)
          expect(ch === '.' || ch === '#' || isMaterial(ch.charCodeAt(0) - 48), id).toBe(true);
      }
    }
    expect(stampSize({ rows: [] })).toEqual({ w: 0, h: 0 });
  });

  it('later ops overwrite earlier ones; m = air cuts', () => {
    expect(
      rows(5, 1, [
        { op: 'rect', m: SOIL, x: 0, y: 0, w: 5, h: 1 },
        { op: 'rect', m: AIR, x: 1, y: 0, w: 2, h: 1 },
        { op: 'rect', m: ROCK, x: 4, y: 0, w: 1, h: 1 },
      ]),
    ).toEqual(['1..12']);
  });

  it('applyOp returns the clipped area it touched', () => {
    const t = createTerrain(10, 10);
    expect(applyOp(t, { op: 'rect', m: SOIL, x: 8, y: -2, w: 5, h: 5 })).toEqual({
      x: 8,
      y: 0,
      w: 2,
      h: 3,
    });
    expect(applyOp(t, { op: 'ramp', m: SOIL, x: 20, y: 0, w: 2, h: 2, rise: 'left' })).toBeNull();
    expect(applyOp(t, { op: 'stamp', id: 'boulder', m: SOIL, x: 0, y: 0 })).toEqual({
      x: 0,
      y: 0,
      w: 10,
      h: 7,
    });
    expect(applyOp(t, { op: 'brush', m: SOIL, size: 0, pts: [0, 0, 1, 0] })).toEqual({
      x: 0,
      y: 0,
      w: 4,
      h: 3,
    });
  });

  it('bresenham covers both endpoints in every octant', () => {
    for (const [x1, y1] of [
      [5, 2],
      [-5, 2],
      [2, -5],
      [-2, -5],
      [0, 0],
      [0, 4],
    ]) {
      const pts: [number, number][] = [];
      bresenham(0, 0, x1 as number, y1 as number, (x, y) => pts.push([x, y]));
      expect(pts[0]).toEqual([0, 0]);
      expect(pts[pts.length - 1]).toEqual([x1, y1]);
      expect(pts.length).toBe(Math.max(Math.abs(x1 as number), Math.abs(y1 as number)) + 1);
    }
  });
});

describe('op validation (no float ever reaches the cells)', () => {
  const bad: [string, unknown][] = [
    ['float rect x', { op: 'rect', m: SOIL, x: 1.5, y: 0, w: 2, h: 2 }],
    ['float rect w', { op: 'rect', m: SOIL, x: 1, y: 0, w: 2.25, h: 2 }],
    ['zero size', { op: 'rect', m: SOIL, x: 1, y: 0, w: 0, h: 2 }],
    ['bad material', { op: 'rect', m: 7, x: 1, y: 0, w: 2, h: 2 }],
    ['float material', { op: 'rect', m: 1.5, x: 1, y: 0, w: 2, h: 2 }],
    ['far position', { op: 'rect', m: SOIL, x: 99999, y: 0, w: 2, h: 2 }],
    ['float radius', { op: 'circle', m: SOIL, x: 1, y: 1, r: 2.5 }],
    ['float circle centre', { op: 'circle', m: SOIL, x: 1.1, y: 1, r: 2 }],
    ['negative radius', { op: 'circle', m: SOIL, x: 1, y: 1, r: -1 }],
    ['bad rise', { op: 'ramp', m: SOIL, x: 0, y: 0, w: 2, h: 2, rise: 'up' }],
    ['float ramp pos', { op: 'ramp', m: SOIL, x: 0.5, y: 0, w: 2, h: 2, rise: 'left' }],
    ['float ramp size', { op: 'ramp', m: SOIL, x: 0, y: 0, w: 2, h: 0.5, rise: 'left' }],
    ['poly too few points', { op: 'poly', m: SOIL, pts: [0, 0, 1, 1] }],
    ['poly odd coords', { op: 'poly', m: SOIL, pts: [0, 0, 1, 1, 2] }],
    ['poly float', { op: 'poly', m: SOIL, pts: [0, 0, 1.5, 1, 2, 0] }],
    ['poly not array', { op: 'poly', m: SOIL, pts: 'x' }],
    ['brush size', { op: 'brush', m: SOIL, size: 3, pts: [0, 0] }],
    ['brush no points', { op: 'brush', m: SOIL, size: 0, pts: [] }],
    ['erase float', { op: 'erase', size: 1, pts: [0, 0.5] }],
    ['unknown stamp', { op: 'stamp', id: 'nope', m: SOIL, x: 0, y: 0 }],
    ['inherited stamp key', { op: 'stamp', id: 'toString', m: SOIL, x: 0, y: 0 }],
    ['float stamp pos', { op: 'stamp', id: 'boulder', m: SOIL, x: 0, y: 0.5 }],
    ['bad flip', { op: 'stamp', id: 'boulder', m: SOIL, x: 0, y: 0, flip: 1 }],
    ['unknown op', { op: 'blob', m: SOIL }],
    ['not an object', null],
  ];

  it.each(bad)('rejects %s', (_name, op) => {
    expect(validateOp(op as RasterOp)).not.toBeNull();
    expect(() => applyOp(createTerrain(8, 8), op as RasterOp)).toThrow(RangeError);
  });

  it('accepts valid ops', () => {
    const ok: RasterOp[] = [
      { op: 'rect', m: AIR, x: -10, y: -10, w: 1, h: 1 },
      { op: 'circle', m: METAL, x: 0, y: 0, r: 0 },
      { op: 'ramp', m: SOIL, x: 0, y: 0, w: 3, h: 5, rise: 'left' },
      { op: 'poly', m: SOIL, pts: [0, 0, 1, 0, 1, 1] },
      { op: 'brush', m: SOIL, size: 2, pts: [0, 0] },
      { op: 'erase', size: 1, pts: [0, 0, 5, 5] },
      { op: 'stamp', id: 'gear', m: ROCK, x: 3, y: 3, flip: false },
    ];
    for (const op of ok) expect(validateOp(op)).toBeNull();
  });

  it('rasterize enforces the op limit', () => {
    const op: RasterOp = { op: 'rect', m: SOIL, x: 0, y: 0, w: 1, h: 1 };
    expect(() => rasterize(4, 4, new Array<RasterOp>(MAX_OPS + 1).fill(op))).toThrow(RangeError);
    expect(() => rasterize(4, 4, new Array<RasterOp>(MAX_OPS).fill(op))).not.toThrow();
  });
});

describe('rasterizer golden hashes', () => {
  const base: RasterOp[] = [{ op: 'rect', m: SOIL, x: 0, y: 400, w: 320, h: 80 }];
  const cases: [string, RasterOp[]][] = [
    ['empty', []],
    ['floor', base],
    [
      'floor + rock rect + metal block',
      [
        ...base,
        { op: 'rect', m: ROCK, x: 100, y: 300, w: 40, h: 100 },
        { op: 'rect', m: METAL, x: 200, y: 380, w: 16, h: 20 },
      ],
    ],
    [
      'circles',
      [
        { op: 'circle', m: SOIL, x: 160, y: 240, r: 50 },
        { op: 'circle', m: AIR, x: 170, y: 230, r: 20 },
        { op: 'circle', m: ROCK, x: 0, y: 0, r: 33 },
      ],
    ],
    [
      'ramps',
      [
        ...base,
        { op: 'ramp', m: SOIL, x: 20, y: 340, w: 90, h: 60, rise: 'right' },
        { op: 'ramp', m: ROCK, x: 210, y: 350, w: 37, h: 50, rise: 'left' },
      ],
    ],
    [
      'polygon hexagon',
      [{ op: 'poly', m: SOIL, pts: [100, 100, 160, 70, 220, 100, 220, 170, 160, 200, 100, 170] }],
    ],
    [
      'polygon concave + clipped',
      [{ op: 'poly', m: ROCK, pts: [-20, 10, 340, 30, 150, 90, 300, 300, -5, 250] }],
    ],
    [
      'brush strokes 3 sizes',
      [
        { op: 'brush', m: SOIL, size: 0, pts: [10, 10, 80, 47, 120, 12] },
        { op: 'brush', m: ROCK, size: 1, pts: [30, 200, 290, 260] },
        { op: 'brush', m: SOIL, size: 2, pts: [300, 470, 250, 300, 160, 460] },
      ],
    ],
    [
      'eraser through floor',
      [...base, { op: 'erase', size: 2, pts: [40, 390, 120, 470, 200, 395] }],
    ],
    [
      'stamps',
      [
        ...base,
        { op: 'stamp', id: 'boulder', m: ROCK, x: 50, y: 393 },
        { op: 'stamp', id: 'pillar', m: SOIL, x: 120, y: 392 },
        { op: 'stamp', id: 'arch', m: SOIL, x: 180, y: 394, flip: true },
        { op: 'stamp', id: 'gear', m: SOIL, x: 300, y: 100 },
        { op: 'stamp', id: 'crystal', m: 6, x: 10, y: 10 },
        { op: 'stamp', id: 'ledge', m: 4, x: 316, y: 476 },
      ],
    ],
    [
      'all materials',
      [0, 1, 2, 3, 4, 5, 6].map((m, i) => ({
        op: 'rect',
        m: m as 0,
        x: i * 40,
        y: 100 + i * 7,
        w: 40,
        h: 30,
      })),
    ],
    [
      'mixed level',
      [
        ...base,
        { op: 'rect', m: METAL, x: 0, y: 0, w: 8, h: 480 },
        { op: 'ramp', m: SOIL, x: 30, y: 200, w: 60, h: 30, rise: 'left' },
        { op: 'poly', m: 5, pts: [150, 250, 170, 250, 170, 400, 150, 400] },
        { op: 'circle', m: 6, x: 260, y: 250, r: 15 },
        { op: 'brush', m: AIR, size: 1, pts: [255, 250, 265, 250] },
        { op: 'stamp', id: 'boulder', m: SOIL, x: 280, y: 393, flip: true },
        { op: 'erase', size: 0, pts: [100, 405] },
      ],
    ],
    [
      'large 640x960 level',
      [
        { op: 'rect', m: SOIL, x: 0, y: 900, w: 640, h: 60 },
        { op: 'circle', m: ROCK, x: 320, y: 480, r: 200 },
        { op: 'poly', m: AIR, pts: [320, 300, 450, 600, 190, 600] },
      ],
    ],
  ];

  const golden: Record<string, string> = {};
  for (const [name, ops] of cases) {
    const [w, h] = name.startsWith('large') ? [640, 960] : [320, 480];
    golden[name] = hashOf(w, h, ops);
  }

  it('has at least 12 op combinations, all distinct', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
    expect(new Set(Object.values(golden)).size).toBe(cases.length);
  });

  it('same ops list ⇒ identical mask hash (repeat runs, cloned op lists)', () => {
    for (const [name, ops] of cases) {
      const [w, h] = name.startsWith('large') ? [640, 960] : [320, 480];
      const copy = JSON.parse(JSON.stringify(ops)) as RasterOp[];
      expect(hashOf(w, h, copy), name).toBe(golden[name]);
      expect(hashOf(w, h, ops), name).toBe(golden[name]);
    }
  });

  it('matches the pinned golden hashes (changing these requires a SIM_VERSION bump)', () => {
    expect(golden).toMatchInlineSnapshot(`
      {
        "all materials": "469dec35",
        "brush strokes 3 sizes": "e04b95ab",
        "circles": "dd133a0d",
        "empty": "e3febda5",
        "eraser through floor": "d761fb94",
        "floor": "0029a1a5",
        "floor + rock rect + metal block": "85233c65",
        "large 640x960 level": "0e0408e8",
        "mixed level": "e888ce2c",
        "polygon concave + clipped": "5047446f",
        "polygon hexagon": "9363ebe5",
        "ramps": "2a7510a3",
        "stamps": "942e9e1f",
      }
    `);
  });
});
