import { islandStats } from './island';
import { computePower } from './power';
import type { Island } from './types';

/**
 * スコア（仕様書18章の仮の式）。
 * 人口（100人単位）＋ 資金÷100 ＋ 食料÷100 ＋ 農場の規模×2 ＋ 工場の規模 ＋ 陸地の面積×5
 * ＋ 完成した技術×100 ＋ 発電の供給量。滅亡した島は0。
 */
export function islandScore(island: Island): number {
  if (island.destroyed) return 0;
  const s = islandStats(island);
  return Math.floor(
    s.pop +
      island.money / 100 +
      island.food / 100 +
      s.farm * 2 +
      s.factory +
      s.area * 5 +
      island.research.done.length * 100 +
      computePower(island).supply,
  );
}

/** スコアの高い順（同点なら島の並び順） */
export function ranking(islands: Island[]): Island[] {
  return islands
    .map((island, index) => ({ island, index, score: islandScore(island) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.island);
}
