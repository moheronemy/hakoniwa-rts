import { describe, expect, it } from 'vitest';
import { executeCommand, targetProblem, type CommandContext } from './commands';
import {
  autoPrepareTargets,
  clearQueue,
  enqueueAutoPrepare,
  enqueueCommand,
  moveCommand,
  DEFAULT_SETTINGS,
  newGame,
  playerIsland,
  removeCommand,
} from './game';
import { generateIsland } from './generate';
import { neighbors } from './hex';
import { islandStats, isSea, setTile, tileAt } from './island';
import { Rng } from './rng';
import { RULES } from './rules';
import { deserialize, serialize } from './save';
import { newResearch } from './tech';
import { advanceTurn, collectIncome } from './turn';
import type { GameState, Island } from './types';

/** すべて深い海の小さな島（テスト用） */
function emptyIsland(size = 6): Island {
  return {
    id: 'test',
    name: 'テスト島',
    size,
    tiles: Array.from({ length: size * size }, () => ({ kind: 'deepSea' as const, value: 0 })),
    money: 1000,
    food: 1000,
    oil: 0,
    research: newResearch(),
    queue: [],
    controller: 'player',
    destroyed: false,
    emptyTurns: 0,
    lastAttackedBy: null,
    breeding: [],
  };
}

function ctx(seed = 1): CommandContext {
  return { effects: { attract: false }, rng: new Rng(seed) };
}

function stateWith(island: Island): GameState {
  return {
    version: 4,
    turn: 0,
    rngState: 42,
    islands: [island],
    playerIslandId: island.id,
    log: [],
    nextCommandId: 1,
    settings: DEFAULT_SETTINGS,
    outcome: null,
  };
}

describe('Rng', () => {
  it('同じシードなら同じ乱数列になる', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const seqA = Array.from({ length: 5 }, () => a.int(1000));
    const seqB = Array.from({ length: 5 }, () => b.int(1000));
    expect(seqA).toEqual(seqB);
  });

  it('permutation は 0..n-1 をちょうど1回ずつ含む', () => {
    const p = new Rng(1).permutation(50);
    expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });
});

describe('hex.neighbors', () => {
  it('偶数行と奇数行で隣のマスがずれる', () => {
    const sortKey = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).sort();
    expect(sortKey(neighbors(10, 4, 4))).toEqual(sortKey([
      { x: 3, y: 4 }, { x: 5, y: 4 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 5 }, { x: 4, y: 5 },
    ]));
    expect(sortKey(neighbors(10, 4, 5))).toEqual(sortKey([
      { x: 3, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 6 }, { x: 5, y: 6 },
    ]));
  });

  it('島の外のマスは含めない', () => {
    expect(neighbors(10, 0, 0)).toHaveLength(2);
  });
});

describe('generateIsland', () => {
  it('同じシードなら同じ島になり、中央は陸地になる', () => {
    const a = generateIsland(new Rng(7), 'a', 'A');
    const b = generateIsland(new Rng(7), 'a', 'A');
    expect(a.tiles).toEqual(b.tiles);
    expect(isSea(tileAt(a, 10, 10).kind)).toBe(false);
    expect(a.tiles).toHaveLength(RULES.islandSize * RULES.islandSize);
  });

  it('村2つ・山2つ・森6つを置く', () => {
    const island = generateIsland(new Rng(99), 'a', 'A');
    const count = (kind: string) => island.tiles.filter((t) => t.kind === kind).length;
    expect(count('town')).toBe(2);
    expect(count('mountain')).toBe(2);
    expect(count('forest')).toBe(6);
  });
});

describe('collectIncome', () => {
  it('農場で働いた人数ぶん食料が増え、残りが工場で働いて資金になる', () => {
    const island = emptyIsland();
    setTile(island, 0, 0, 'town', 100); // 人口 1万人
    setTile(island, 1, 0, 'farm', 4); // 4,000人分
    setTile(island, 2, 0, 'factory', 3); // 3,000人分
    island.money = 0;
    island.food = 0;
    collectIncome(island);
    // 農場 40単位、工場 min(60, 30) = 30単位 → 3億円、食料 40 - 100*0.2 = 20
    expect(island.money).toBe(3);
    expect(island.food).toBe(20);
  });
});

