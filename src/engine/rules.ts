/** M1 のルールの数値（仕様書16章）。数値はすべて仮。 */
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
} as const;
