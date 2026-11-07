import { COMMANDS } from './commands';
import type { MissileKind } from './types';
import { generateIsland } from './generate';
import { tileAt } from './island';
import { Rng } from './rng';
import { RULES } from './rules';
import { canResearch } from './tech';
import type { Command, CommandKind, Controller, GameSettings, GameState, Island, TechId } from './types';

export const PLAYER_ISLAND_ID = 'player';

/** AI の島（仕様書18章）。性格はゲームごとに入れ替える */
const AI_ISLANDS = [
  { id: 'ai-north', name: '北の島' },
  { id: 'ai-east', name: '東の島' },
  { id: 'ai-south', name: '南の島' },
] as const;

const AI_CONTROLLERS: readonly Controller[] = ['military', 'economic', 'balanced'];

export const CONTROLLER_NAMES: Record<Controller, string> = {
  player: 'あなた',
  military: '軍事型',
  economic: '内政型',
  balanced: 'バランス型',
};

export const ECONOMIC_TARGET_OPTIONS = [10000, 15000, 20000] as const; // 100万・150万・200万人
export const TURN_LIMIT_OPTIONS = [1000, 2000, 3000] as const;

export const DEFAULT_SETTINGS: GameSettings = { economicTarget: 15000, turnLimit: 2000 };

/** AI の島を3つ作る */
export function generateAiIslands(rng: Rng): Island[] {
  const controllers = rng.permutation(AI_CONTROLLERS.length).map((i) => AI_CONTROLLERS[i]!);
  return AI_ISLANDS.map((ai, i) => generateIsland(rng, ai.id, ai.name, controllers[i]!));
}

export function newGame(seed: number, settings: GameSettings = DEFAULT_SETTINGS, islandName = 'あなたの島'): GameState {
  const rng = new Rng(seed);
  const island = generateIsland(rng, PLAYER_ISLAND_ID, islandName, 'player');
  const ais = generateAiIslands(rng);
  return {
    version: 3,
    turn: 0,
    rngState: rng.state,
    islands: [island, ...ais],
    playerIslandId: PLAYER_ISLAND_ID,
    log: [{ turn: 0, islandId: PLAYER_ISLAND_ID, text: `${islandName}の開発が始まった`, tone: 'info' }],
    nextCommandId: 1,
    settings,
    outcome: null,
  };
}

export function playerIsland(state: GameState): Island {
  const island = state.islands.find((i) => i.id === state.playerIslandId);
  if (!island) throw new Error('プレイヤーの島が見つかりません');
  return island;
}

function updatePlayerQueue(state: GameState, update: (queue: Command[]) => Command[]): GameState {
  return {
    ...state,
    islands: state.islands.map((island) =>
      island.id === state.playerIslandId ? { ...island, queue: update(island.queue) } : island,
    ),
  };
}

/** 予約の position 番目（省略時は末尾）に命令を差し込む。上限を超える分は入れない */
function insertCommands(
  state: GameState,
  make: (id: number, index: number) => Command,
  count: number,
  position?: number,
): { state: GameState; added: number } {
  const room = Math.max(0, RULES.queueMax - playerIsland(state).queue.length);
  const n = Math.min(count, room);
  if (n === 0) return { state, added: 0 };
  const added = Array.from({ length: n }, (_, i) => make(state.nextCommandId + i, i));
  const next = updatePlayerQueue(state, (q) => {
    const at = position === undefined ? q.length : Math.max(0, Math.min(position, q.length));
    return [...q.slice(0, at), ...added, ...q.slice(at)];
  });
  return { state: { ...next, nextCommandId: state.nextCommandId + n }, added: n };
}

/**
 * プレイヤーの命令予約に命令を入れる。
 * position を省略すると末尾。予約の上限を超える分は入れない。
 */
export function enqueueCommand(
  state: GameState,
  kind: CommandKind,
  x: number,
  y: number,
  count = 1,
  position?: number,
): GameState {
  const targeted = COMMANDS[kind].targeted;
  return insertCommands(
    state,
    (id) => ({ id, kind, x: targeted ? x : 0, y: targeted ? y : 0 }),
    count,
    position,
  ).state;
}

/**
 * ミサイルの命令を予約する。shots は1回の命令で撃つ発数（0 は撃てるだけ）。
 */
export function enqueueMissile(
  state: GameState,
  kind: MissileKind,
  targetIslandId: string,
  x: number,
  y: number,
  shots: number,
  position?: number,
): GameState {
  return insertCommands(state, (id) => ({ id, kind, x, y, targetIslandId, count: shots }), 1, position).state;
}

export function removeCommand(state: GameState, commandId: number): GameState {
  return updatePlayerQueue(state, (q) => q.filter((c) => c.id !== commandId));
}

/** 予約の中で命令を delta だけ動かす（-1 で1つ前へ） */
export function moveCommand(state: GameState, commandId: number, delta: number): GameState {
  return updatePlayerQueue(state, (q) => {
    const from = q.findIndex((c) => c.id === commandId);
    if (from < 0) return q;
    const to = Math.max(0, Math.min(q.length - 1, from + delta));
    if (to === from) return q;
    const copy = [...q];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item!);
    return copy;
  });
}

export function clearQueue(state: GameState): GameState {
  return updatePlayerQueue(state, () => []);
}

/** 研究する技術を選ぶ（null で選ばない）。研究できない技術は選べない */
export function setResearch(state: GameState, techId: TechId | null): GameState {
  const island = playerIsland(state);
  if (techId !== null && !canResearch(island, techId)) return state;
  return {
    ...state,
    islands: state.islands.map((i) =>
      i.id === state.playerIslandId ? { ...i, research: { ...i.research, current: techId } } : i,
    ),
  };
}

/** 自動入力の対象になる荒地（上から順。すでに整地か地ならしを予約しているマスは除く） */
export function autoPrepareTargets(island: Island): Array<{ x: number; y: number }> {
  const queued = new Set(
    island.queue
      .filter((c) => c.kind === 'prepare' || c.kind === 'prepareInstant')
      .map((c) => `${c.x},${c.y}`),
  );
  const targets: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < island.size; y++) {
    for (let x = 0; x < island.size; x++) {
      if (tileAt(island, x, y).kind === 'waste' && !queued.has(`${x},${y}`)) targets.push({ x, y });
    }
  }
  return targets;
}

/**
 * 整地自動入力・地ならし自動入力：島のすべての荒地に整地（または地ならし）を予約する。
 * 既存の予約は消さず、空き枠の分だけ入れる。入れた件数を返す。
 */
export function enqueueAutoPrepare(
  state: GameState,
  kind: 'prepare' | 'prepareInstant',
  position?: number,
): { state: GameState; added: number } {
  const targets = autoPrepareTargets(playerIsland(state));
  return insertCommands(
    state,
    (id, i) => ({ id, kind, x: targets[i]!.x, y: targets[i]!.y }),
    targets.length,
    position,
  );
}