describe('命令', () => {
  it('整地は費用を払って平地にする', () => {
    const island = emptyIsland();
    setTile(island, 2, 2, 'waste');
    const result = executeCommand(island, 'prepare', 2, 2, ctx());
    expect(result.ok).toBe(true);
    expect(tileAt(island, 2, 2).kind).toBe('plains');
    expect(island.money).toBe(1000 - 5);
  });

  it('埋め立ては隣に陸地がないと使えない', () => {
    const island = emptyIsland();
    expect(targetProblem(island, 'reclaim', 3, 3)).not.toBeNull();
    setTile(island, 2, 3, 'waste');
    expect(targetProblem(island, 'reclaim', 3, 3)).toBeNull();
  });

  it('農場は重ねると規模が上がり、最大を超えない', () => {
    const island = emptyIsland();
    setTile(island, 1, 1, 'plains');
    executeCommand(island, 'farm', 1, 1, ctx());
    expect(tileAt(island, 1, 1)).toEqual({ kind: 'farm', value: RULES.farmInitial });
    executeCommand(island, 'farm', 1, 1, ctx());
    expect(tileAt(island, 1, 1).value).toBe(RULES.farmInitial + RULES.farmStep);
    tileAt(island, 1, 1).value = RULES.farmMax;
    expect(executeCommand(island, 'farm', 1, 1, ctx()).ok).toBe(false);
  });

  it('資金が足りなければ実行しない', () => {
    const island = emptyIsland();
    setTile(island, 0, 0, 'plains');
    island.money = 10;
    const result = executeCommand(island, 'factory', 0, 0, ctx());
    expect(result.ok).toBe(false);
    expect(island.money).toBe(10);
    expect(tileAt(island, 0, 0).kind).toBe('plains');
  });
});

describe('advanceTurn', () => {
  function islandForTurns(): Island {
    const island = emptyIsland();
    for (let x = 0; x < 6; x++) setTile(island, x, 0, 'waste');
    return island;
  }

  it('1ターンに実行する命令は1つだけ', () => {
    let state = stateWith(islandForTurns());
    state = enqueueCommand(state, 'prepare', 0, 0);
    state = enqueueCommand(state, 'prepare', 1, 0);
    const next = advanceTurn(state);
    const island = playerIsland(next);
    expect(tileAt(island, 0, 0).kind).toBe('plains');
    expect(tileAt(island, 1, 0).kind).toBe('waste');
    expect(island.queue).toHaveLength(1);
    expect(next.turn).toBe(1);
  });

  it('実行できなかった命令はターンを消費せず、次の命令が同じターンに実行される', () => {
    let state = stateWith(islandForTurns());
    state = enqueueCommand(state, 'plant', 0, 0); // 荒地には植林できない
    state = enqueueCommand(state, 'prepare', 1, 0);
    const island = playerIsland(advanceTurn(state));
    expect(tileAt(island, 1, 0).kind).toBe('plains');
    expect(island.queue).toHaveLength(0);
  });

  it('地ならしはターンを消費しないので、続く命令も同じターンに実行される', () => {
    let state = stateWith(islandForTurns());
    state = enqueueCommand(state, 'prepareInstant', 0, 0);
    state = enqueueCommand(state, 'prepareInstant', 1, 0);
    state = enqueueCommand(state, 'prepare', 2, 0);
    state = enqueueCommand(state, 'prepare', 3, 0);
    const island = playerIsland(advanceTurn(state));
    expect([0, 1, 2, 3].map((x) => tileAt(island, x, 0).kind)).toEqual(['plains', 'plains', 'plains', 'waste']);
  });

  it('予約が空なら資金繰りになる', () => {
    const state = stateWith(islandForTurns());
    const island = playerIsland(advanceTurn(state));
    expect(island.money).toBe(1000 + RULES.raiseFundsIncome);
  });

  it('食料が足りないと住宅地が縮み、食料は0に戻る', () => {
    const island = islandForTurns();
    setTile(island, 0, 0, 'town', 100);
    island.food = 0;
    const next = playerIsland(advanceTurn(stateWith(island)));
    expect(next.food).toBe(0);
    expect(islandStats(next).pop).toBeLessThan(100);
  });

  it('入力の state を書き換えない', () => {
    let state = stateWith(islandForTurns());
    state = enqueueCommand(state, 'prepare', 0, 0);
    const snapshot = structuredClone(state);
    advanceTurn(state);
    expect(state).toEqual(snapshot);
  });

  it('同じ state からは同じ結果になる', () => {
    const state = newGame(2024);
    expect(advanceTurn(advanceTurn(state))).toEqual(advanceTurn(advanceTurn(state)));
  });

  it('村は食料が足りていれば育つが、都市は誘致活動のターンしか伸びない', () => {
    const island = islandForTurns();
    setTile(island, 0, 0, 'town', 10);
    setTile(island, 5, 0, 'town', RULES.cityThreshold);
    setTile(island, 2, 3, 'windPower', 1); // 都市の電力をまかなう
    island.food = 100000;
    let state = stateWith(island);
    state = advanceTurn(state);
    expect(tileAt(playerIsland(state), 0, 0).value).toBeGreaterThan(10);
    expect(tileAt(playerIsland(state), 5, 0).value).toBe(RULES.cityThreshold);
    state = enqueueCommand(state, 'attract', 0, 0);
    state = advanceTurn(state);
    expect(tileAt(playerIsland(state), 5, 0).value).toBeGreaterThan(RULES.cityThreshold);
  });
});

