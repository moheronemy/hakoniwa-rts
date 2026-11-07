import { executeCommand, type TurnEffects } from './commands';
import { incomeBreakdown } from './forecast';
import { hasAdjacent, setTile } from './island';
import { computePower, labPoints } from './power';
import { Rng } from './rng';
import { RULES } from './rules';
import { addResearchPoints, hasTech, TECHS } from './tech';
import type { GameState, Island, LogEntry, LogTone } from './types';

/**
 * 1ターン分の処理（仕様書2章・16章・17章）。入力の state は書き換えず、新しい state を返す。
 */
export function advanceTurn(prev: GameState): GameState {
  const state: GameState = structuredClone(prev);
  const rng = new Rng(state.rngState);
  state.turn += 1;
  const turn = state.turn;
  const newLogs: LogEntry[] = [];

  const order = rng.permutation(state.islands.length);
  for (const index of order) {
    const island = state.islands[index];
    if (!island) continue;
    const log = (text: string, tone: LogTone = 'info') =>
      newLogs.push({ turn, islandId: island.id, text, tone });
    processIsland(island, rng, log);
  }

  state.rngState = rng.state;
  state.log = [...state.log, ...newLogs].slice(-RULES.logMax);
  return state;
}

type Logger = (text: string, tone?: LogTone) => void;

function processIsland(island: Island, rng: Rng, log: Logger): void {
  // 電力：火力発電の燃料を使い、供給率を決める（このターンの効率に使う）
  const power = computePower(island);
  island.oil -= power.fuelUsed;
  // 石油が切れたターンにだけ知らせる（足りない状態が続く間、毎ターン出さない）
  if (power.fuelUsed > 0 && power.fuelUsed < power.fuelNeed) log('石油が尽きて、火力発電所の出力が落ちた', 'bad');

  collectIncome(island, power.ratio);
  produceOil(island, log);
  const effects = runCommands(island, rng, log);
  doResearch(island, power.ratio, log);
  grow(island, rng, effects, power.ratio);
  handleFoodShortage(island, rng, log);
}

/** 収入と食料の消費。工場の収入には電力の供給率と研究の効果を掛ける */
export function collectIncome(island: Island, powerRatio = 1): void {
  const income = incomeBreakdown(island, powerRatio);
  island.money += income.money;
  island.food = Math.floor(island.food + income.food);
}

/** 海上油田が石油を産出する。埋蔵量がなくなった油田は海に戻る */
function produceOil(island: Island, log: Logger): void {
  for (let index = 0; index < island.tiles.length; index++) {
    const tile = island.tiles[index]!;
    if (tile.kind !== 'oilField') continue;
    const amount = Math.min(RULES.oilPerField, tile.value);
    island.oil += amount;
    tile.value -= amount;
    if (tile.value <= 0) {
      const x = index % island.size;
      const y = Math.floor(index / island.size);
      setTile(island, x, y, 'deepSea');
      log(`(${x}, ${y}) の油田が枯れた`, 'bad');
    }
  }
}

/** 研究所の研究ポイントを加え、研究中の技術に注ぐ */
function doResearch(island: Island, powerRatio: number, log: Logger): void {
  const completed = addResearchPoints(island, labPoints(island) * powerRatio);
  if (completed) log(`研究「${TECHS[completed].name}」が完成した！`, 'good');
}

/**
 * 予約の先頭から命令を実行する。ターンを消費する命令を1つ実行したら終わる。
 * 実行できなかった命令と即時命令はターンを消費せず、次の命令に進む。
 */
function runCommands(island: Island, rng: Rng, log: Logger): TurnEffects {
  const effects: TurnEffects = { attract: false };
  const ctx = { effects, rng };
  while (island.queue.length > 0) {
    const command = island.queue.shift()!;
    const result = executeCommand(island, command.kind, command.x, command.y, ctx);
    if (!result.ok) {
      log(result.message, 'bad');
      continue;
    }
    log(result.message, result.tone);
    if (result.consumedTurn) return effects;
  }
  // 予約が空になった（または最初から空だった）ので資金繰り
  const result = executeCommand(island, 'raiseFunds', 0, 0, ctx);
  log(`（予約なし）${result.message}`);
  return effects;
}

/**
 * 住宅地・平地・森の成長。食料が足りないときは住宅地が縮む。
 * 都市は誘致活動のターン（研究「都市計画」があれば毎ターン）に伸びるが、電力が足りないと伸びない。
 */
function grow(island: Island, rng: Rng, effects: TurnEffects, powerRatio: number): void {
  const starving = island.food < 0;
  const addPop = effects.attract ? RULES.townGrowthAttract : RULES.townGrowth;
  const cityGrowth = effects.attract
    ? RULES.cityGrowthAttract
    : hasTech(island, 'cityPlan')
      ? RULES.cityPlanGrowth
      : 0;
  const addCity = powerRatio >= 1 ? cityGrowth : 0;

  for (const index of rng.permutation(island.tiles.length)) {
    const tile = island.tiles[index]!;
    const x = index % island.size;
    const y = Math.floor(index / island.size);

    switch (tile.kind) {
      case 'town': {
        if (starving) {
          tile.value -= rng.int(RULES.starveShrink) + 1;
          if (tile.value <= 0) setTile(island, x, y, 'plains');
        } else if (tile.value < RULES.cityThreshold) {
          tile.value = Math.min(RULES.cityThreshold, tile.value + rng.int(addPop) + 1);
        } else if (addCity > 0) {
          tile.value = Math.min(RULES.townMax, tile.value + rng.int(addCity) + 1);
        }
        break;
      }
      case 'plains': {
        if (starving) break;
        if (rng.int(RULES.plainsToVillage) !== 0) break;
        if (hasAdjacent(island, x, y, (t) => t.kind === 'town' || t.kind === 'farm')) {
          setTile(island, x, y, 'town', 1);
        }
        break;
      }
      case 'forest':
        tile.value = Math.min(RULES.forestMax, tile.value + 1);
        break;
      default:
        break;
    }
  }
}

/** 食料不足：食料を0に戻し、農場と工場が暴動で壊れることがある */
function handleFoodShortage(island: Island, rng: Rng, log: Logger): void {
  if (island.food >= 0) return;
  island.food = 0;
  log('食料が不足している！ 人口が減っている', 'bad');
  for (let index = 0; index < island.tiles.length; index++) {
    const tile = island.tiles[index]!;
    if (tile.kind !== 'farm' && tile.kind !== 'factory') continue;
    if (rng.int(RULES.riotChance) !== 0) continue;
    const x = index % island.size;
    const y = Math.floor(index / island.size);
    const name = tile.kind === 'farm' ? '農場' : '工場';
    setTile(island, x, y, 'waste');
    log(`(${x}, ${y}) の${name}が暴動で壊滅した`, 'bad');
  }
}

