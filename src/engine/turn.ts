import { planAI } from './ai';
import { executeCommand, type TurnEffects } from './commands';
import { runDisasters } from './disasters';
import { incomeBreakdown } from './forecast';
import { hasAdjacent, islandStats, setTile } from './island';
import type { World } from './military';
import { moveMonsters, spawnWildMonster } from './monsters';
import { decaySatellites } from './satellites';
import { computePower, labPoints } from './power';
import { Rng } from './rng';
import { RULES } from './rules';
import { ranking } from './score';
import { addResearchPoints, hasTech, TECHS } from './tech';
import type { GameState, Island, LogEntry, LogTone, Outcome } from './types';

/**
 * 1ターン分の処理（仕様書2章・16章・17章）。入力の state は書き換えず、新しい state を返す。
 */
export function advanceTurn(prev: GameState): GameState {
  if (prev.outcome) return prev; // 勝敗が決まったら進めない
  const state: GameState = structuredClone(prev);
  const rng = new Rng(state.rngState);
  state.turn += 1;
  const turn = state.turn;
  const newLogs: LogEntry[] = [];
  // プレイヤーに関係する出来事だけをログに残す（AI の島の内部の出来事は残さない）。
  // 観戦モードでは、すべての島の攻撃・災害・怪獣・滅亡などを残す
  const record = (entry: LogEntry) => {
    const id = state.playerIslandId;
    const keep = state.spectator
      ? entry.public || entry.notable || (entry.involves?.length ?? 0) > 0
      : entry.islandId === id || entry.public || entry.involves?.includes(id);
    if (keep) newLogs.push(entry);
  };
  const world: World = {
    islands: state.islands,
    turn,
    emit: (e) => record({ ...e, turn }),
    economicTarget: state.settings.economicTarget,
    peaceful: state.settings.peaceful,
  };

  const order = rng.permutation(state.islands.length);
  for (const index of order) {
    const island = state.islands[index];
    if (!island || island.destroyed) continue;
    const log = (text: string, tone: LogTone = 'info', involves?: string[]) =>
      record({ turn, islandId: island.id, text, tone, involves });
    const notableLog = (text: string, tone: LogTone = 'info') =>
      record({ turn, islandId: island.id, text, tone, notable: true });
    if (island.controller !== 'player') planAI(world, island, rng);
    processIsland(island, rng, log, notableLog, world, state.settings.disasterLevel);
  }

  updateDestruction(state, record);
  if (state.settings.peaceful) recordMilestones(state, record);
  state.outcome = checkOutcome(state);
  if (state.outcome) {
    record({ turn, islandId: state.playerIslandId, text: state.outcome.reason, tone: state.outcome.result === 'win' ? 'good' : 'bad', public: true });
  }

  state.rngState = rng.state;
  state.log = [...state.log, ...newLogs].slice(-RULES.logMax);
  return state;
}

/** 人口0が続いた島と、陸地がなくなった島を滅亡させる */
function updateDestruction(state: GameState, record: (entry: LogEntry) => void): void {
  for (const island of state.islands) {
    if (island.destroyed) continue;
    const { pop, area } = islandStats(island);
    island.emptyTurns = pop === 0 ? island.emptyTurns + 1 : 0;
    if (area === 0 || island.emptyTurns >= RULES.emptyTurnsToDestroy) {
      island.destroyed = true;
      island.queue = [];
      record({ turn: state.turn, islandId: island.id, text: `${island.name}が滅亡した`, tone: 'bad', public: true });
    }
  }
}

/** 勝敗の判定（仕様書18章）。決まらなければ null */
export function checkOutcome(state: GameState): Outcome | null {
  // 平和モードでは勝利条件でゲームは終わらない（自分の島の滅亡だけで終わる。観戦は終わらない）
  if (state.settings.peaceful) {
    if (state.spectator) return null;
    const me = state.islands.find((i) => i.id === state.playerIslandId)!;
    return me.destroyed ? { result: 'lose', winnerId: null, reason: 'あなたの島が滅亡した', turn: state.turn } : null;
  }
  if (state.spectator) return spectatorOutcome(state);
  const player = state.islands.find((i) => i.id === state.playerIslandId)!;
  const turn = state.turn;
  const lose = (winnerId: string | null, reason: string): Outcome => ({ result: 'lose', winnerId, reason, turn });
  const win = (reason: string): Outcome => ({ result: 'win', winnerId: player.id, reason, turn });

  if (player.destroyed) return lose(null, 'あなたの島が滅亡した');

  const alive = state.islands.filter((i) => !i.destroyed);
  const reached = alive
    .map((island) => ({ island, pop: islandStats(island).pop }))
    .filter((r) => r.pop >= state.settings.economicTarget)
    .sort((a, b) => b.pop - a.pop);
  if (reached.length > 0) {
    const winner = reached[0]!.island;
    return winner.id === player.id
      ? win('経済的制覇を達成した！')
      : lose(winner.id, `${winner.name}が経済的制覇を達成した`);
  }

  if (state.islands.length > 1 && alive.length === 1) return win('軍事的制覇を達成した！');

  if (turn >= state.settings.turnLimit) {
    const top = ranking(alive)[0]!;
    return top.id === player.id
      ? win('期限を迎え、スコア1位で勝利した！')
      : lose(top.id, `期限を迎え、${top.name}がスコア1位になった`);
  }
  return null;
}

/**
 * 平和モード：勝利条件を満たしたことを、1回だけ記録してログで知らせる（ゲームは続く）。
 */
