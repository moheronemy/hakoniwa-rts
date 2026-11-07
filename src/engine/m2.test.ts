import { describe, expect, it } from 'vitest';
import { commandCost, executeCommand, targetProblem, type CommandContext } from './commands';
import { DEFAULT_SETTINGS, enqueueCommand, playerIsland, setResearch } from './game';
import { setTile, tileAt } from './island';
import { computePower } from './power';
import { Rng } from './rng';
import { PLANTS, RULES } from './rules';
import { deserialize } from './save';
import { addResearchPoints, newResearch } from './tech';
import { advanceTurn, collectIncome } from './turn';
import type { GameState, Island, TechId } from './types';

/** すべて平地の小さな島（テスト用） */
function plainIsland(size = 8): Island {
  return {
    id: 'test',
    name: 'テスト島',
    size,
    tiles: Array.from({ length: size * size }, () => ({ kind: 'plains' as const, value: 0 })),
    money: 100000,
    food: 100000,
    oil: 0,
    research: newResearch(),
    queue: [],
    controller: 'player',
    destroyed: false,
    emptyTurns: 0,
    lastAttackedBy: null,
  };
}

function stateWith(island: Island): GameState {
  return {
    version: 3,
    turn: 0,
    rngState: 7,
    islands: [island],
    playerIslandId: island.id,
    log: [],
    nextCommandId: 1,
    settings: DEFAULT_SETTINGS,
    outcome: null,
  };
}

/** 乱数を固定した命令の実行環境 */
function ctxWith(value: number): CommandContext {
  const rng = new Rng(1);
  rng.next = () => value;
  return { effects: { attract: false }, rng };
}

function withTech(island: Island, ...ids: TechId[]): Island {
  island.research.done.push(...ids);
  return island;
}

describe('電力', () => {
  it('供給と需要から供給率を出す', () => {
    const island = plainIsland();
    setTile(island, 0, 0, 'windPower', 1);
    setTile(island, 1, 0, 'factory', 30);
    const power = computePower(island);
    expect(power.supply).toBe(10);
    expect(power.demand).toBe(30);
    expect(power.ratio).toBeCloseTo(1 / 3);
  });

  it('需要がなければ供給率は1', () => {
    expect(computePower(plainIsland()).ratio).toBe(1);
  });

  it('研究所と都市も電力を使う', () => {
    const island = plainIsland();
    setTile(island, 0, 0, 'lab', 2);
    setTile(island, 1, 0, 'town', 200); // 人口2万人の都市
    setTile(island, 2, 0, 'town', 50); // 町は使わない
    expect(computePower(island).demand).toBe(2 * RULES.powerPerLab + 2 * RULES.powerPerCityPop100);
  });

  it('火力発電は石油を使い、足りない分だけ出力が下がる', () => {
    const island = plainIsland();
    setTile(island, 0, 0, 'thermalPower', 3);
    island.oil = 2;
    const power = computePower(island);
    expect(power.fuelNeed).toBe(3);
    expect(power.fuelUsed).toBe(2);
    expect(power.supply).toBeCloseTo(PLANTS.thermalPower.output * 2);
  });

  it('研究で出力が上がり、消費が下がる', () => {
    const island = withTech(plainIsland(), 'betterWind', 'turbine', 'grid');
    setTile(island, 0, 0, 'windPower', 1);
    setTile(island, 1, 0, 'hydroPower', 1);
    setTile(island, 2, 0, 'factory', 100);
    const power = computePower(island);
    expect(power.supply).toBeCloseTo(10 * 1.5 + 50 * 1.25);
    expect(power.demand).toBeCloseTo(100 * 0.85);
  });

  it('工場の収入には供給率と工場の自動化が効く', () => {
    const island = plainIsland();
    setTile(island, 0, 0, 'town', 200);
    setTile(island, 1, 0, 'factory', 20);
    island.money = 0;
    collectIncome(island, 0.5);
    expect(island.money).toBe(10); // 20億円 × 0.5
    island.money = 0;
    withTech(island, 'automation');
    collectIncome(island, 1);
    expect(island.money).toBe(24);
  });

  it('電力がない工場は収入を生まない', () => {
    const island = plainIsland();
    setTile(island, 0, 0, 'town', 200);
    setTile(island, 1, 0, 'factory', 20);
    island.money = 0;
    const next = playerIsland(advanceTurn(stateWith(island)));
    expect(next.money).toBe(RULES.raiseFundsIncome); // 資金繰りの分だけ
  });
});

