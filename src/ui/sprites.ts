import { RULES } from '../engine/rules';
import type { MonsterId, Tile } from '../engine/types';

/**
 * 16×16 のドット絵。1文字が1ドットで、色は PALETTE で決める（'.' は透明）。
 * マスには2倍に拡大して 32×32 で描く。絵はすべてこのファイルの中で作る（画像ファイルは使わない）。
 */

export const SIZE = 16;

export const PALETTE: Readonly<Record<string, string>> = {
  // 海
  D: '#1d4e89', d: '#2b64a8', e: '#3f7fc4', w: '#a9d4f5',
  S: '#4a95d6', s: '#6fb3e8',
  // 荒地
  B: '#b99c6b', b: '#9d8153', c: '#d2bb8e',
  // 草地
  G: '#78bb48', g: '#63a23a', h: '#95d164',
  // 木
  T: '#2f6f31', t: '#43923f', u: '#62b452', k: '#6b4a2b',
  // 山
  M: '#8c8c8c', m: '#6b6b6b', n: '#b0b0b0', W: '#f4f4f4',
  // 家
  R: '#c84b3c', r: '#973428', Q: '#3d6fc1', q: '#2c5193', H: '#f1e8d5', o: '#6d4c33',
  // 窓・明かり
  Y: '#ffe28a', y: '#5b6b7a',
  // コンクリート・金属
  K: '#9ea3a8', L: '#c9cdd1', N: '#6e7378', A: '#f5f5f5', a: '#c0c4c8',
  // 煙
  F: '#e6e6e6', f: '#c8c8c8',
  // 畑
  P: '#8a5a32', p: '#6f4626', V: '#9ccc3c', v: '#d1b83d',
  // 差し色
  E: '#d33b2f', J: '#f5d142',
  // 紫（怪獣研究所）
  U: '#7b2fa0', j: '#a656c9', i: '#e8c8f5',
  // 怪獣（X・x は怪獣ごとの色に置き換える）
  X: '#888888', x: '#555555', I: '#ffffff', Z: '#1e1e1e', l: '#f3e3a0',
};

export type Sprite = readonly string[];

/** base の (x, y) に glyph を重ねる。glyph の '.' は透明 */
function stamp(base: readonly string[], glyph: readonly string[], x: number, y: number): string[] {
  const rows = base.map((row) => row.split(''));
  glyph.forEach((line, dy) => {
    [...line].forEach((ch, dx) => {
      const row = rows[y + dy];
      if (ch !== '.' && row && x + dx >= 0 && x + dx < SIZE) row[x + dx] = ch;
    });
  });
  return rows.map((r) => r.join(''));
}

function layer(base: readonly string[], ...glyphs: Array<[readonly string[], number, number]>): string[] {
  return glyphs.reduce<string[]>((acc, [g, x, y]) => stamp(acc, g, x, y), [...base]);
}

// ---- 地面 ----

const DEEP_SEA: Sprite = [
  'DDDDDDDDDDDDDDDD',
  'DDDDDDDDDDDDDDDD',
  'DDeeeDDDDDDDDDDD',
  'DeDDDeDDDDDDDDDD',
  'DDDDDDDDDDDDDDDD',
  'DDDDDDDDDDDDDDDD',
  'DDDDDDDDDDeeeDDD',
  'DDDDDDDDDeDDDeDD',
  'DDDDDDDDDDDDDDDD',
  'DDDDDDDDDDDDDDDD',
  'DDDDeeeDDDDDDDDD',
  'DDDeDDDeDDDDDDDD',
  'DDDDDDDDDDDDDDDD',
  'DDDDDDDDDDDDdDDD',
  'DDDDDDDDDDDdDdDD',
  'DDDDDDDDDDDDDDDD',
];

const SHALLOW: Sprite = [
  'SSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSS',
  'SSSsssSSSSSSSSSS',
  'SSsSSSsSSSSSwSSS',
  'SSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSS',
  'SSSSSSSSSsssSSSS',
  'SSwSSSSSsSSSsSSS',
  'SSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSS',
  'SSSSsssSSSSSSSSS',
  'SSSsSSSsSSSSSSSS',
  'SSSSSSSSSSSSSwSS',
  'SSSSSSSSSSssSSSS',
  'SSSSSSSSSsSSsSSS',
  'SSSSSSSSSSSSSSSS',
];

