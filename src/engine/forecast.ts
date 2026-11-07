import { islandStats } from './island';
import { computePower, labPoints, oilProduction, type PowerReport } from './power';
import { RULES } from './rules';
import { hasTech } from './tech';
import type { Island } from './types';

export interface Forecast {
  /** 次のターンの収入（命令・資金繰りを除く） */
  money: number;
  /** 次のターンの食料の増減 */
  food: number;
  /** 次のターンの石油の増減（産出 − 火力の燃料） */
  oil: number;
  /** 次のターンの研究ポイント（研究所の分） */
  research: number;
  power: PowerReport;
}

/** 収入と食料の収支（1ターンの処理と画面の見込みの両方で使う） */
export function incomeBreakdown(island: Island, powerRatio: number): { money: number; food: number } {
  const { pop, farm, factory } = islandStats(island);
  const farmWorkers = Math.min(pop, farm * 10);
  const factoryWorkers = Math.min(pop - farmWorkers, factory * 10);
  const bonus = hasTech(island, 'automation') ? 1 + RULES.automationBonus : 1;
  return {
    money: Math.floor((factoryWorkers / 10) * powerRatio * bonus),
    food: farmWorkers - pop * RULES.foodPerPop,
  };
}

/** 画面に出す「1ターンあたりの増減」の見込み */
export function forecast(island: Island): Forecast {
  const power = computePower(island);
  const income = incomeBreakdown(island, power.ratio);
  return {
    money: income.money,
    food: Math.floor(income.food),
    oil: oilProduction(island) - power.fuelUsed,
    research: labPoints(island) * power.ratio,
    power,
  };
}