describe('発電所の建設', () => {
  it('風力は隣に平地か荒地が2マス以上必要', () => {
    const island = plainIsland();
    expect(targetProblem(island, 'windPower', 3, 3)).toBeNull();
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) if (x !== 3 || y !== 3) setTile(island, x, y, 'forest', 1);
    expect(targetProblem(island, 'windPower', 3, 3)).not.toBeNull();
  });

  it('水力は山の隣、火力と原子力は海の隣', () => {
    const island = plainIsland();
    expect(targetProblem(island, 'hydroPower', 3, 3)).not.toBeNull();
    setTile(island, 2, 3, 'mountain');
    expect(targetProblem(island, 'hydroPower', 3, 3)).toBeNull();
    expect(targetProblem(island, 'thermalPower', 3, 3)).not.toBeNull();
    setTile(island, 4, 3, 'shallow');
    expect(targetProblem(island, 'thermalPower', 3, 3)).toBeNull();
  });

  it('原子力発電所は研究が必要', () => {
    const island = plainIsland();
    setTile(island, 4, 3, 'deepSea');
    expect(targetProblem(island, 'nuclearPower', 3, 3)).toBe('研究「原子力」が必要です');
    withTech(island, 'nuclear');
    expect(targetProblem(island, 'nuclearPower', 3, 3)).toBeNull();
  });

  it('重ねて建てると段階が上がり、最大を超えない', () => {
    const island = plainIsland();
    executeCommand(island, 'windPower', 3, 3, ctxWith(0));
    executeCommand(island, 'windPower', 3, 3, ctxWith(0));
    expect(tileAt(island, 3, 3)).toEqual({ kind: 'windPower', value: 2 });
    tileAt(island, 3, 3).value = PLANTS.windPower.maxLevel;
    expect(executeCommand(island, 'windPower', 3, 3, ctxWith(0)).ok).toBe(false);
  });
});

describe('石油', () => {
  it('油田探しは当たれば油田になり、外れれば費用だけかかる', () => {
    const island = plainIsland();
    setTile(island, 0, 0, 'deepSea');
    setTile(island, 1, 0, 'deepSea');
    const hit = executeCommand(island, 'oilSearch', 0, 0, ctxWith(0.1));
    expect(hit.ok).toBe(true);
    expect(tileAt(island, 0, 0).kind).toBe('oilField');
    const miss = executeCommand(island, 'oilSearch', 1, 0, ctxWith(0.2));
    expect(miss.ok && miss.tone).toBe('bad');
    expect(tileAt(island, 1, 0).kind).toBe('deepSea');
  });

  it('石油探査の研究で成功率が2倍になる', () => {
    const island = withTech(plainIsland(), 'oilProspect');
    setTile(island, 0, 0, 'deepSea');
    executeCommand(island, 'oilSearch', 0, 0, ctxWith(0.2));
    expect(tileAt(island, 0, 0).kind).toBe('oilField');
  });

  it('油田は毎ターン石油を産出し、埋蔵量がなくなると海に戻る', () => {
    const island = plainIsland();
    setTile(island, 0, 0, 'oilField', 7);
    let state = advanceTurn(stateWith(island));
    expect(playerIsland(state).oil).toBe(RULES.oilPerField);
    state = advanceTurn(state);
    expect(playerIsland(state).oil).toBe(7);
    expect(tileAt(playerIsland(state), 0, 0).kind).toBe('deepSea');
  });

  it('石油の売却で資金になり、精製技術で売値が上がる', () => {
    const island = plainIsland();
    island.oil = 10;
    island.money = 0;
    executeCommand(island, 'sellOil', 0, 0, ctxWith(0));
    expect(island.money).toBe(10 * RULES.oilPrice);
    expect(island.oil).toBe(0);
    withTech(island, 'refining');
    island.oil = 10;
    island.money = 0;
    executeCommand(island, 'sellOil', 0, 0, ctxWith(0));
    expect(island.money).toBe(Math.floor(10 * RULES.oilPrice * 1.5));
  });

  it('石油がなければ売却はターンを消費せず次の命令に進む', () => {
    let state = stateWith(plainIsland());
    state = enqueueCommand(state, 'sellOil', 0, 0);
    state = enqueueCommand(state, 'plant', 1, 1);
    const island = playerIsland(advanceTurn(state));
    expect(tileAt(island, 1, 1).kind).toBe('forest');
  });
});

