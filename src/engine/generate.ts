import { hasAdjacent, isSea, setTile, tileAt } from './island';
import type { Rng } from './rng';
import { RULES } from './rules';
import { newResearch } from './tech';
import type { Controller, Island } from './types';

/**
 * 初期の島を作る（仕様書16章）。
 * 中央の6×6マスを荒地にし、周りに陸地をランダムに広げてから、森・村・山・農場を置く。
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
  };

  const center = Math.floor(size / 2);
  const coreStart = center - 3;
  for (let y = coreStart; y < coreStart + 6; y++) {
    for (let x = coreStart; x < coreStart + 6; x++) {
      setTile(island, x, y, 'waste');
    }
  }

  // 中央付近のマスを選び、隣が陸なら「深い海→浅瀬→荒地」と陸地を広げる
  const spread = 8;
  const iterations = size * size * 3;
  for (let i = 0; i < iterations; i++) {
    const x = center - spread + rng.int(spread * 2);
    const y = center - spread + rng.int(spread * 2);
    const tile = tileAt(island, x, y);
    if (!isSea(tile.kind)) continue;
    if (!hasAdjacent(island, x, y, (t) => !isSea(t.kind))) continue;
    setTile(island, x, y, tile.kind === 'deepSea' ? 'shallow' : 'waste');
  }

  // 陸地の外側1マスは浅瀬にして、海岸線を自然にする
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (tileAt(island, x, y).kind !== 'deepSea') continue;
      if (hasAdjacent(island, x, y, (t) => !isSea(t.kind))) setTile(island, x, y, 'shallow');
    }
  }

  placeFeatures(island, rng, 'forest', 6, 5);
  placeFeatures(island, rng, 'town', 2, 5);
  placeFeatures(island, rng, 'mountain', 2, 0);
  // 何もしなくても序盤に飢えて滅亡しないよう、農場を1つ置く（仕様書18章）
  placeFeatures(island, rng, 'farm', 1, RULES.farmInitial);

  return island;
}

function placeFeatures(
  island: Island,
  rng: Rng,
  kind: 'forest' | 'town' | 'mountain' | 'farm',
  count: number,
  value: number,
): void {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < island.size; y++) {
    for (let x = 0; x < island.size; x++) {
      if (tileAt(island, x, y).kind === 'waste') candidates.push({ x, y });
    }
  }
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const [pick] = candidates.splice(rng.int(candidates.length), 1);
    if (pick) setTile(island, pick.x, pick.y, kind, value);
  }
}
