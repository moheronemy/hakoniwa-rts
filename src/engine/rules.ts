/** ルールの数値（仕様書16章・17章）。数値はすべて仮。 */
export const RULES = {
  islandSize: 20,
  initialMoney: 1000,
  initialFood: 500,

  /** 人口1単位（100人）あたりの1ターンの食料消費 */
  foodPerPop: 0.2,

  townMax: 200,
  /** これ以上は「都市」。誘致活動のターンしか伸びない */
  cityThreshold: 100,
  /** 村と町の区切り */
  villageMax: 30,
  townGrowth: 10,
  townGrowthAttract: 30,
  cityGrowthAttract: 3,
  /** 平地が村になる確率の分母 */
  plainsToVillage: 5,
  /** 食料不足のときに住宅地が減る最大値 */
  starveShrink: 30,
  /** 食料不足のとき農場・工場が暴動で壊れる確率の分母 */
  riotChance: 4,

  forestMax: 200,
  treeValue: 5,

  farmInitial: 10,
  farmStep: 2,
  farmMax: 50,
  factoryInitial: 30,
  factoryStep: 10,
  factoryMax: 100,

  raiseFundsIncome: 10,

  queueMax: 40,
  logMax: 300,

  // ---- M2：電力（単位は万kW） ----
  /** 工場の規模1（1,000人分）あたりの消費 */
  powerPerFactory: 1,
  /** 研究所1段階あたりの消費 */
  powerPerLab: 20,
  /** 都市の人口1万人（100人単位で100）あたりの消費 */
  powerPerCityPop100: 5,
  /** 風力：隣に平地か荒地がこの数以上必要 */
  windOpenNeighbors: 2,

  // ---- M2：石油 ----
  oilSearchChance: 0.15,
  oilReserveMin: 200,
  oilReserveMax: 600,
  oilPerField: 5,
  oilPrice: 3,

  // ---- M2：研究 ----
  researchPerLab: 5,
  labMax: 3,
  investPoints: 50,

  // ---- M2：技術の効果 ----
  reclaimCostImproved: 100,
  automationBonus: 0.2,
  bigFarmMax: 80,
  refiningPriceBonus: 0.5,
  refiningFuelSaving: 0.25,
  betterWindBonus: 0.5,
  turbineBonus: 0.25,
  gridSaving: 0.15,
  cityPlanGrowth: 2,
} as const;

/** 発電所の種類ごとの数値 */
export const PLANTS = {
  windPower: { name: '風力発電所', cost: 100, output: 10, maxLevel: 3 },
  hydroPower: { name: '水力発電所', cost: 300, output: 50, maxLevel: 3 },
  thermalPower: { name: '火力発電所', cost: 1000, output: 100, maxLevel: 5 },
  nuclearPower: { name: '原子力発電所', cost: 10000, output: 1000, maxLevel: 2 },
} as const;

export type PlantKind = keyof typeof PLANTS;
