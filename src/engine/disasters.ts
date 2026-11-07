import { cellsWithin, hexDistance, inBounds, neighbors } from './hex';
import { isSea, setTile, terrainName, tileAt } from './island';
import type { Rng } from './rng';
import { RULES } from './rules';
import type { Island, TerrainKind } from './types';

/**
 * 災害（仕様書19章）。確率は「ふつう」のときの1ターンあたりの値で、災害の強さを掛ける。
 */
export const DISASTER_CHANCES = {
  earthquake: 0.005,
  tsunami: 0.005,
  typhoon: 0.005,
  meteor: 0.005,
  hugeMeteor: 0.002,
  eruption: 0.005,
} as const;

export type DisasterKind = keyof typeof DISASTER_CHANCES;

type Logger = (text: string, tone?: 'info' | 'good' | 'bad') => void;

/** 地震で壊れやすい施設 */
const QUAKE_TARGETS: ReadonlySet<TerrainKind> = new Set([
  'factory', 'windPower', 'hydroPower', 'thermalPower', 'nuclearPower', 'lab', 'monsterLab',
]);

/** 津波で壊れるもの（海に面した陸の住宅地・施設） */
const TSUNAMI_TARGETS: ReadonlySet<TerrainKind> = new Set([
  'town', 'farm', 'factory', 'windPower', 'hydroPower', 'thermalPower', 'nuclearPower', 'lab',
  'missileBase', 'interceptor', 'wall', 'monsterLab',
]);

/** 毎ターン、島ごとに災害の判定をする */
export function runDisasters(island: Island, rng: Rng, level: number, log: Logger): void {
  if (level <= 0) return;
  for (const kind of Object.keys(DISASTER_CHANCES) as DisasterKind[]) {
    if (rng.next() < DISASTER_CHANCES[kind] * level) applyDisaster(island, kind, rng, log);
  }
}

export function applyDisaster(island: Island, kind: DisasterKind, rng: Rng, log: Logger): void {
  switch (kind) {
    case 'earthquake':
      return earthquake(island, rng, log);
    case 'tsunami':
      return tsunami(island, rng, log);
    case 'typhoon':
      return typhoon(island, rng, log);
    case 'meteor':
      return meteor(island, rng, log);
    case 'hugeMeteor':
      return hugeMeteor(island, rng, log);
    case 'eruption':
      return eruption(island, rng, log);
    default: {
      const unreachable: never = kind;
      throw new Error(`知らない災害: ${String(unreachable)}`);
    }
  }
}

function forEachTile(island: Island, fn: (x: number, y: number) => void): void {
  for (let y = 0; y < island.size; y++) for (let x = 0; x < island.size; x++) fn(x, y);
}

/** 壊れたものを数えてログ用にまとめる */
function summary(names: string[]): string {
  if (names.length === 0) return '大きな被害はなかった';
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return `${[...counts].map(([n, c]) => (c > 1 ? `${n}${c}つ` : n)).join('・')}が壊れた`;
}

function earthquake(island: Island, rng: Rng, log: Logger): void {
  const lost: string[] = [];
  forEachTile(island, (x, y) => {
    const tile = tileAt(island, x, y);
    const isCity = tile.kind === 'town' && tile.value >= RULES.cityThreshold;
    if (!isCity && !QUAKE_TARGETS.has(tile.kind)) return;
    if (rng.int(8) !== 0) return;
    lost.push(terrainName(tile));
    setTile(island, x, y, 'waste');
  });
  log(`地震が起きた！ ${summary(lost)}`, 'bad');
}

function tsunami(island: Island, rng: Rng, log: Logger): void {
  const lost: string[] = [];
  forEachTile(island, (x, y) => {
    const tile = tileAt(island, x, y);
    if (!TSUNAMI_TARGETS.has(tile.kind)) return;
    const seaSides = neighbors(island.size, x, y).filter((p) => isSea(tileAt(island, p.x, p.y).kind)).length;
    // 島の端のマスは、島の外も海として数える
    const outside = 6 - neighbors(island.size, x, y).length;
    if (rng.int(12) >= seaSides + outside - 1) return;
    lost.push(terrainName(tile));
    setTile(island, x, y, 'waste');
  });
  log(`津波が来た！ ${summary(lost)}`, 'bad');
}

function typhoon(island: Island, rng: Rng, log: Logger): void {
  let lost = 0;
  forEachTile(island, (x, y) => {
    if (tileAt(island, x, y).kind !== 'farm' || rng.int(4) !== 0) return;
    lost++;
    setTile(island, x, y, 'plains');
  });
  log(`台風が来た！ ${lost > 0 ? `農場${lost}つが飛ばされた` : '大きな被害はなかった'}`, 'bad');
}

function randomPoint(island: Island, rng: Rng): { x: number; y: number } {
  return { x: rng.int(island.size), y: rng.int(island.size) };
}

function meteor(island: Island, rng: Rng, log: Logger): void {
  do {
    const p = randomPoint(island, rng);
    const before = tileAt(island, p.x, p.y);
    setTile(island, p.x, p.y, 'deepSea');
    log(
      isSea(before.kind) ? `隕石が (${p.x}, ${p.y}) の海に落ちた` : `隕石が (${p.x}, ${p.y}) に落ち、${terrainName(before)}が海になった`,
      'bad',
    );
  } while (rng.int(2) === 0);
}

function hugeMeteor(island: Island, rng: Rng, log: Logger): void {
  const c = randomPoint(island, rng);
  for (const p of cellsWithin(c.x, c.y, 2)) {
    if (!inBounds(island.size, p.x, p.y)) continue;
    const d = hexDistance(c.x, c.y, p.x, p.y);
    const kind = tileAt(island, p.x, p.y).kind;
    if (d === 0) setTile(island, p.x, p.y, 'deepSea');
    else if (d === 1) {
      if (!isSea(kind)) setTile(island, p.x, p.y, 'shallow');
    } else if (!isSea(kind) && kind !== 'mountain') setTile(island, p.x, p.y, 'waste');
  }
  log(`巨大隕石が (${c.x}, ${c.y}) に落ちた！ 周囲が大きく壊れた`, 'bad');
}

function eruption(island: Island, rng: Rng, log: Logger): void {
  const c = randomPoint(island, rng);
  setTile(island, c.x, c.y, 'mountain');
  for (const p of neighbors(island.size, c.x, c.y)) {
    const kind = tileAt(island, p.x, p.y).kind;
    if (kind === 'mountain') continue;
    if (kind === 'deepSea' || kind === 'oilField' || kind === 'seaBase') setTile(island, p.x, p.y, 'shallow');
    else if (kind === 'shallow') setTile(island, p.x, p.y, 'waste');
    else setTile(island, p.x, p.y, 'waste');
  }
  log(`(${c.x}, ${c.y}) で噴火が起き、山ができた`, 'bad');
}