function recordMilestones(state: GameState, record: (entry: LogEntry) => void): void {
  const milestones = (state.milestones ??= []);
  const reached = new Set(milestones.map((m) => m.key));
  const isPlayer = (island: Island) => !state.spectator && island.id === state.playerIslandId;
  const add = (key: string, island: Island, text: string, tone: LogTone) => {
    if (reached.has(key)) return;
    reached.add(key);
    milestones.push({ key, text, turn: state.turn });
    record({ turn: state.turn, islandId: island.id, text, tone, public: true });
  };
  const target = state.settings.economicTarget;
  const targetText = `${(target * 100).toLocaleString('ja-JP')}人`;
  const alive = state.islands.filter((i) => !i.destroyed);

  for (const island of alive) {
    if (islandStats(island).pop < target) continue;
    add(
      `economic:${island.id}`,
      island,
      isPlayer(island)
        ? `経済的制覇の条件（人口${targetText}）を達成した！ 平和モードなので、このまま続けられる`
        : `${island.name}が経済的制覇の目標人口（${targetText}）に届いた`,
      isPlayer(island) ? 'good' : 'info',
    );
  }
  if (state.islands.length > 1 && alive.length === 1) {
    const last = alive[0]!;
    add(`military:${last.id}`, last, isPlayer(last) ? '他の島がすべて滅亡し、最後の島として残った' : `${last.name}だけが残った`, 'info');
  }
  if (state.turn === state.settings.turnLimit && alive.length > 0) {
    const top = ranking(alive)[0]!;
    add(
      'deadline',
      top,
      isPlayer(top)
        ? `期限の${state.settings.turnLimit}ターンを、スコア1位で迎えた！ 平和モードなので、このまま続けられる`
        : `期限の${state.settings.turnLimit}ターンを迎えた。スコア1位は${top.name}`,
      isPlayer(top) ? 'good' : 'info',
    );
  }
}

/** 観戦モードの決着。勝った島を winnerId に入れる（result は使わない） */
function spectatorOutcome(state: GameState): Outcome | null {
  const turn = state.turn;
  const done = (winner: Island, reason: string): Outcome => ({ result: 'win', winnerId: winner.id, reason, turn });
  const alive = state.islands.filter((i) => !i.destroyed);
  if (alive.length === 0) return { result: 'win', winnerId: null, reason: 'すべての島が滅亡した', turn };
  const reached = alive
    .map((island) => ({ island, pop: islandStats(island).pop }))
    .filter((r) => r.pop >= state.settings.economicTarget)
    .sort((a, b) => b.pop - a.pop);
  if (reached.length > 0) return done(reached[0]!.island, `${reached[0]!.island.name}が経済的制覇を達成した`);
  if (alive.length === 1) return done(alive[0]!, `${alive[0]!.name}が軍事的制覇を達成した`);
  if (turn >= state.settings.turnLimit) {
    const top = ranking(alive)[0]!;
    return done(top, `期限を迎え、${top.name}がスコア1位になった`);
  }
  return null;
}

type Logger = (text: string, tone?: LogTone, involves?: string[]) => void;
type NotableLogger = (text: string, tone?: LogTone) => void;

function processIsland(
  island: Island,
  rng: Rng,
  log: Logger,
  notableLog: NotableLogger,
  world: World,
  disasterLevel: number,
): void {
  // 電力：火力発電の燃料を使い、供給率を決める（このターンの効率に使う）
  const power = computePower(island);
  island.oil -= power.fuelUsed;
  // 石油が切れたターンにだけ知らせる（足りない状態が続く間、毎ターン出さない）
  if (power.fuelUsed > 0 && power.fuelUsed < power.fuelNeed) log('石油が尽きて、火力発電所の出力が落ちた', 'bad');

  collectIncome(island, power.ratio);
  produceOil(island, log);
  const effects = runCommands(island, rng, log, world);
  doResearch(island, power.ratio, log);
  decaySatellites(island, notableLog);
  dropLostBreeding(island);
  moveMonsters(island, rng, world.turn, notableLog);
  grow(island, rng, effects, power.ratio);
  // 序盤の保護の間は、災害も野生の怪獣も起きない（操作を覚える前に壊滅しないように）
  if (world.turn > RULES.protectionTurns) {
    runDisasters(island, rng, disasterLevel, notableLog);
    spawnWildMonster(island, rng, disasterLevel, notableLog);
  }
  handleFoodShortage(island, rng, notableLog, world.turn > RULES.protectionTurns);
}

/** 怪獣研究所が壊れたら、そこで育てていた怪獣もいなくなる */
function dropLostBreeding(island: Island): void {
  island.breeding = island.breeding.filter((b) => island.tiles[b.y * island.size + b.x]?.kind === 'monsterLab');
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
function runCommands(island: Island, rng: Rng, log: Logger, world: World): TurnEffects {
  const effects: TurnEffects = { attract: false };
  const ctx = { effects, rng, world };
  while (island.queue.length > 0) {
    const command = island.queue.shift()!;
    const result = executeCommand(island, command.kind, command.x, command.y, ctx, {
      targetIslandId: command.targetIslandId,
      count: command.count,
      monster: command.monster,
      satellite: command.satellite,
    });
    if (!result.ok) {
      log(result.message, 'bad');
      continue;
    }
    log(result.message, result.tone, command.targetIslandId ? [command.targetIslandId] : undefined);
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

/**
 * 食料不足：食料を0に戻し、農場と工場が暴動で壊れることがある。
 * 序盤の保護の間は暴動は起きない（農場が1つしかない初期の島が、操作を覚える前に飢えて滅亡しないように）。
 */
function handleFoodShortage(island: Island, rng: Rng, log: Logger, riots: boolean): void {
  if (island.food >= 0) return;
  island.food = 0;
  log('食料が不足している！ 人口が減っている', 'bad');
  if (!riots) return;
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

