import { DEFAULT_SETTINGS, newGame } from './game';
import { islandStats } from './island';
import { advanceTurn } from './turn';
import type { Controller, GameSettings } from './types';

/**
 * バランス調整用の自動対戦（仕様書20章）。プレイヤーの島は何もしない（予約が空のまま）。
 * プレイヤーの勝敗では止めず、AI のどれかが制覇するか、期限が来るまで進める。
 */
export interface SimResult {
  seed: number;
  /** 決着したターン（期限まで決着しなければ期限のターン） */
  turn: number;
  result: 'economic' | 'military' | 'deadline';
  /** 制覇した AI の性格（期限ならスコア1位の性格） */
  winner: Controller | null;
  /** 滅亡した AI の島（ターンと性格） */
  destroyed: Array<{ turn: number; controller: Controller }>;
  /** 一定ターンごとの AI の人口（100人単位、性格ごと） */
  pops: Array<{ turn: number; byController: Partial<Record<Controller, number>> }>;
}

export function simulateGame(seed: number, settings: GameSettings = DEFAULT_SETTINGS, sampleEvery = 250): SimResult {
  let state = newGame(seed, settings);
  const destroyed: SimResult['destroyed'] = [];
  const pops: SimResult['pops'] = [];
  const ais = () => state.islands.filter((i) => i.controller !== 'player');

  for (let t = 1; t <= settings.turnLimit; t++) {
    const before = state.islands.map((i) => i.destroyed);
    // プレイヤーの勝敗で止まらないように、毎ターン勝敗を消してから進める
    state = advanceTurn({ ...state, outcome: null });
    state.islands.forEach((island, k) => {
      if (island.destroyed && !before[k] && island.controller !== 'player') {
        destroyed.push({ turn: t, controller: island.controller });
      }
    });
    if (t % sampleEvery === 0) {
      pops.push({
        turn: t,
        byController: Object.fromEntries(ais().map((i) => [i.controller, islandStats(i).pop])),
      });
    }

    const alive = ais().filter((i) => !i.destroyed);
    const rich = alive
      .map((i) => ({ i, pop: islandStats(i).pop }))
      .filter((r) => r.pop >= settings.economicTarget)
      .sort((a, b) => b.pop - a.pop)[0];
    if (rich) return { seed, turn: t, result: 'economic', winner: rich.i.controller, destroyed, pops };
    if (alive.length === 1) return { seed, turn: t, result: 'military', winner: alive[0]!.controller, destroyed, pops };
  }

  const top = ais()
    .filter((i) => !i.destroyed)
    .map((i) => ({ i, pop: islandStats(i).pop }))
    .sort((a, b) => b.pop - a.pop)[0];
  return { seed, turn: settings.turnLimit, result: 'deadline', winner: top?.i.controller ?? null, destroyed, pops };
}

/** 結果をまとめた1行の文字列 */
export function summarizeSims(results: SimResult[]): string {
  const turns = results.map((r) => r.turn).sort((a, b) => a - b);
  const median = turns[Math.floor(turns.length / 2)];
  const count = (pred: (r: SimResult) => boolean) => results.filter(pred).length;
  const winners: Record<string, number> = {};
  for (const r of results) winners[`${r.result}:${r.winner}`] = (winners[`${r.result}:${r.winner}`] ?? 0) + 1;
  return [
    `games=${results.length}`,
    `median turn=${median}`,
    `range=${turns[0]}-${turns[turns.length - 1]}`,
    `economic=${count((r) => r.result === 'economic')}`,
    `military=${count((r) => r.result === 'military')}`,
    `deadline=${count((r) => r.result === 'deadline')}`,
    `winners=${JSON.stringify(winners)}`,
  ].join(' ');
}