const WASTE: Sprite = [
  'BBBBBBBBBBBBBBBB',
  'BBcBBBBBBBBBbBBB',
  'BBBBBBBbBBBBBBBB',
  'BBBBBBBBBBBcBBBB',
  'BbBBBBBBBBBBBBBB',
  'BBBBBcBBBBBBBBbB',
  'BBBBBBBBBbBBBBBB',
  'BBcBBBBBBBBBBBBB',
  'BBBBBBBBBBBBcBBB',
  'BBBBbBBBBBBBBBBB',
  'BBBBBBBBcBBBBBBB',
  'BbBBBBBBBBBBBbBB',
  'BBBBBBcBBBBBBBBB',
  'BBBBBBBBBBBbBBBB',
  'BBBcBBBBBBBBBBBB',
  'BBBBBBBBBcBBBBBB',
];

const PLAINS: Sprite = [
  'GGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGG',
  'GGhGGGGGGGGGgGGG',
  'GgGGGGGGGGGGGGGG',
  'GGGGGGGGhGGGGGGG',
  'GGGGGGGgGGGGGGGG',
  'GGGGGGGGGGGGGGhG',
  'GGGGGGGGGGGGGgGG',
  'GhGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGG',
  'GGGGGGhGGGGGGGGG',
  'GGGGGgGGGGGGGhGG',
  'GGGGGGGGGGGGgGGG',
  'GGGhGGGGGGGGGGGG',
  'GGgGGGGGGGGGGGGG',
  'GGGGGGGGGhGGGGGG',
];

// ---- 部品 ----

const TREE = ['..u..', '.tut.', '.ttt.', 'tttTt', 'tTttT', '.TTT.', '..k..', '..k..'];

const HOUSE_RED = ['..RR..', '.RRRR.', 'RRrrRR', '.HHHH.', '.HYoH.', '.HHoH.'];
const HOUSE_BLUE = ['..QQ..', '.QQQQ.', 'QQqqQQ', '.HHHH.', '.HoYH.', '.HoHH.'];

function building(height: number): string[] {
  const rows = ['NNNN'];
  for (let i = 0; i < height - 2; i++) rows.push(i % 2 === 0 ? 'LYLY' : 'LLLL');
  rows.push('KKKK');
  return rows;
}

const SMOKE = ['.FF.', 'FffF', '.FF.'];

const MOUNTAIN = layer(PLAINS, [
  [
    '.......W........',
    '......WWn.......',
    '.....WWnnM......',
    '....nWnMMMm.....',
    '....nnMMMMm.....',
    '...nnMMMMMmm....',
    '...nMMMMmMMm....',
    '..nnMMMmMMMmm...',
    '..nMMMMMMMMMm...',
    '.nnMMMmMMMMMmm..',
    '.nMMMMMMMMmMMm..',
    'nnMMMMMMMMMMMmm.',
    'nMMMMMMMMMMMMMmm',
  ],
  0,
  3,
]);

function farmRows(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < SIZE; y++) {
    const r = y % 4;
    if (r === 0) rows.push('ppPPPPpPPPPPPpPP');
    else if (r === 1) rows.push('VvVVVVvVVVVvVVVV');
    else if (r === 2) rows.push('VVVvVVVVVvVVVVvV');
    else rows.push('PPPPpPPPPPPpPPPP');
  }
  return rows;
}

// ---- 施設 ----

const FACTORY = layer(
  PLAINS,
  [SMOKE, 10, 0],
  [
    [
      '...........N..',
      '...........N..',
      '.N.N.N.....N..',
      'NNNNNNNNNNNNNN',
      'KKKKKKKKKKKKKK',
      'KYKKYKKYKKYKKK',
      'KKKKKKKKKKKKKK',
      'KYKKYKKYKKYKKK',
      'KKKKKKKKKKKKKK',
      'KKKKKooKKKKKKK',
      'NNNNNooNNNNNNN',
    ],
    1,
    3,
  ],
);

const WIND = layer(PLAINS, [
  [
    '....A......',
    '....AA.....',
    '.....A.....',
    '.....AA....',
    '......E....',
    '....AA.AA..',
    '..AA..a..AA',
    'AA....a....',
    '......a....',
    '......a....',
    '......a....',
    '......a....',
    '......a....',
    '.....aaa...',
    '....NNNNN..',
  ],
  2,
  1,
]);

const HYDRO = [
  'SSSSSSSSSSSSSSSS',
  'SSSsssSSSSSSsSSS',
  'SSSSSSSSSsssSSSS',
  'SSsSSSSSSSSSSSSS',
  'NNNNNNNNNNNNNNNN',
  'LLLLLLLLLLLLLLLL',
  'LKLLLLKLLLLKLLLL',
  'LLLLLLLLLLLLLLLL',
  'KKKKwwKKKKwwKKKK',
  'NNNNwwNNNNwwNNNN',
  'SSSSwwSSSSwwSSSS',
  'SSSswwSSSSwwsSSS',
  'SSSSwSSSSSSwSSSS',
  'SsSSSSSSSsSSSSSS',
  'SSSSSSsSSSSSSSsS',
  'SSSSSSSSSSSSSSSS',
];

