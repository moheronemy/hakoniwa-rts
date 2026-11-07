import { COMMANDS } from './commands';
import { generateIsland } from './generate';
import { Rng } from './rng';
import { RULES } from './rules';
import type { Command, CommandKind, GameState, Island } from './types';

export const PLAYER_ISLAND_ID = 'player';

export function newGame(seed: number, islandName = 'あなたの島'): GameState {
  const rng = new Rng(seed);
  const island = generateIsland(rng, PLAYER_ISLAND_ID, islandName);
  return {
    version: 1,
    turn: 0,
    rngState: rng.state,
    islands: [island],
    playerIslandId: PLAYER_ISLAND_ID,
    log: [{ turn: 0, islandId: PLAYER_ISLAND_ID, text: `${islandName}の開発が始まった`, tone: 'info' }],
    nextCommandId: 1,
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
  const queue = playerIsland(state).queue;
  const room = Math.max(0, RULES.queueMax - queue.length);
  const n = Math.min(count, room);
  if (n === 0) return state;
  const added: Command[] = Array.from({ length: n }, (_, i) => ({
    id: state.nextCommandId + i,
    kind,
    x: targeted ? x : 0,
    y: targeted ? y : 0,
  }));
  const next = updatePlayerQueue(state, (q) => {
    const at = position === undefined ? q.length : Math.max(0, Math.min(position, q.length));
    return [...q.slice(0, at), ...added, ...q.slice(at)];
  });
  return { ...next, nextCommandId: state.nextCommandId + n };
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
