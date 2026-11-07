import { cellsWithin, inBounds, neighbors } from './hex';
import { isSea, islandStats, setTile, terrainName, tileAt } from './island';
import type { Rng } from './rng';
import type { Island, MonsterId, TechId, TerrainKind, Tile } from './types';

/**
 * 怪獣（仕様書8章・19章）。名前は仮。決まったらここの name だけを差し替える。
 */
export interface MonsterDef {
  id: MonsterId;
  name: string;
  /** 出現の段階（1〜4） */
  stage: number;
  hpMin: number;
  /** 体力 = hpMin + 0〜(hpRange−1) */
  hpRange: number;
  fast: boolean;
  harden: 'odd' | 'even' | 'random' | null;
  intercept: boolean;
  multiply: boolean;
  blast: boolean;
  drain: boolean;
  exp: number;
  /** 死骸の値段（億円） */
  value: number;
}

export const MONSTER_LIST: readonly MonsterDef[] = [
  { id: 'm1', name: '怪獣M1', stage: 1, hpMin: 1, hpRange: 2, fast: false, harden: null, intercept: false, multiply: false, blast: false, drain: false, exp: 5, value: 400 },
  { id: 'm2', name: '怪獣M2', stage: 1, hpMin: 1, hpRange: 2, fast: false, harden: 'odd', intercept: false, multiply: false, blast: false, drain: false, exp: 7, value: 500 },
  { id: 'm3', name: '怪獣M3', stage: 2, hpMin: 2, hpRange: 2, fast: true, harden: null, intercept: false, multiply: false, blast: false, drain: false, exp: 15, value: 800 },
  { id: 'm4', name: '怪獣M4', stage: 2, hpMin: 3, hpRange: 2, fast: false, harden: null, intercept: true, multiply: false, blast: false, drain: false, exp: 12, value: 1000 },
  { id: 'm5', name: '怪獣M5', stage: 3, hpMin: 3, hpRange: 1, fast: false, harden: null, intercept: false, multiply: true, blast: false, drain: false, exp: 5, value: 100 },
  { id: 'm6', name: '怪獣M6', stage: 3, hpMin: 7, hpRange: 2, fast: false, harden: 'even', intercept: false, multiply: false, blast: false, drain: false, exp: 30, value: 5000 },
  { id: 'm7', name: '怪獣M7', stage: 4, hpMin: 9, hpRange: 1, fast: false, harden: null, intercept: true, multiply: false, blast: true, drain: false, exp: 60, value: 12000 },
  { id: 'm8', name: '怪獣M8', stage: 4, hpMin: 8, hpRange: 1, fast: false, harden: 'random', intercept: false, multiply: false, blast: false, drain: true, exp: 55, value: 10000 },
];

export const MONSTERS: Readonly<Record<MonsterId, MonsterDef>> = Object.fromEntries(
  MONSTER_LIST.map((m) => [m.id, m]),
) as Record<MonsterId, MonsterDef>;

/** 段階ごとの、育てる費用・ターン数・必要な研究 */
export const BREED_STAGES: Readonly<Record<number, { cost: number; turns: number; tech: TechId }>> = {
  1: { cost: 1000, turns: 10, tech: 'bio1' },
  2: { cost: 3000, turns: 15, tech: 'bio2' },
  3: { cost: 8000, turns: 20, tech: 'bio3' },
  4: { cost: 20000, turns: 30, tech: 'bio4' },
};

export const MONSTER_RULES = {
  /** 1つの島にいられる怪獣の数 */
  cap: 7,
  multiplyChance: 0.5,
  drainChance: 0.2,
  drainFraction: 0.25,
  /** 迎撃の能力でミサイルを無効にする確率 */
  interceptChance: 0.5,
  /** 野生の怪獣が出る段階の人口（100人単位）：20万・40万・60万・80万人 */
  stagePops: [2000, 4000, 6000, 8000],
  /** 野生の怪獣の出現率：陸地1マスあたり（災害の強さを掛ける） */
  spawnPerArea: 1 / 10000,
} as const;