const THERMAL = layer(
  PLAINS,
  [SMOKE, 2, 0],
  [SMOKE, 9, 1],
  [
    [
      '..NN......NN..',
      '..aa......aa..',
      '..aa......aa..',
      '..aa......aa..',
      '..aa......aa..',
      'KKKKKKKKKKKKKK',
      'KYYKKKKKKKYYKK',
      'KKKKKKKKKKKKKK',
      'KKKKKKooKKKKKK',
      'NNNNNNooNNNNNN',
    ],
    1,
    4,
  ],
);

const NUCLEAR = layer(PLAINS, [
  [
    '..........KK..',
    '.........KLLK.',
    '...LLL...KLLK.',
    '..LLLLL..KLLK.',
    '.LLLJLLL.KLLK.',
    '.LLJJJLL.KKKK.',
    'LLLLLLLLLKLLKK',
    'KKKKKKKKKKKKKK',
    'KKKKoKKKKKKKKK',
    'NNNNoNNNNNNNNN',
  ],
  1,
  5,
]);

const LAB = layer(PLAINS, [
  [
    '.....QQQQ.....',
    '....QQwwQQ....',
    '...QQQQQQQQ...',
    'HHHHHHHHHHHHHH',
    'HyyHHyyHHyyHHH',
    'HHHHHHHHHHHHHH',
    'HyyHHyyHHyyHHH',
    'HHHHHHooHHHHHH',
    'NNNNNNooNNNNNN',
  ],
  1,
  6,
]);

const OIL_FIELD = layer(DEEP_SEA, [
  [
    '.....J....',
    '....JEJ...',
    '.....a....',
    '....a.a...',
    '...a...a..',
    '...aaaaa..',
    '..a.....a.',
    '..aaaaaaa.',
    'NNNNNNNNNN',
    'KKKKKKKKKK',
    'N.N....N.N',
    'N.N....N.N',
  ],
  3,
  2,
]);

const MISSILE_BASE = layer(PLAINS, [
  [
    '......E.......',
    '.....AAA......',
    '.....AAA......',
    '.....AEA......',
    '.....AAA......',
    '.....AAA......',
    '....AAAAA.....',
    '...NNNNNNN....',
    '..KKKKKKKKK...',
    'NNNNNNNNNNNNNN',
  ],
  1,
  5,
]);

const SEA_BASE = layer(DEEP_SEA, [
  [
    '......a.......',
    '......a.......',
    '.....NNN......',
    '..NNNNNNNNN...',
    '.NNyNNyNNyNN..',
    'NNNNNNNNNNNNN.',
  ],
  1,
  6,
]);

const INTERCEPTOR = layer(PLAINS, [
  [
    '.aa.........',
    'aAAa........',
    'aAAAa.......',
    '.aAAAa......',
    '..aAAAa.....',
    '...aaa.E....',
    '....a.......',
    '...KKKK.....',
    '..KKKKKK....',
    '.NNNNNNNNNN.',
  ],
  2,
  5,
]);

const WALL = [
  'NNNNNNNNNNNNNNNN',
  'KKKLKKKNKKKLKKKN',
  'KKKKKKKNKKKKKKKN',
  'NNNNNNNNNNNNNNNN',
  'KLKKKNKKKLKKKNKK',
  'KKKKKNKKKKKKKNKK',
  'NNNNNNNNNNNNNNNN',
  'KKKLKKKNKKKLKKKN',
  'KKKKKKKNKKKKKKKN',
  'NNNNNNNNNNNNNNNN',
  'KLKKKNKKKLKKKNKK',
  'KKKKKNKKKKKKKNKK',
  'NNNNNNNNNNNNNNNN',
  'KKKLKKKNKKKLKKKN',
  'KKKKKKKNKKKKKKKN',
  'NNNNNNNNNNNNNNNN',
];

const MONSTER_LAB = layer(PLAINS, [
  [
    '.....jjjj.....',
    '....jjiijj....',
    '...UUUUUUUU...',
    'UUUUUUUUUUUUUU',
    'UiiUUiiUUiiUUU',
    'UUUUUUUUUUUUUU',
    'UiiUUUooUUiiUU',
    'UUUUUUooUUUUUU',
    'NNNNNNooNNNNNN',
  ],
  1,
  6,
]);

// ---- 怪獣（段階ごとの形） ----

