import {
  type LevelSpec,
  METAL,
  ROCK,
  SOIL,
  cut,
  each,
  entrance,
  exitOn,
  range,
  rect,
  sideWalls,
  water,
} from './build';

/**
 * World 1 – Mossy Glade (§1.3): the teaching world. Levels 1–8 introduce one skill each
 * (Delver, Mason, Burrower, Warden, Scaler, Glider, Sloper, Popper) with the tutorial
 * (`src/levels/tutorial.ts`); 9–20 combine them and add water. 320 × 480, floor at y = 440.
 */

const W = 320;
const FLOOR = 440;
const walls = sideWalls(W, 0, 480);
const floor = rect(SOIL, 0, FLOOR, W, 40);

export const W1: LevelSpec[] = [
  {
    index: 1,
    title: ['Down the Hatch', 'Le a lyukon'],
    hints: [
      [
        'Give the Delver to a Pathling on the platform: it digs straight down.',
        'Adj Ásót egy Pathlingnek a polcon: egyenesen lefelé ás.',
      ],
    ],
    difficulty: 1,
    ops: [floor, rect(SOIL, 0, 380, W, 40), ...walls],
    objects: [entrance(60, 370), exitOn(270, FLOOR)],
    creatures: 10,
    required: 7,
    skills: { delver: 2 },
    plan: each('delver', [0], { xGte: 150 }),
  },
  {
    index: 2,
    title: ['Stairway', 'Lépcső'],
    hints: [
      [
        'A Mason builds a rising staircase – start it a little before the ledge.',
        'A Kőműves emelkedő lépcsőt épít – kezdd kicsivel a párkány előtt.',
      ],
    ],
    difficulty: 1,
    ops: [floor, rect(SOIL, 200, 430, W - 200, 10), ...walls],
    objects: [entrance(40, 430), exitOn(280, 430)],
    creatures: 10,
    required: 8,
    skills: { mason: 2 },
    plan: each('mason', [0], { xGte: 178 }),
  },
  {
    index: 3,
    title: ['Through the Wall', 'Át a falon'],
    hints: [
      ['A Burrower digs sideways when it meets a wall.', 'A Fúró oldalra ás, amikor falhoz ér.'],
    ],
    difficulty: 1,
    ops: [floor, rect(SOIL, 150, 360, 20, 80), ...walls],
    objects: [entrance(40, 430), exitOn(280, FLOOR)],
    creatures: 10,
    required: 9,
    skills: { burrower: 2 },
    plan: each('burrower', [0], { xGte: 142 }),
  },
  {
    index: 4,
    title: ['Stop Right There', 'Állj!'],
    hints: [
      ['A Warden turns everyone who walks into it.', 'Az Őr mindenkit visszafordít, aki nekimegy.'],
    ],
    difficulty: 1,
    ops: [floor, cut(230, FLOOR, 60, 40), ...walls],
    objects: [entrance(160, 430), exitOn(40, FLOOR), water(230, 452, 60, 28)],
    creatures: 10,
    required: 9,
    skills: { warden: 2 },
    // The Warden stays behind: pop everyone once the others are home to end the level.
    plan: [...each('warden', [0], { xGte: 200 }), { popAll: true, when: { tick: 1500 } }],
  },
  {
    index: 5,
    title: ['Up and Over', 'Fel és át'],
    hints: [
      [
        'Scalers climb walls – and stay Scalers for good.',
        'A Mászók falat másznak – és azok is maradnak.',
      ],
    ],
    difficulty: 2,
    ops: [floor, rect(ROCK, 140, 390, 60, 50), ...walls],
    objects: [entrance(40, 430), exitOn(280, FLOOR)],
    creatures: 10,
    required: 8,
    skills: { scaler: 10 },
    minReleaseTicks: 50,
    plan: each('scaler', range(10)),
  },
  {
    index: 6,
    title: ['Leap of Faith', 'Bátor ugrás'],
    hints: [
      [
        'A Glider opens a leaf and floats down safely from any height.',
        'A Vitorlázó levelet nyit, és bármilyen magasról épen leér.',
      ],
    ],
    difficulty: 2,
    ops: [floor, rect(SOIL, 0, 200, 120, 16), ...walls],
    objects: [entrance(40, 190), exitOn(260, FLOOR)],
    creatures: 10,
    required: 8,
    skills: { glider: 10 },
    minReleaseTicks: 50,
    plan: each('glider', range(10)),
  },
  {
    index: 7,
    title: ['Slope Down', 'Lejtőn le'],
    hints: [
      [
        'A Sloper digs diagonally down – the others follow its tunnel.',
        'A Csákányos átlósan lefelé ás – a többiek követik az alagútban.',
      ],
    ],
    difficulty: 2,
    ops: [floor, rect(SOIL, 0, 360, W, 50), ...walls],
    objects: [entrance(40, 350), exitOn(280, FLOOR)],
    creatures: 10,
    required: 8,
    skills: { sloper: 2 },
    plan: each('sloper', [0], { xGte: 80 }),
  },
  {
    index: 8,
    title: ['Pop Goes the Floor', 'Durr, és nincs padló'],
    hints: [
      [
        'A Popper counts down five seconds, then blasts a crater – but is lost.',
        'A Pukkancs öt másodpercet számol, aztán krátert robbant – de elvész.',
      ],
    ],
    difficulty: 2,
    ops: [floor, rect(SOIL, 0, 380, W, 6), ...walls],
    objects: [entrance(160, 370), exitOn(60, FLOOR)],
    creatures: 10,
    required: 8,
    skills: { popper: 1 },
    plan: each('popper', [0]),
  },
  {
    index: 9,
    title: ['Two Steps', 'Két lépés'],
    hints: [
      [
        'Dig down first – then deal with the wall below.',
        'Előbb áss le – aztán jöhet a lenti fal.',
      ],
    ],
    difficulty: 2,
    ops: [
      floor,
      rect(SOIL, 0, 380, W, 40),
      rect(METAL, 180, 340, 12, 40),
      rect(SOIL, 220, 420, 16, 20),
      ...walls,
    ],
    objects: [entrance(40, 370), exitOn(280, FLOOR)],
    creatures: 10,
    required: 8,
    skills: { delver: 1, burrower: 1 },
    plan: [
      ...each('delver', [0], { xGte: 100 }),
      ...each('burrower', [0], { xGte: 212, yGte: FLOOR }),
    ],
  },
  {
    index: 10,
    title: ['Splash Zone', 'Csobbanás'],
    hints: [['Water is deadly. Tunnel underneath it.', 'A víz halálos. Fúrj alatta.']],
    difficulty: 2,
    ops: [floor, rect(SOIL, 0, 360, W, 60), cut(150, 360, 60, 20), ...walls],
    objects: [entrance(40, 350), exitOn(280, FLOOR), water(150, 362, 60, 18)],
    creatures: 10,
    required: 8,
    skills: { sloper: 1 },
    plan: each('sloper', [0], { xGte: 90 }),
  },
  {
    index: 11,
    title: ['Higher Ground', 'Magaslat'],
    hints: [
      [
        'One Mason can build twice: once per ledge.',
        'Egy Kőműves kétszer is építhet: párkányonként egyszer.',
      ],
    ],
    difficulty: 3,
    ops: [floor, rect(SOIL, 160, 430, W - 160, 10), rect(SOIL, 240, 420, W - 240, 10), ...walls],
    objects: [entrance(40, 430), exitOn(290, 420)],
    creatures: 10,
    required: 8,
    skills: { mason: 2 },
    plan: [...each('mason', [0], { xGte: 138 }), ...each('mason', [0], { xGte: 218, yLte: 430 })],
  },
  {
    index: 12,
    title: ['Deep Dig', 'Mély ásás'],
    hints: [
      [
        'Rock takes twice as long to dig. Be patient.',
        'A kő ásása kétszer annyi ideig tart. Légy türelmes.',
      ],
    ],
    difficulty: 3,
    ops: [floor, rect(SOIL, 0, 340, W, 40), rect(ROCK, 0, 400, W, 20), ...walls],
    objects: [entrance(40, 330), exitOn(280, FLOOR)],
    creatures: 10,
    required: 8,
    skills: { delver: 2 },
    // The second shaft must not continue the first one: dig it a little further on.
    plan: [...each('delver', [0], { xGte: 100 }), ...each('delver', [0], { yGte: 400, xGte: 140 })],
  },
  {
    index: 13,
    title: ['Soft Landing', 'Puha landolás'],
    hints: [
      [
        'Everyone needs a leaf – and somebody has to open the wall.',
        'Mindenkinek kell levél – és valakinek ki kell nyitnia a falat.',
      ],
    ],
    difficulty: 3,
    ops: [floor, rect(SOIL, 0, 200, 120, 16), rect(SOIL, 200, 380, 20, 60), ...walls],
    objects: [entrance(40, 190), exitOn(280, FLOOR)],
    creatures: 10,
    required: 8,
    skills: { glider: 10, burrower: 1 },
    minReleaseTicks: 50,
    plan: [...each('glider', range(10)), ...each('burrower', [0], { xGte: 192, yGte: FLOOR })],
  },
  {
    index: 14,
    title: ['All-Rounders', 'Mindenesek'],
    hints: [
      [
        'Climb the tower, then float down the far side: Scaler and Glider together.',
        'Mássz fel a toronyra, aztán vitorlázz le a túloldalon: Mászó és Vitorlázó együtt.',
      ],
    ],
    difficulty: 4,
    ops: [floor, rect(ROCK, 150, 320, 24, 120), ...walls],
    objects: [entrance(40, 430), exitOn(280, FLOOR)],
    creatures: 10,
    required: 7,
    skills: { scaler: 10, glider: 10 },
    minReleaseTicks: 50,
    plan: range(10).flatMap((i) => [
      { assign: 'scaler' as const, creature: i, when: { state: 'walk' as const } },
      { assign: 'glider' as const, creature: i, when: { state: 'walk' as const } },
    ]),
  },
  {
    index: 15,
    title: ['Wrong Way', 'Rossz irány'],
    hints: [
      [
        'They start off towards the water. Turn them, then dig.',
        'A víz felé indulnak. Fordítsd vissza őket, aztán áss.',
      ],
    ],
    difficulty: 4,
    ops: [
      floor,
      rect(SOIL, 60, 380, W - 60, 40),
      cut(6, FLOOR, 54, 40),
      rect(METAL, 60, 420, 6, 20),
      ...walls,
    ],
    objects: [entrance(150, 370, -1), exitOn(270, FLOOR), water(6, 452, 54, 28)],
    creatures: 10,
    required: 8,
    skills: { warden: 1, delver: 1 },
    plan: [
      ...each('warden', [0], { xLte: 100 }),
      ...each('delver', [1], { xGte: 180 }),
      { popAll: true, when: { tick: 2400 } },
    ],
  },
  {
    index: 16,
    title: ['Pop the Lid', 'Pattintsd fel!'],
    hints: [
      [
        'A Warden stands still – a perfect place for a Popper.',
        'Az Őr egy helyben áll – tökéletes hely egy Pukkancsnak.',
      ],
    ],
    difficulty: 4,
    ops: [floor, rect(SOIL, 230, 400, W - 230, 10), rect(SOIL, 230, 400, 8, 40), ...walls],
    objects: [entrance(40, 430), exitOn(280, FLOOR)],
    creatures: 10,
    required: 8,
    skills: { warden: 1, popper: 1 },
    plan: [
      ...each('warden', [0], { xGte: 226 }),
      { assign: 'popper', creature: 0, when: { state: 'warden' } },
    ],
  },
  {
    index: 17,
    title: ['Long Way Down', 'Hosszú út lefelé'],
    hints: [
      [
        'Two layers: straight down through the soil, then diagonally through the rock.',
        'Két réteg: egyenesen le a földön át, aztán átlósan a kövön keresztül.',
      ],
    ],
    difficulty: 4,
    ops: [floor, rect(SOIL, 0, 300, W, 40), rect(ROCK, 0, 360, W, 40), ...walls],
    objects: [entrance(40, 290), exitOn(290, FLOOR)],
    creatures: 10,
    required: 8,
    skills: { delver: 1, sloper: 1 },
    plan: [...each('delver', [0], { xGte: 80 }), ...each('sloper', [0], { yGte: 360 })],
  },
  {
    index: 18,
    title: ['Narrow Escape', 'Hajszál híján'],
    hints: [
      [
        'Start the stairs right at the water – the next Pathling is not far behind.',
        'A lépcsőt pont a víznél kezdd – a következő Pathling nincs messze.',
      ],
    ],
    difficulty: 5,
    ops: [rect(SOIL, 0, 400, W, 80), cut(200, 400, 14, 80), ...walls],
    objects: [entrance(40, 390), exitOn(280, 400), water(200, 450, 14, 30)],
    creatures: 10,
    required: 8,
    skills: { mason: 1 },
    minReleaseTicks: 200,
    plan: each('mason', [0], { xGte: 196 }),
  },
  {
    index: 19,
    title: ['The Gauntlet', 'Akadálypálya'],
    hints: [
      [
        'Down, through, down again – one pioneer does it all.',
        'Le, át, megint le – egyetlen úttörő mindent megold.',
      ],
    ],
    difficulty: 5,
    w: 480,
    h: 720,
    ops: [
      rect(SOIL, 0, 640, 480, 80),
      rect(SOIL, 0, 470, 480, 40),
      rect(SOIL, 240, 510, 20, 20),
      rect(SOIL, 0, 530, 480, 60),
      ...sideWalls(480, 0, 720),
    ],
    objects: [entrance(60, 460), exitOn(420, 640)],
    creatures: 15,
    required: 12,
    skills: { delver: 1, burrower: 1, sloper: 1 },
    plan: [
      ...each('delver', [0], { xGte: 140 }),
      ...each('burrower', [0], { xGte: 232, yGte: 530 }),
      ...each('sloper', [0], { xGte: 290, yGte: 530 }),
    ],
  },
  {
    index: 20,
    title: ['Mossy Finale', 'Mohás finálé'],
    hints: [
      [
        'Float down, then build your way up to the burrow.',
        'Vitorlázz le, aztán építs fel az odúhoz.',
      ],
      [
        'Only one Mason – but every Pathling needs a leaf.',
        'Csak egy Kőműves van – de minden Pathlingnek kell levél.',
      ],
    ],
    difficulty: 6,
    w: 480,
    h: 720,
    ops: [
      rect(SOIL, 0, 680, 480, 40),
      rect(SOIL, 0, 300, 160, 16),
      rect(SOIL, 300, 670, 180, 10),
      ...sideWalls(480, 0, 720),
    ],
    objects: [entrance(60, 290), exitOn(430, 670)],
    creatures: 15,
    required: 12,
    skills: { glider: 15, mason: 1 },
    minReleaseTicks: 45,
    plan: [...each('glider', range(15)), ...each('mason', [0], { xGte: 278, yGte: 680 })],
  },
];