describe('研究', () => {
  it('研究中の技術にポイントを注ぎ、必要量に達したら完成して余りは貯まる', () => {
    const island = plainIsland();
    island.research.current = 'reclaim1';
    expect(addResearchPoints(island, 200)).toBeNull();
    expect(addResearchPoints(island, 150)).toBe('reclaim1');
    expect(island.research.done).toEqual(['reclaim1']);
    expect(island.research.pool).toBe(50);
    expect(island.research.current).toBeNull();
  });

  it('研究する技術を選んでいなければポイントは貯まり、選ぶと使われる', () => {
    const island = plainIsland();
    addResearchPoints(island, 400);
    expect(island.research.pool).toBe(400);
    island.research.current = 'betterWind';
    expect(addResearchPoints(island, 0)).toBe('betterWind');
    expect(island.research.pool).toBe(100);
  });

  it('前提の技術がないと選べない', () => {
    const state = stateWith(plainIsland());
    expect(playerIsland(setResearch(state, 'reclaim2')).research.current).toBeNull();
    expect(playerIsland(setResearch(state, 'reclaim1')).research.current).toBe('reclaim1');
  });

  it('研究所のポイントは電力の供給率で減る', () => {
    const island = plainIsland();
    setTile(island, 0, 0, 'lab', 2); // 10ポイント、電力40
    setTile(island, 1, 0, 'windPower', 2); // 電力20
    const next = playerIsland(advanceTurn(stateWith(island)));
    expect(next.research.pool).toBeCloseTo(5);
  });

  it('研究投資のポイントはそのターンのうちに研究に注がれる', () => {
    const island = plainIsland();
    island.research.current = 'betterWind';
    island.research.progress.betterWind = 260;
    let state = stateWith(island);
    state = enqueueCommand(state, 'invest', 0, 0);
    const next = playerIsland(advanceTurn(state));
    expect(next.research.done).toContain('betterWind');
  });
});

describe('技術の効果', () => {
  it('埋め立て改良で費用が下がり、海洋土木で深い海が一度に陸地になる', () => {
    const island = plainIsland();
    expect(commandCost(island, 'reclaim')).toBe(150);
    withTech(island, 'reclaim1', 'reclaim2');
    expect(commandCost(island, 'reclaim')).toBe(RULES.reclaimCostImproved);
    setTile(island, 0, 0, 'deepSea');
    executeCommand(island, 'reclaim', 0, 0, ctxWith(0));
    expect(tileAt(island, 0, 0).kind).toBe('waste');
  });

  it('大規模農業で農場の最大規模が上がる', () => {
    const island = plainIsland();
    setTile(island, 0, 0, 'farm', RULES.farmMax);
    expect(targetProblem(island, 'farm', 0, 0)).not.toBeNull();
    withTech(island, 'bigFarm');
    expect(targetProblem(island, 'farm', 0, 0)).toBeNull();
  });

  it('都市計画があれば、電力が足りている都市は毎ターン伸びる', () => {
    const island = withTech(plainIsland(), 'cityPlan');
    for (let i = 0; i < island.tiles.length; i++) island.tiles[i] = { kind: 'forest', value: 1 };
    setTile(island, 0, 0, 'town', 150);
    setTile(island, 1, 0, 'windPower', 3);
    const next = playerIsland(advanceTurn(stateWith(island)));
    expect(tileAt(next, 0, 0).value).toBeGreaterThan(150);
  });
});

describe('セーブデータの移行', () => {
  it('版1（M1）のセーブデータに石油と研究を補って読み込む', () => {
    const island = plainIsland();
    const v1Island: Record<string, unknown> = { ...island };
    delete v1Island.oil;
    delete v1Island.research;
    const text = JSON.stringify({
      format: 'hakoniwa-rts-save',
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      state: { version: 1, turn: 5, rngState: 1, islands: [v1Island], playerIslandId: 'test', log: [], nextCommandId: 1 },
    });
    const state = deserialize(text);
    expect(state.version).toBe(3);
    expect(state.islands[0]!.oil).toBe(0);
    expect(state.islands[0]!.research).toEqual(newResearch());
  });
});
