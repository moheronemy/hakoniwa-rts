import { hasAdjacent, isSea, setTile, tileAt } from './island';
import type { Rng } from './rng';
import { RULES } from './rules';
import { newResearch } from './tech';
import type { Controller, Island, TerrainKind } from './types';

/**
 * 初期の島を作る（仕様書16章・23章）。原作の作り方に合わせる。
 * 1. 中央の4×4マスを荒地にする。
 * 2. 中央の8×8マスの範囲から120回マスを選び、そのマスか隣に陸地があれば
 *    「深い海→浅瀬→荒地→平地」と1段階ずつ陸地にする。
 * 3. 中央の4×4マスに森4・村2・山1を置き、何もしなくても飢えないよう農場1を加える。
 * 陸地はおよそ25〜40マスになる（20×20マスのうち中央だけを使う）。
 */
export function generateIsland(
  rng: Rng,
  id: string,
  name: string,
  controller: Controller = 'player',
  size: number = RULES.islandSize,
): Island {
  const island: Island = {
    id,
    name,
    size,
    tiles: Array.from({ length: size * size }, () => ({ kind: 'deepSea' as const, value: 0 })),
    money: RULES.initialMoney,
    food: RULES.initialFood,
    oil: 0,
    research: newResearch(),
    queue: [],
    controller,
    destroyed: false,
    emptyTurns: 0,
    lastAttackedBy: null,
    breeding: [],
    satellites: {},
  };

  const center = Math.floor(size / 2) - 1;
  for (let y = center - 1; y < center + 3; y++) {
    for (let x = center - 1; x < center + 3; x++) setTile(island, x, y, 'waste');
  }

  for (let i = 0; i < GROW_STEPS; i++) {
    const x = rng.int(8) + center - 3;
    const y = rng.int(8) + center - 3;
    const tile = tileAt(island, x, y);
    const nearLand = !isSea(tile.kind) || hasAdjacent(island, x, y, (t) => !isSea(t.kind));
    if (!nearLand) continue;
    if (tile.kind === 'waste') setTile(island, x, y, 'plains');
    else if (tile.kind === 'shallow') setTile(island, x, y, 'waste');
    else if (tile.kind === 'deepSea') setTile(island, x, y, 'shallow');
  }

  const core = (t: TerrainKind) => t !== 'forest' && t !== 'town' && t !== 'mountain' && t !== 'farm';
  placeInCore(island, rng, center, 'forest', 4, 5, (t) => t !== 'forest');
  placeInCore(island, rng, center, 'town', 2, 5, core);
  placeInCore(island, rng, center, 'mountain', 1, 0, core);
  placeInCore(island, rng, center, 'farm', 1, RULES.farmInitial, core);

  return island;
}

/** 原作で陸地を広げる回数 */
const GROW_STEPS = 120;

/** 中央の4×4マスのうち、条件に合うマスにランダムに置く */
function placeInCore(
  island: Island,
  rng: Rng,
  center: number,
  kind: TerrainKind,
  count: number,
  value: number,
  allowed: (current: TerrainKind) => boolean,
): void {
  for (let placed = 0, tries = 0; placed < count && tries < 200; tries++) {
    const x = rng.int(4) + center - 1;
    const y = rng.int(4) + center - 1;
    if (!allowed(tileAt(island, x, y).kind)) continue;
    setTile(island, x, y, kind, value);
    placed++;
  }
}