// ---- マスの値への詰め方（値 = 種類の番号×16 + 体力） ----

export function monsterTile(id: MonsterId, hp: number): Tile {
  const index = MONSTER_LIST.findIndex((m) => m.id === id);
  return { kind: 'monster', value: index * 16 + Math.max(1, Math.min(15, hp)) };
}

export function monsterOf(tile: Tile): { def: MonsterDef; hp: number } {
  const def = MONSTER_LIST[Math.floor(tile.value / 16)] ?? MONSTER_LIST[0]!;
  return { def, hp: tile.value % 16 };
}

export function newMonsterHp(def: MonsterDef, rng: Rng): number {
  return def.hpMin + rng.int(def.hpRange);
}

/** そのターンに硬くなっているか（硬化中はミサイルが効かず、動かない） */
export function isHardened(def: MonsterDef, turn: number): boolean {
  switch (def.harden) {
    case 'odd':
      return turn % 2 === 1;
    case 'even':
      return turn % 2 === 0;
    case 'random':
      return ((Math.imul(turn, 2654435761) >>> 16) & 1) === 1;
    default:
      return false;
  }
}

export function abilityNames(def: MonsterDef): string[] {
  const names: string[] = [];
  if (def.fast) names.push('速さ');
  if (def.harden === 'odd') names.push('硬化（奇数ターン）');
  if (def.harden === 'even') names.push('硬化（偶数ターン）');
  if (def.harden === 'random') names.push('硬化（ランダム）');
  if (def.intercept) names.push('ミサイル迎撃');
  if (def.multiply) names.push('増殖');
  if (def.blast) names.push('範囲破壊');
  if (def.drain) names.push('資源への干渉');
  return names;
}

export function monsterCount(island: Island): number {
  return island.tiles.filter((t) => t.kind === 'monster').length;
}

/** 怪獣が入れないマス */
const BLOCKED: ReadonlySet<TerrainKind> = new Set([
  'deepSea', 'shallow', 'oilField', 'seaBase', 'mountain', 'monster', 'wall',
]);

/** 怪獣が現れてよいマス（陸地で、山・怪獣・防壁以外） */
function canAppear(tile: Tile): boolean {
  return !BLOCKED.has(tile.kind);
}

type Logger = (text: string, tone?: 'info' | 'good' | 'bad') => void;

/**
 * 怪獣を島のランダムな陸地に出す。出せなければ null。
 */
export function placeMonster(island: Island, id: MonsterId, rng: Rng): { x: number; y: number } | null {
  if (monsterCount(island) >= MONSTER_RULES.cap) return null;
  const spots: number[] = [];
  island.tiles.forEach((t, i) => {
    if (canAppear(t)) spots.push(i);
  });
  if (spots.length === 0) return null;
  const index = spots[rng.int(spots.length)]!;
  const def = MONSTERS[id];
  island.tiles[index] = monsterTile(id, newMonsterHp(def, rng));
  return { x: index % island.size, y: Math.floor(index / island.size) };
}

/** 野生の怪獣の出現（島の人口の段階で種類が変わる） */
export function spawnWildMonster(island: Island, rng: Rng, disasterLevel: number, log: Logger): void {
  const { pop, area } = islandStats(island);
  const stage = MONSTER_RULES.stagePops.filter((p) => pop >= p).length;
  if (stage === 0 || disasterLevel <= 0) return;
  if (rng.next() >= area * MONSTER_RULES.spawnPerArea * disasterLevel) return;
  const candidates = MONSTER_LIST.filter((m) => m.stage <= stage);
  const def = candidates[rng.int(candidates.length)]!;
  const at = placeMonster(island, def.id, rng);
  if (at) log(`(${at.x}, ${at.y}) に${def.name}が現れた！`, 'bad');
}

