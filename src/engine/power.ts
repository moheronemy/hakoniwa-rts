import { PLANTS, RULES } from './rules';
import { hasTech } from './tech';
import type { Island } from './types';

export interface PowerReport {
  /** 供給（万kW） */
  supply: number;
  /** 需要（万kW） */
  demand: number;
  /** 供給率（0〜1）。需要が0なら1 */
  ratio: number;
  /** 火力発電が必要とする石油 */
  fuelNeed: number;
  /** 実際に使う石油（持っている分まで） */
  fuelUsed: number;
}

/**
 * 島の電力の収支を計算する（仕様書17章）。島は書き換えない。
 * 火力発電は石油が足りない分だけ出力が下がる。
 */
export function computePower(island: Island): PowerReport {
  let wind = 0;
  let hydro = 0;
  let thermalLevels = 0;
  let nuclear = 0;
  let factory = 0;
  let labs = 0;
  let cityPop = 0;

  for (const tile of island.tiles) {
    switch (tile.kind) {
      case 'windPower':
        wind += tile.value * PLANTS.windPower.output;
        break;
      case 'hydroPower':
        hydro += tile.value * PLANTS.hydroPower.output;
        break;
      case 'thermalPower':
        thermalLevels += tile.value;
        break;
      case 'nuclearPower':
        nuclear += tile.value * PLANTS.nuclearPower.output;
        break;
      case 'factory':
        factory += tile.value;
        break;
      case 'lab':
        labs += tile.value;
        break;
      case 'town':
        if (tile.value >= RULES.cityThreshold) cityPop += tile.value;
        break;
      default:
        break;
    }
  }

  const fuelPerLevel = hasTech(island, 'refining') ? 1 - RULES.refiningFuelSaving : 1;
  const fuelNeed = thermalLevels * fuelPerLevel;
  const fuelUsed = Math.min(fuelNeed, Math.max(0, island.oil));
  const fuelScale = fuelNeed > 0 ? fuelUsed / fuelNeed : 1;

  const windBonus = hasTech(island, 'betterWind') ? 1 + RULES.betterWindBonus : 1;
  const turbineBonus = hasTech(island, 'turbine') ? 1 + RULES.turbineBonus : 1;
  const thermal = thermalLevels * PLANTS.thermalPower.output * fuelScale;
  const supply = wind * windBonus + (hydro + thermal) * turbineBonus + nuclear;

  const gridFactor = hasTech(island, 'grid') ? 1 - RULES.gridSaving : 1;
  const demand =
    (factory * RULES.powerPerFactory +
      labs * RULES.powerPerLab +
      (cityPop / 100) * RULES.powerPerCityPop100) *
    gridFactor;

  const ratio = demand <= 0 ? 1 : Math.min(1, supply / demand);
  return { supply, demand, ratio, fuelNeed, fuelUsed };
}

/** 研究所が1ターンに生む研究ポイント（電力の供給率を掛ける前） */
export function labPoints(island: Island): number {
  let labs = 0;
  for (const tile of island.tiles) if (tile.kind === 'lab') labs += tile.value;
  return labs * RULES.researchPerLab;
}

/** 海上油田が1ターンに産出する石油の合計 */
export function oilProduction(island: Island): number {
  let total = 0;
  for (const tile of island.tiles) {
    if (tile.kind === 'oilField') total += Math.min(RULES.oilPerField, tile.value);
  }
  return total;
}