describe('命令予約の操作', () => {
  it('挿入・移動・削除・全消去', () => {
    let state = stateWith(emptyIsland());
    state = enqueueCommand(state, 'raiseFunds', 0, 0, 2);
    state = enqueueCommand(state, 'attract', 0, 0, 1, 0);
    const ids = () => playerIsland(state).queue.map((c) => c.kind);
    expect(ids()).toEqual(['attract', 'raiseFunds', 'raiseFunds']);
    const first = playerIsland(state).queue[0]!.id;
    state = moveCommand(state, first, 1);
    expect(ids()).toEqual(['raiseFunds', 'attract', 'raiseFunds']);
    state = removeCommand(state, first);
    expect(ids()).toEqual(['raiseFunds', 'raiseFunds']);
    state = clearQueue(state);
    expect(ids()).toEqual([]);
  });

  it('予約の上限を超えて入れない', () => {
    let state = stateWith(emptyIsland());
    state = enqueueCommand(state, 'raiseFunds', 0, 0, RULES.queueMax + 5);
    expect(playerIsland(state).queue).toHaveLength(RULES.queueMax);
  });
});

describe('セーブ', () => {
  it('書き出して読み込むと元に戻る', () => {
    const state = advanceTurn(newGame(5));
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('別の形式のデータは読み込まない', () => {
    expect(() => deserialize('{"foo":1}')).toThrow();
    expect(() => deserialize('not json')).toThrow();
  });
});

describe('整地自動入力', () => {
  function islandWithWaste(): Island {
    const island = emptyIsland();
    setTile(island, 1, 0, 'waste');
    setTile(island, 3, 2, 'waste');
    setTile(island, 0, 4, 'waste');
    setTile(island, 2, 2, 'plains');
    return island;
  }

  it('すべての荒地に、上から順に整地を予約する', () => {
    const { state, added } = enqueueAutoPrepare(stateWith(islandWithWaste()), 'prepare');
    expect(added).toBe(3);
    expect(playerIsland(state).queue.map((c) => [c.kind, c.x, c.y])).toEqual([
      ['prepare', 1, 0],
      ['prepare', 3, 2],
      ['prepare', 0, 4],
    ]);
  });

  it('すでに整地か地ならしを予約している荒地は飛ばす', () => {
    let state = stateWith(islandWithWaste());
    state = enqueueCommand(state, 'prepareInstant', 3, 2);
    expect(autoPrepareTargets(playerIsland(state))).toEqual([{ x: 1, y: 0 }, { x: 0, y: 4 }]);
    const result = enqueueAutoPrepare(state, 'prepare');
    expect(result.added).toBe(2);
  });

  it('選んだ位置に挿入し、既存の予約は消さない', () => {
    let state = stateWith(islandWithWaste());
    state = enqueueCommand(state, 'raiseFunds', 0, 0, 2);
    const { state: next } = enqueueAutoPrepare(state, 'prepareInstant', 1);
    expect(playerIsland(next).queue.map((c) => c.kind)).toEqual([
      'raiseFunds',
      'prepareInstant',
      'prepareInstant',
      'prepareInstant',
      'raiseFunds',
    ]);
  });

  it('予約の空き枠を超えては入れない', () => {
    let state = stateWith(islandWithWaste());
    state = enqueueCommand(state, 'raiseFunds', 0, 0, RULES.queueMax - 1);
    const { state: next, added } = enqueueAutoPrepare(state, 'prepare');
    expect(added).toBe(1);
    expect(playerIsland(next).queue).toHaveLength(RULES.queueMax);
  });
});
