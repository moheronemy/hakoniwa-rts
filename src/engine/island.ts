import { neighbors } from './hex';
import { RULES } from './rules';
import type { Island, TerrainKind, Tile } from './types';

export function tileAt(island: Island, x: number, y: number): Tile {
  const tile = island.tiles[y * island.size + x];
  if (!tile) throw new Error(`マスが島の外です: (${x}, ${y})`);
  return tile;
}

export function setTile(island: Island, x: number, y: number, kind: TerrainKind, value = 0): void {
  island.tiles[y * island.size + x] = { kind, value };
}

/** 海のマス（深い海・浅瀬・海上油田） */
export function isSea(kind: TerrainKind): boolean {
  return kind === 'deepSea' || kind === 'shallow' || kind === 'oilField';
}

export function hasAdjacent(
  island: Island,
  x: number,
  y: number,
  pred: (tile: Tile) => boolean,
): boolean {
  return neighbors(island.size, x, y).some((p) => pred(tileAt(island, p.x, p.y)));
}

export interface IslandStats {
  /** 人口（100人単位） */
  pop: number;
  /** 農場の規模の合計（1,000人単位） */
  farm: number;
  /** 工場の規模の合計（1,000人単位） */
  factory: number;
  /** 陸地のマス数 */
  area: number;
  /** 木の数の合計（100本単位） */
  forest: number;
}

export function islandStats(island: Island): IslandStats {
  const stats: IslandStats = { pop: 0, farm: 0, factory: 0, area: 0, forest: 0 };
  for (const tile of island.tiles) {
    if (!isSea(tile.kind)) stats.area++;
    switch (tile.kind) {
      case 'town':
        stats.pop += tile.value;
        break;
      case 'farm':
        stats.farm += tile.value;
        break;
      case 'factory':
        stats.factory += tile.value;
        break;
      case 'forest':
        stats.forest += tile.value;
        break;
      default:
        break;
    }
  }
  return stats;
}

const TERRAIN_NAMES: Record<Exclude<TerrainKind, 'town'>, string> = {
  deepSea: '海',
  shallow: '浅瀬',
  waste: '荒地',
  plains: '平地',
  forest: '森',
  mountain: '山',
  farm: '農場',
  factory: '工場',
  oilField: '海上油田',
  windPower: '風力発電所',
  hydroPower: '水力発電所',
  thermalPower: '火力発電所',
  nuclearPower: '原子力発電所',
  lab: '研究所',
};

export function terrainName(tile: Tile): string {
  if (tile.kind === 'town') {
    if (tile.value >= RULES.cityThreshold) return '都市';
    if (tile.value >= RULES.villageMax) return '町';
    return '村';
  }
  return TERRAIN_NAMES[tile.kind];
}

/** マスの値の説明（例：「人口 3,200人」） */
export function tileDetail(tile: Tile): string {
  switch (tile.kind) {
    case 'town':
      return `人口 ${formatPeople(tile.value)}`;
    case 'farm':
    case 'factory':
      return `${formatThousands(tile.value)}人規模`;
    case 'forest':
      return `${(tile.value * 100).toLocaleString('ja-JP')}本`;
    case 'oilField':
      return `埋蔵量 ${tile.value}`;
    case 'windPower':
    case 'hydroPower':
    case 'thermalPower':
    case 'nuclearPower':
    case 'lab':
      return `${tile.value}段階`;
    default:
      return '';
  }
}

/** 100人単位の人口を表示用の文字列にする */
export function formatPeople(popUnits: number): string {
  return `${(popUnits * 100).toLocaleString('ja-JP')}人`;
}

/** 1,000人単位の規模を表示用にする */
export function formatThousands(units: number): string {
  return (units * 1000).toLocaleString('ja-JP');
}
