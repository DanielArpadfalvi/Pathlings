import type { LevelObject } from '../../src/core/level';
import {
  type LevelSpec,
  METAL,
  ROCK,
  SOIL,
  cut,
  each,
  entrance,
  exitOn,
  lava,
  range,
  rect,
  sideWalls,
  stamp,
  water,
} from './build';

/**
 * World 3 – Clockworks (§1.3): traps (one victim, then 3 s to reload – send them in a burst),
 * teleporters, bounce pads (40 px up while drifting 20 px forward), several entrances and exits,
 * time pressure. Difficulty 5–9.
 */

const W = 320;
const FLOOR = 440;
const walls = sideWalls(W, 0, 480);
const floor = rect(SOIL, 0, FLOOR, W, 40);
const BIG = { w: 480, h: 720 };
const bigWalls = sideWalls(480, 0, 720);

/** Trap standing on the ground at `groundY`, its zone starting at x. */
function trapOn(x: number, groundY: number): LevelObject {
  return { type: 'trap', x, y: groundY - 10 };
}

/** Bounce pad lying on the ground at `groundY`, starting at x. */
function padOn(x: number, groundY: number): LevelObject {
  return { type: 'bounce', x, y: groundY - 4 };
}

/** Teleporter standing on the ground; creatures reappear with their feet at (tx, ty). */
function portal(x: number, groundY: number, tx: number, ty: number): LevelObject {
  return { type: 'teleport', x, y: groundY - 12, tx, ty };
}

