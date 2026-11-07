import { executeCommand, type TurnEffects } from './commands';
import { hasAdjacent, islandStats, setTile } from './island';
import { Rng } from './rng';
import { RULES } from './rules';
import type { GameState, Island, LogEntry, LogTone } from './types';

/**
 * 1ターン分の処理（仕様書2章・16章）。入力の state は書き換えず、新しい state を返す。
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
  collectIncome(island);
  const effects = runCommands(island, log);
  grow(island, rng, effects);
  handleFoodShortage(island, rng, log);
}

/** 収入と食料の消費 */
export function collectIncome(island: Island): void {
  const { pop, farm, factory } = islandStats(island);
  const farmWorkers = Math.min(pop, farm * 10);
  island.food += farmWorkers;
  const factoryWorkers = Math.min(pop - farmWorkers, factory * 10);
  island.money += Math.floor(factoryWorkers / 10);
  island.food = Math.floor(island.food - pop * RULES.foodPerPop);
}

/**
 * 予約の先頭から命令を実行する。ターンを消費する命令を1つ実行したら終わる。
 * 実行できなかった命令と即時命令はターンを消費せず、次の命令に進む。
 */
function runCommands(island: Island, log: Logger): TurnEffects {
  const effects: TurnEffects = { attract: false };
  while (island.queue.length > 0) {
    const command = island.queue.shift()!;
    const result = executeCommand(island, command.kind, command.x, command.y, effects);
    if (!result.ok) {
      log(result.message, 'bad');
      continue;
    }
    log(result.message, 'good');
    if (result.consumedTurn) return effects;
  }
  // 予約が空になった（または最初から空だった）ので資金繰り
  const result = executeCommand(island, 'raiseFunds', 0, 0, effects);
  log(`（予約なし）${result.message}`);
  return effects;
}

/** 住宅地・平地・森の成長。食料が足りないときは住宅地が縮む */
function grow(island: Island, rng: Rng, effects: TurnEffects): void {
  const starving = island.food < 0;
  const addPop = effects.attract ? RULES.townGrowthAttract : RULES.townGrowth;
  const addCity = effects.attract ? RULES.cityGrowthAttract : 0;

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