const MONSTER_SHAPES: Record<number, string[]> = {
  1: [
    '...XXXX...',
    '..XXXXXX..',
    '.XIZXXIZX.',
    '.XIIXXIIX.',
    'XXXXXXXXXX',
    'XXxXXXXxXX',
    'xXXXXXXXXx',
    '.xx....xx.',
  ],
  2: [
    '....XXXX....',
    '..XXXXXXXX..',
    '.XXIZXXIZXX.',
    '.XXIIXXIIXX.',
    'XXXXXXXXXXXX',
    'XXXXEEEEXXXX',
    'XXxXXXXXXxXX',
    'XXXXXXXXXXXX',
    '.XXX....XXX.',
    '.xx......xx.',
  ],
  3: [
    '..l........l..',
    '..lX......Xl..',
    '...XXXXXXXX...',
    '..XXXXXXXXXX..',
    '.XXIZXXXXIZXX.',
    '.XXIIXXXXIIXX.',
    'XXXXXXXXXXXXXX',
    'XXXXXEEEEXXXXX',
    'XXxXXXXXXXXxXX',
    'XXXXXXXXXXXXXX',
    '.XXXX....XXXX.',
    '.xxx......xxx.',
  ],
  4: [
    'l.l........l.l',
    '.lXl......lXl.',
    '..XXXXXXXXXX..',
    '.XXXXXXXXXXXX.',
    'XXXIZXXXXIZXXX',
    'XXXIIXXXXIIXXX',
    'XXXXXXXXXXXXXX',
    'XXXXEEEEEEXXXX',
    'XxXXXElElEXXxX',
    'XXXXXXXXXXXXXX',
    'XXxXXXXXXXXxXX',
    '.XXXX....XXXX.',
    '.xxxx....xxxx.',
  ],
};

function monsterSprite(stage: number): string[] {
  const shape = MONSTER_SHAPES[stage] ?? MONSTER_SHAPES[1]!;
  const w = shape[0]!.length;
  const h = shape.length;
  return layer(WASTE, [shape, Math.floor((SIZE - w) / 2), SIZE - h - 1]);
}

/** 怪獣ごとの体の色（X は体、x は影） */
export const MONSTER_COLORS: Readonly<Record<MonsterId, { X: string; x: string }>> = {
  m1: { X: '#a1887f', x: '#6d4c41' },
  m2: { X: '#90a4ae', x: '#546e7a' },
  m3: { X: '#fb8c00', x: '#c25e00' },
  m4: { X: '#5c6bc0', x: '#3949ab' },
  m5: { X: '#66bb6a', x: '#388e3c' },
  m6: { X: '#607d8b', x: '#37474f' },
  m7: { X: '#e53935', x: '#b71c1c' },
  m8: { X: '#8e24aa', x: '#4a148c' },
};

// ---- 一覧 ----

export const SPRITES: Readonly<Record<string, Sprite>> = {
  deepSea: DEEP_SEA,
  shallow: SHALLOW,
  waste: WASTE,
  plains: PLAINS,
  forest1: layer(PLAINS, [TREE, 5, 5]),
  forest2: layer(PLAINS, [TREE, 2, 2], [TREE, 9, 7]),
  forest3: layer(PLAINS, [TREE, 1, 1], [TREE, 9, 0], [TREE, 4, 7], [TREE, 10, 8]),
  mountain: MOUNTAIN,
  village: layer(PLAINS, [HOUSE_RED, 5, 6]),
  town: layer(PLAINS, [HOUSE_RED, 1, 2], [HOUSE_BLUE, 9, 3], [HOUSE_RED, 5, 9]),
  city: layer(PLAINS, [building(10), 1, 5], [building(14), 6, 1], [building(8), 11, 7]),
  farm: farmRows(),
  factory: FACTORY,
  oilField: OIL_FIELD,
  windPower: WIND,
  hydroPower: HYDRO,
  thermalPower: THERMAL,
  nuclearPower: NUCLEAR,
  lab: LAB,
  missileBase: MISSILE_BASE,
  seaBase: SEA_BASE,
  interceptor: INTERCEPTOR,
  wall: WALL,
  monsterLab: MONSTER_LAB,
  monster1: monsterSprite(1),
  monster2: monsterSprite(2),
  monster3: monsterSprite(3),
  monster4: monsterSprite(4),
};

/** マスに使う絵の名前と、怪獣の色の置き換え */
export function spriteKey(tile: Tile, monster?: { id: MonsterId; stage: number }): { key: string; colors?: Record<string, string> } {
  switch (tile.kind) {
    case 'forest':
      return { key: tile.value >= 50 ? 'forest3' : tile.value >= 10 ? 'forest2' : 'forest1' };
    case 'town':
      return { key: tile.value >= RULES.cityThreshold ? 'city' : tile.value >= RULES.villageMax ? 'town' : 'village' };
    case 'monster':
      return monster ? { key: `monster${monster.stage}`, colors: MONSTER_COLORS[monster.id] } : { key: 'monster1' };
    default:
      return { key: tile.kind };
  }
}