/**
 * 怪獣の行動（毎ターン、マスごとの処理のときに呼ぶ）。
 * 迎撃施設を踏んで倒れた怪獣の死骸の値段は、その島に入る。
 */
export function moveMonsters(island: Island, rng: Rng, turn: number, log: Logger): void {
  const start: number[] = [];
  island.tiles.forEach((t, i) => {
    if (t.kind === 'monster') start.push(i);
  });
  const order = rng.permutation(start.length).map((i) => start[i]!);
  for (const startIndex of order) {
    let x = startIndex % island.size;
    let y = Math.floor(startIndex / island.size);
    const tile = tileAt(island, x, y);
    if (tile.kind !== 'monster') continue; // 前の怪獣の範囲破壊などで消えた
    const { def } = monsterOf(tile);
    if (isHardened(def, turn)) continue;

    if (def.drain && rng.next() < MONSTER_RULES.drainChance) {
      if (rng.int(2) === 0) {
        const taken = Math.floor(island.money * MONSTER_RULES.drainFraction);
        island.money -= taken;
        log(`${def.name}が資金${taken}億円を奪った`, 'bad');
      } else {
        const taken = Math.floor(island.food * MONSTER_RULES.drainFraction);
        island.food -= taken;
        log(`${def.name}が食料${(taken * 100).toLocaleString('ja-JP')}トンを奪った`, 'bad');
      }
    }

    const steps = def.fast ? 2 : 1;
    for (let step = 0; step < steps; step++) {
      const next = pickDestination(island, x, y, rng);
      if (!next) break;
      const dest = tileAt(island, next.x, next.y);
      const self = tileAt(island, x, y);
      if (dest.kind === 'interceptor') {
        // 迎撃施設が自爆して周囲1マスを荒地にする。怪獣も倒れる
        setTile(island, x, y, 'waste');
        for (const p of cellsWithin(next.x, next.y, 1)) {
          if (inBounds(island.size, p.x, p.y) && !isSea(tileAt(island, p.x, p.y).kind)) {
            if (tileAt(island, p.x, p.y).kind !== 'mountain') setTile(island, p.x, p.y, 'waste');
          }
        }
        island.money += def.value;
        log(`${def.name}が (${next.x}, ${next.y}) の迎撃施設を踏み、迎撃施設が自爆した。${def.name}は倒れた（${def.value}億円）`, 'good');
        break;
      }
      const lost = dest.kind !== 'waste' && dest.kind !== 'plains' ? terrainName(dest) : null;
      island.tiles[next.y * island.size + next.x] = { ...self };
      const leaveChild = def.multiply && rng.next() < MONSTER_RULES.multiplyChance && monsterCount(island) < MONSTER_RULES.cap;
      if (leaveChild) {
        island.tiles[y * island.size + x] = monsterTile(def.id, newMonsterHp(def, rng));
        log(`${def.name}が分裂した`, 'bad');
      } else {
        setTile(island, x, y, 'waste');
      }
      if (lost) log(`${def.name}が (${next.x}, ${next.y}) の${lost}を踏み荒らした`, 'bad');
      x = next.x;
      y = next.y;
      if (def.blast) {
        for (const p of neighbors(island.size, x, y)) {
          const t = tileAt(island, p.x, p.y);
          if (isSea(t.kind) || t.kind === 'mountain' || t.kind === 'monster' || t.kind === 'waste') continue;
          setTile(island, p.x, p.y, 'waste');
        }
        log(`${def.name}が周囲を焼き払った`, 'bad');
      }
    }
  }
}

function pickDestination(island: Island, x: number, y: number, rng: Rng): { x: number; y: number } | null {
  const around = neighbors(island.size, x, y);
  for (let tries = 0; tries < 3; tries++) {
    const p = around[rng.int(around.length)];
    if (p && !BLOCKED.has(tileAt(island, p.x, p.y).kind)) return p;
  }
  return null;
}