export const W3: LevelSpec[] = [
  {
    index: 1,
    title: ['Tick Tock', 'Tik-tak'],
    hints: [
      [
        'The trap needs three seconds to reload. Send them through in a rush.',
        'A csapdának három másodperc kell az újratöltéshez. Küldd át őket egy rohamban.',
      ],
      ['The + button releases Pathlings faster.', 'A + gomb gyorsabban engedi ki a Pathlingeket.'],
    ],
    difficulty: 5,
    ops: [floor, stamp('gear', METAL, 40, 380), ...walls],
    objects: [entrance(40, 430), trapOn(180, FLOOR), exitOn(280, FLOOR)],
    creatures: 10,
    required: 9,
    skills: {},
    plan: [{ release: 15, when: { tick: 0 } }],
  },
  {
    index: 2,
    title: ['Portal', 'Átjáró'],
    hints: [
      [
        'The teleporter is behind the wall. Open the way.',
        'A teleport a fal mögött van. Nyisd meg az utat.',
      ],
    ],
    difficulty: 5,
    ops: [floor, rect(SOIL, 140, 360, 16, 80), rect(SOIL, 0, 200, 130, 16), ...walls],
    objects: [entrance(40, 430), portal(170, FLOOR, 30, 200), exitOn(100, 200)],
    creatures: 10,
    required: 9,
    skills: { burrower: 1 },
    plan: each('burrower', [0], { xGte: 132 }),
  },
  {
    index: 3,
    title: ['Springboard', 'Ugródeszka'],
    hints: [
      [
        'The pad flips them over the metal – the soil wall is your job.',
        'A párna átdobja őket a fémen – a földfal a te dolgod.',
      ],
    ],
    difficulty: 5,
    ops: [floor, rect(METAL, 116, 425, 4, 15), rect(SOIL, 200, 380, 16, 60), ...walls],
    objects: [entrance(40, 430), padOn(100, FLOOR), exitOn(280, FLOOR)],
    creatures: 10,
    required: 9,
    skills: { burrower: 1 },
    plan: each('burrower', [0], { xGte: 192 }),
  },
  {
    index: 4,
    title: ['Two Doors', 'Két ajtó'],
    hints: [
      [
        'Pathlings come from both sides. One hole is enough for everyone.',
        'Mindkét oldalról jönnek Pathlingek. Egy lyuk mindenkinek elég.',
      ],
    ],
    difficulty: 5,
    ops: [floor, rect(SOIL, 0, 380, W, 40), ...walls],
    objects: [entrance(60, 370, 1), entrance(260, 370, -1), exitOn(160, FLOOR)],
    creatures: 16,
    required: 14,
    skills: { delver: 1 },
    plan: each('delver', [0], { xGte: 140 }),
  },
  {
    index: 5,
    title: ['Grinder', 'Daráló'],
    hints: [
      [
        'Open the wall, then rush them past the trap.',
        'Nyisd meg a falat, aztán rohamban vidd át őket a csapdán.',
      ],
    ],
    difficulty: 6,
    ops: [floor, rect(ROCK, 120, 360, 16, 80), ...walls],
    objects: [entrance(40, 430), trapOn(220, FLOOR), exitOn(285, FLOOR)],
    creatures: 10,
    required: 8,
    skills: { burrower: 1 },
    plan: [{ release: 15, when: { tick: 0 } }, ...each('burrower', [0], { xGte: 112 })],
  },
  {
    index: 6,
    title: ['Relay', 'Váltó'],
    hints: [
      [
        'The portal takes them upstairs – the last step needs a Mason.',
        'Az átjáró felviszi őket – az utolsó lépcsőhöz Kőműves kell.',
      ],
    ],
    difficulty: 6,
    ops: [floor, rect(SOIL, 0, 260, 250, 10), rect(SOIL, 180, 250, 70, 10), ...walls],
    objects: [entrance(40, 430), portal(200, FLOOR, 40, 260), exitOn(230, 250)],
    creatures: 10,
    required: 9,
    skills: { mason: 1 },
    plan: each('mason', [0], { xGte: 158, yLte: 260 }),
  },
  {
    index: 7,
    title: ['Bounce House', 'Ugrálóvár'],
    hints: [
      [
        'The pads carry them up by themselves. Mind the trap at the top.',
        'A párnák maguktól felviszik őket. Vigyázz a csapdára fent.',
      ],
    ],
    difficulty: 6,
    ops: [floor, rect(SOIL, 124, 410, W - 124, 30), rect(SOIL, 216, 380, W - 216, 30), ...walls],
    objects: [
      entrance(40, 430),
      padOn(104, FLOOR),
      padOn(196, 410),
      trapOn(240, 380),
      exitOn(285, 380),
    ],
    creatures: 10,
    required: 9,
    skills: {},
    plan: [{ release: 15, when: { tick: 0 } }],
  },
  {
    index: 8,
    title: ['Three Exits', 'Három kijárat'],
    hints: [
      [
        'Three ways out. Pick the one that costs the least.',
        'Három kiút. Válaszd azt, amelyik a legkevesebbe kerül.',
      ],
    ],
    difficulty: 6,
    ops: [
      floor,
      rect(SOIL, 0, 380, W, 40),
      rect(METAL, 60, 330, 8, 50),
      rect(SOIL, 250, 340, 16, 40),
      ...walls,
    ],
    objects: [entrance(160, 370), exitOn(30, 380), exitOn(290, 380), exitOn(160, FLOOR)],
    creatures: 12,
    required: 10,
    skills: { delver: 1, burrower: 1 },
    plan: each('delver', [0], { xGte: 190 }),
  },
  {
    index: 9,
    title: ['Clock Tower', 'Óratorony'],
    hints: [
      [
        'Three pads, three floors, one trap at the very top.',
        'Három párna, három szint, egy csapda a legtetején.',
      ],
    ],
    difficulty: 7,
    ...BIG,
    ops: [
      rect(SOIL, 0, 680, 480, 40),
      rect(SOIL, 150, 650, 324, 30),
      rect(SOIL, 270, 620, 204, 30),
      rect(SOIL, 390, 590, 84, 30),
      stamp('gear', METAL, 60, 600),
      ...bigWalls,
    ],
    objects: [
      entrance(40, 670),
      padOn(130, 680),
      padOn(250, 650),
      padOn(370, 620),
      trapOn(410, 590),
      exitOn(450, 590),
    ],
    creatures: 15,
    required: 13,
    skills: {},
    plan: [{ release: 15, when: { tick: 0 } }],
  },
  {
    index: 10,
    title: ['Portal Pit', 'Átjáró-akna'],
    hints: [
      [
        'The teleporter hides under the floor. Dig down onto it.',
        'A teleport a padló alatt rejtőzik. Áss le rá.',
      ],
    ],
    difficulty: 7,
    ops: [
      floor,
      cut(150, FLOOR, 20, 20),
      rect(SOIL, 150, FLOOR, 20, 6),
      cut(180, FLOOR, 60, 40),
      ...walls,
    ],
    objects: [
      entrance(40, 430),
      portal(156, 460, 260, FLOOR),
      water(180, 452, 60, 28),
      exitOn(290, FLOOR),
    ],
    creatures: 10,
    required: 9,
    skills: { delver: 1, warden: 1 },
    plan: each('delver', [0], { xGte: 158 }),
  },
  {
    index: 11,
    title: ['Rush Hour', 'Csúcsforgalom'],
    hints: [
      [
        'Two doors, one trap, one rock wall. Open the wall, then send them all at once.',
        'Két ajtó, egy csapda, egy kőfal. Nyisd meg a falat, aztán küldd őket egyszerre.',
      ],
    ],
    difficulty: 7,
    ops: [floor, rect(ROCK, 200, 360, 16, 80), ...walls],
    objects: [entrance(40, 430, 1), entrance(120, 430, 1), trapOn(240, FLOOR), exitOn(290, FLOOR)],
    creatures: 16,
    required: 12,
    skills: { burrower: 1 },
    plan: [{ release: 15, when: { tick: 0 } }, ...each('burrower', [0], { xGte: 192 })],
  },
  {
    index: 12,
    title: ['Catapult', 'Katapult'],
    hints: [
      [
        'The pad clears the lava – but first you must reach it.',
        'A párna átdob a láván – de előbb el kell jutni hozzá.',
      ],
    ],
    difficulty: 8,
    ops: [
      floor,
      rect(SOIL, 70, 360, 16, 80),
      cut(112, FLOOR, 8, 40),
      rect(SOIL, 220, 380, 16, 60),
      ...walls,
    ],
    objects: [entrance(30, 430), padOn(100, FLOOR), lava(112, 450, 8, 30), exitOn(285, FLOOR)],
    creatures: 10,
    required: 9,
    skills: { burrower: 2 },
    plan: [...each('burrower', [0], { xGte: 62 }), ...each('burrower', [0], { xGte: 212 })],
  },
  {
    index: 13,
    title: ['Gatekeeper', 'Kapuőr'],
    hints: [
      [
        'Hold them back until everyone is out – then let the crowd rush the trap.',
        'Tartsd vissza őket, amíg mindenki kijön – aztán a tömeg rohanja meg a csapdát.',
      ],
      [
        'A Popper on the Warden opens the gate; metal keeps the floor intact.',
        'Egy Pukkancs az Őrön megnyitja a kaput; a fém épen tartja a padlót.',
      ],
    ],
    difficulty: 8,
    ops: [floor, rect(METAL, 120, FLOOR, 40, 6), rect(METAL, 70, 400, 6, 40), ...walls],
    objects: [entrance(100, 430), trapOn(220, FLOOR), exitOn(285, FLOOR)],
    creatures: 10,
    required: 7,
    skills: { warden: 1, popper: 1 },
    minReleaseTicks: 90,
    plan: [
      ...each('warden', [0], { xGte: 140 }),
      { release: 23, when: { tick: 0 } },
      { assign: 'popper', creature: 0, when: { tick: 300, state: 'warden' } },
    ],
  },
  {
    index: 14,
    title: ['Hall of Doors', 'Ajtók csarnoka'],
    hints: [['Each portal is guarded by something different.', 'Minden átjárót más őriz.']],
    difficulty: 8,
    ...BIG,
    ops: [
      rect(SOIL, 0, 680, 480, 40),
      rect(SOIL, 120, 600, 16, 80),
      rect(SOIL, 0, 400, 480, 30),
      rect(SOIL, 0, 230, 480, 30),
      rect(SOIL, 300, 220, 174, 10),
      ...bigWalls,
    ],
    objects: [
      entrance(40, 670),
      portal(200, 680, 40, 400),
      exitOn(420, 220),
      { type: 'teleport', x: 396, y: 448, tx: 40, ty: 230 },
    ],
    creatures: 15,
    required: 13,
    skills: { burrower: 1, delver: 1, mason: 1 },
    plan: [
      ...each('burrower', [0], { xGte: 112 }),
      ...each('delver', [0], { xGte: 401, yLte: 400, yGte: 400 }),
      ...each('mason', [0], { xGte: 278, yLte: 230 }),
    ],
  },
  {
    index: 15,
    title: ['Pinball', 'Flipper'],
    hints: [
      [
        'Pads, pads and a trap. And a wall that only a Burrower opens.',
        'Párnák, párnák és egy csapda. Meg egy fal, amit csak a Fúró nyit ki.',
      ],
    ],
    difficulty: 8,
    ops: [
      floor,
      rect(SOIL, 124, 410, W - 124, 30),
      rect(SOIL, 216, 380, W - 216, 30),
      rect(ROCK, 224, 330, 12, 50),
      ...walls,
    ],
    objects: [
      entrance(40, 430),
      padOn(104, FLOOR),
      padOn(196, 410),
      trapOn(248, 380),
      exitOn(295, 380),
    ],
    creatures: 10,
    required: 8,
    skills: { burrower: 1 },
    plan: [{ release: 15, when: { tick: 0 } }, ...each('burrower', [0], { xGte: 216, yLte: 380 })],
  },
  {
    index: 16,
    title: ['Overtime', 'Hosszabbítás'],
    hints: [['Two rock walls and very little time.', 'Két kőfal és nagyon kevés idő.']],
    difficulty: 9,
    ops: [floor, rect(ROCK, 100, 360, 24, 80), rect(ROCK, 200, 360, 24, 80), ...walls],
    objects: [entrance(40, 430), trapOn(250, FLOOR), exitOn(290, FLOOR)],
    creatures: 10,
    required: 6,
    skills: { burrower: 2 },
    timeLimitSeconds: 120,
    plan: [
      { release: 15, when: { tick: 0 } },
      ...each('burrower', [0], { xGte: 92 }),
      ...each('burrower', [0], { xGte: 192 }),
    ],
  },
  {
    index: 17,
    title: ['Vertical Express', 'Függőleges expressz'],
    hints: [
      [
        'The portal lifts them to the top. The way down is yours to dig.',
        'Az átjáró a tetejére viszi őket. Lefelé neked kell utat ásnod.',
      ],
    ],
    difficulty: 9,
    ...BIG,
    ops: [
      rect(SOIL, 0, 650, 480, 70),
      rect(METAL, 120, 360, 8, 290),
      rect(SOIL, 128, 400, 346, 30),
      rect(SOIL, 128, 460, 346, 30),
      rect(SOIL, 128, 520, 346, 30),
      rect(ROCK, 128, 580, 346, 30),
      ...bigWalls,
    ],
    objects: [entrance(40, 640), portal(90, 650, 160, 400), exitOn(440, 650)],
    creatures: 15,
    required: 13,
    skills: { delver: 3, sloper: 1 },
    plan: [
      ...each('delver', [0], { xGte: 200 }),
      ...each('delver', [0], { xGte: 240, yGte: 460 }),
      ...each('delver', [0], { xGte: 280, yGte: 520 }),
      ...each('sloper', [0], { xGte: 320, yGte: 580 }),
    ],
  },
  {
    index: 18,
    title: ['Twin Towers', 'Ikertornyok'],
    hints: [
      [
        'Pathlings on two towers. Get them down without a fall.',
        'Pathlingek két tornyon. Hozd le őket zuhanás nélkül.',
      ],
    ],
    difficulty: 9,
    ops: [floor, rect(ROCK, 6, 300, 90, 140), rect(ROCK, 224, 300, 90, 140), ...walls],
    objects: [entrance(40, 290, 1), entrance(280, 290, -1), exitOn(160, FLOOR)],
    creatures: 16,
    required: 14,
    skills: { glider: 16 },
    minReleaseTicks: 40,
    plan: each('glider', range(16)),
  },
  {
    index: 19,
    title: ['Machine Room', 'Gépterem'],
    hints: [
      [
        'Pad, portal, trap – and a Warden to keep order.',
        'Párna, átjáró, csapda – és egy Őr a rendért.',
      ],
    ],
    difficulty: 9,
    ops: [
      floor,
      rect(METAL, 116, 425, 4, 15),
      rect(SOIL, 0, 260, 200, 10),
      rect(METAL, 196, 230, 4, 30),
      cut(6, FLOOR, 40, 40),
      ...walls,
    ],
    objects: [
      entrance(80, 430, -1),
      padOn(100, FLOOR),
      portal(260, FLOOR, 180, 260),
      lava(6, 452, 40, 28),
      trapOn(120, 260),
      exitOn(40, 260),
    ],
    creatures: 10,
    required: 7,
    skills: { warden: 1 },
    plan: [
      ...each('warden', [0], { xLte: 60 }),
      { release: 15, when: { tick: 200 } },
      { popAll: true, when: { tick: 3000 } },
    ],
  },
  {
    index: 20,
    title: ['Grand Clock', 'A nagy óra'],
    hints: [
      [
        'Everything at once: walls, portals, pads and traps.',
        'Minden egyszerre: falak, átjárók, párnák és csapdák.',
      ],
    ],
    difficulty: 9,
    ...BIG,
    ops: [
      rect(SOIL, 0, 680, 480, 40),
      rect(ROCK, 140, 600, 16, 80),
      rect(SOIL, 0, 380, 480, 30),
      rect(SOIL, 290, 350, 184, 30),
      rect(SOIL, 0, 230, 480, 20),
      stamp('gear', METAL, 220, 640),
      ...bigWalls,
    ],
    objects: [
      entrance(40, 670),
      portal(240, 680, 40, 380),
      padOn(270, 380),
      trapOn(330, 350),
      exitOn(430, 350),
    ],
    creatures: 15,
    required: 13,
    skills: { burrower: 1 },
    plan: [{ release: 15, when: { tick: 0 } }, ...each('burrower', [0], { xGte: 132 })],
  },
];
