import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, enqueueMissile, newGame, playerIsland } from './game';
import { generateIsland } from './generate';
import { cellsWithin, hexDistance, neighbors } from './hex';
import { baseLevel, setTile, tileAt, visibleTile } from './island';
import { fireMissiles, missileCapacity, missileProblem, MISSILES, type World } from './military';
import { computePower } from './power';
import { Rng } from './rng';
import { RULES } from './rules';
import { deserialize } from './save';
import { newResearch } from './tech';
import { advanceTurn, checkOutcome } from './turn';
import type { GameState, Island, LogEntry, TechId } from './types';

function island(id: string, size = 8): Island {
  return {
    id,
    name: `${id}島`,
    size,
    tiles: Array.from({ length: size * size }, () => ({ kind: 'plains' as const, value: 0 })),
    money: 100000,
    food: 100000,
    oil: 1000,
    research: newResearch(),
    queue: [],
    controller: 'player',
    destroyed: false,
    emptyTurns: 0,
    lastAttackedBy: null,
    breeding: [],
  };
}

function world(islands: Island[], turn = 200): World & { logs: Array<Omit<LogEntry, 'turn'>> } {
  const logs: Array<Omit<LogEntry, 'turn'>> = [];
  return { islands, turn, emit: (e) => logs.push(e), logs };
}

/** 乱数を固定する（next が常に value を返す） */
function fixedRng(value: number): Rng {
  const rng = new Rng(1);
  rng.next = () => value;
  return rng;
}

function withTech(target: Island, ...ids: TechId[]): Island {
  target.research.done.push(...ids);
  return target;
}

function twoIslands(): { a: Island; b: Island; w: ReturnType<typeof world> } {
  const a = island('a');
  const b = island('b');
  setTile(a, 0, 0, 'missileBase', 0); // レベル1
  setTile(a, 7, 7, 'windPower', 3); // 基地の電力
  setTile(b, 4, 4, 'town', 100);
  setTile(b, 7, 7, 'windPower', 3); // 迎撃施設の電力
  const w = world([a, b]);
  return { a, b, w };
}

describe('マスの距離', () => {
  it('隣のマスは距離1で、周囲1マスは7マス・周囲2マスは19マス', () => {
    for (const p of neighbors(10, 4, 5)) expect(hexDistance(4, 5, p.x, p.y)).toBe(1);
    for (const p of neighbors(10, 4, 4)) expect(hexDistance(4, 4, p.x, p.y)).toBe(1);
    expect(cellsWithin(4, 4, 0)).toHaveLength(1);
    expect(cellsWithin(4, 4, 1)).toHaveLength(7);
    expect(cellsWithin(5, 5, 2)).toHaveLength(19);
  });
});

describe('基地と見え方', () => {
  it('経験値でレベルが上がる', () => {
    expect(baseLevel({ kind: 'missileBase', value: 0 })).toBe(1);
    expect(baseLevel({ kind: 'missileBase', value: 20 })).toBe(2);
    expect(baseLevel({ kind: 'missileBase', value: 255 })).toBe(5);
    expect(baseLevel({ kind: 'seaBase', value: 200 })).toBe(4);
  });

  it('他の島からは、ミサイル基地は森、海底基地は深い海に見える', () => {
    expect(visibleTile({ kind: 'missileBase', value: 50 }).kind).toBe('forest');
    expect(visibleTile({ kind: 'seaBase', value: 50 }).kind).toBe('deepSea');
    expect(visibleTile({ kind: 'interceptor', value: 0 }).kind).toBe('interceptor');
  });

  it('基地と迎撃施設は電力を使い、基地の自動化で基地の分が半分になる', () => {
    const a = island('a');
    setTile(a, 0, 0, 'missileBase');
    setTile(a, 1, 0, 'seaBase');
    setTile(a, 2, 0, 'interceptor');
    const full = RULES.powerPerMissileBase + RULES.powerPerSeaBase + RULES.powerPerInterceptor;
    expect(computePower(a).demand).toBe(full);
    withTech(a, 'baseAuto');
    expect(computePower(a).demand).toBe((RULES.powerPerMissileBase + RULES.powerPerSeaBase) / 2 + RULES.powerPerInterceptor);
  });
});

describe('ミサイルを撃てる条件', () => {
  it('序盤の保護、基地なし、研究なし、滅亡した島では撃てない。自分の島へは序盤でも撃てる', () => {
    const { a, b, w } = twoIslands();
    expect(missileProblem(w, a, 'missileNormal', 'b')).toBeNull();
    expect(missileProblem({ ...w, turn: RULES.protectionTurns }, a, 'missileNormal', 'b')).toContain('攻撃できません');
    expect(missileProblem(w, a, 'missilePrecise', 'b')).toContain('精密誘導');
    expect(missileProblem({ ...w, turn: 1 }, a, 'missileNormal', 'a')).toBeNull();
    expect(missileProblem(w, b, 'missileNormal', 'a')).toBe('ミサイル基地がありません');
    b.destroyed = true;
    expect(missileProblem(w, a, 'missileNormal', 'b')).toContain('滅亡');
  });
});

describe('ミサイルの発射', () => {
  it('高精度弾は狙ったマスに落ちて住宅地を壊し、資金・石油・経験値が動く', () => {
    const { a, b, w } = twoIslands();
    withTech(a, 'pinpoint');
    const result = fireMissiles(w, a, 'missilePinpoint', 4, 4, 'b', 0, fixedRng(0.5));
    expect(result.ok).toBe(true);
    expect(tileAt(b, 4, 4).kind).toBe('waste');
    expect(a.money).toBe(100000 - MISSILES.missilePinpoint.money);
    expect(a.oil).toBe(1000 - MISSILES.missilePinpoint.oil);
    expect(tileAt(a, 0, 0).value).toBe(RULES.expLand + RULES.expDestroy);
    expect(b.lastAttackedBy).toEqual({ islandId: 'a', turn: 200 });
    expect(w.logs[0]?.islandId).toBe('b');
  });

  it('撃てる発数は基地のレベルの合計で、発数を指定すればそれ以下にできる', () => {
    const { a, w } = twoIslands();
    tileAt(a, 0, 0).value = 60; // レベル3
    setTile(a, 1, 0, 'missileBase', 0); // レベル1
    expect(missileCapacity(a)).toBe(4);
    fireMissiles(w, a, 'missileNormal', 4, 4, 'b', 0, new Rng(3));
    expect(a.money).toBe(100000 - 4 * MISSILES.missileNormal.money);
    fireMissiles(w, a, 'missileNormal', 4, 4, 'b', 2, new Rng(3));
    expect(a.money).toBe(100000 - 6 * MISSILES.missileNormal.money);
  });

  it('石油が足りなければ撃てない', () => {
    const { a, w } = twoIslands();
    a.oil = 0;
    expect(fireMissiles(w, a, 'missileNormal', 4, 4, 'b', 0, new Rng(1)).ok).toBe(false);
  });

  it('通常弾は狙ったマスの周囲2マスのどこかに落ちる', () => {
    const landed = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const { a, b, w } = twoIslands();
      for (let i = 0; i < b.tiles.length; i++) b.tiles[i] = { kind: 'town', value: 50 };
      fireMissiles(w, a, 'missileNormal', 4, 4, 'b', 1, new Rng(seed));
      b.tiles.forEach((t, i) => {
        if (t.kind === 'waste') landed.add(`${i % 8},${Math.floor(i / 8)}`);
      });
    }
    for (const key of landed) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      expect(hexDistance(4, 4, x, y)).toBeLessThanOrEqual(2);
    }
    expect(landed.size).toBe(19);
  });
});

describe('迎撃', () => {
  it('迎撃施設の周囲2マスに落ちる弾は確率で撃ち落とされる', () => {
    const { a, b, w } = twoIslands();
    withTech(a, 'pinpoint');
    setTile(b, 5, 4, 'interceptor');
    fireMissiles(w, a, 'missilePinpoint', 4, 4, 'b', 0, fixedRng(0)); // 0 < 70% なので迎撃
    expect(tileAt(b, 4, 4).kind).toBe('town');
    fireMissiles(w, a, 'missilePinpoint', 4, 4, 'b', 0, fixedRng(0.9)); // 70% 以上なので着弾
    expect(tileAt(b, 4, 4).kind).toBe('waste');
  });

  it('高精度弾で迎撃施設そのものを狙うと迎撃されない', () => {
    const { a, b, w } = twoIslands();
    withTech(a, 'pinpoint');
    setTile(b, 5, 4, 'interceptor');
    fireMissiles(w, a, 'missilePinpoint', 5, 4, 'b', 0, fixedRng(0));
    expect(tileAt(b, 5, 4).kind).toBe('waste');
  });
});

describe('弾の効果', () => {
  it('海底基地は直撃で壊れる', () => {
    const { a, b, w } = twoIslands();
    withTech(a, 'pinpoint');
    setTile(b, 2, 2, 'seaBase', 10);
    fireMissiles(w, a, 'missilePinpoint', 2, 2, 'b', 0, fixedRng(0.5));
    expect(tileAt(b, 2, 2).kind).toBe('deepSea');
  });

  it('陸地破壊弾は陸地を浅瀬に、山を荒地にする', () => {
    const { a, b, w } = twoIslands();
    withTech(a, 'landBuster');
    for (let i = 0; i < b.tiles.length; i++) b.tiles[i] = { kind: 'mountain', value: 0 };
    setTile(b, 4, 4, 'town', 100);
    // 着弾点は乱数で決まるので、周囲1マスに山しかない状態で撃ち、変化を確かめる
    fireMissiles(w, a, 'missileLand', 4, 4, 'b', 1, fixedRng(0.99));
    const changed = b.tiles.filter((t) => t.kind === 'waste' || t.kind === 'shallow');
    expect(changed).toHaveLength(1);
  });

  it('核弾頭は周囲1マスの陸地を浅瀬に、周囲2マスを荒地にする', () => {
    const { a, b, w } = twoIslands();
    withTech(a, 'nukeTech');
    for (let i = 0; i < b.tiles.length; i++) b.tiles[i] = { kind: 'town', value: 50 };
    const rng = fixedRng(0);
    // 精密弾と同じく周囲1マスにばらつくので、着弾点を求めてから確かめる
    fireMissiles(w, a, 'missileNuke', 4, 4, 'b', 1, rng);
    const center = cellsWithin(4, 4, 1)[0]!;
    for (const p of cellsWithin(center.x, center.y, 2)) {
      if (p.x < 0 || p.y < 0 || p.x >= 8 || p.y >= 8) continue;
      const d = hexDistance(center.x, center.y, p.x, p.y);
      expect(tileAt(b, p.x, p.y).kind).toBe(d <= 1 ? 'shallow' : 'waste');
    }
  });

  it('原子力発電所が壊れると周囲2マスにも被害が広がる', () => {
    const { a, b, w } = twoIslands();
    withTech(a, 'pinpoint');
    setTile(b, 3, 3, 'nuclearPower', 1);
    setTile(b, 3, 5, 'factory', 30);
    fireMissiles(w, a, 'missilePinpoint', 3, 3, 'b', 0, fixedRng(0.5));
    expect(tileAt(b, 3, 5).kind).toBe('waste');
  });
});

function gameWith(islands: Island[], turn = 0): GameState {
  return {
    version: 4,
    turn,
    rngState: 9,
    islands,
    playerIslandId: islands[0]!.id,
    log: [],
    nextCommandId: 1,
    settings: DEFAULT_SETTINGS,
    outcome: null,
  };
}

describe('滅亡と勝敗', () => {
  it('陸地がなくなった島はすぐ滅亡し、人口0が続いた島は一定ターン後に滅亡する', () => {
    const a = island('a');
    setTile(a, 0, 0, 'town', 100);
    setTile(a, 1, 0, 'farm', 50);
    const sea = island('sea');
    for (let i = 0; i < sea.tiles.length; i++) sea.tiles[i] = { kind: 'deepSea', value: 0 };
    const empty = island('empty'); // 平地だけで人口0
    const other = island('other');
    setTile(other, 0, 0, 'town', 100);
    setTile(other, 1, 0, 'farm', 50);
    let state = gameWith([a, sea, empty, other]);
    state = advanceTurn(state);
    expect(state.islands[1]!.destroyed).toBe(true);
    expect(state.islands[2]!.destroyed).toBe(false);
    for (let i = 0; i < RULES.emptyTurnsToDestroy; i++) state = advanceTurn(state);
    expect(state.islands[2]!.destroyed).toBe(true);
    expect(state.log.some((l) => l.public && l.text.includes('滅亡'))).toBe(true);
  });

  it('自分の島が滅亡したら負け', () => {
    const a = island('a');
    a.destroyed = true;
    expect(checkOutcome(gameWith([a, island('b')]))?.result).toBe('lose');
  });

  it('目標人口に最初に届いた島が経済的制覇', () => {
    const a = island('a');
    const b = island('b');
    setTile(b, 0, 0, 'town', 200);
    const state = gameWith([a, b]);
    state.settings = { ...DEFAULT_SETTINGS, economicTarget: 150 };
    expect(checkOutcome(state)).toMatchObject({ result: 'lose', winnerId: 'b' });
    setTile(a, 0, 0, 'town', 200);
    setTile(a, 1, 0, 'town', 200);
    expect(checkOutcome(state)).toMatchObject({ result: 'win', winnerId: 'a' });
  });

  it('自分以外がすべて滅亡したら軍事的制覇、期限ではスコア1位が勝ち', () => {
    const a = island('a');
    const b = island('b');
    setTile(a, 0, 0, 'town', 50);
    b.destroyed = true;
    expect(checkOutcome(gameWith([a, b]))?.reason).toContain('軍事的制覇');
    b.destroyed = false;
    setTile(b, 0, 0, 'town', 100);
    const state = gameWith([a, b], DEFAULT_SETTINGS.turnLimit);
    expect(checkOutcome(state)).toMatchObject({ result: 'lose', winnerId: 'b' });
  });

  it('勝敗が決まったらターンは進まない', () => {
    const state = gameWith([island('a'), island('b')]);
    state.outcome = { result: 'win', winnerId: 'a', reason: 'テスト', turn: 0 };
    expect(advanceTurn(state)).toBe(state);
  });
});

describe('予約からのミサイル', () => {
  it('予約したミサイルが撃たれ、攻撃のログが残る', () => {
    const a = island('a');
    setTile(a, 0, 0, 'missileBase', 0);
    setTile(a, 1, 0, 'town', 100);
    setTile(a, 2, 0, 'farm', 50);
    setTile(a, 3, 0, 'windPower', 3);
    const b = island('b');
    setTile(b, 4, 4, 'town', 100);
    setTile(b, 5, 5, 'farm', 50);
    let state = gameWith([a, b], RULES.protectionTurns);
    state = enqueueMissile(state, 'missileNormal', 'b', 4, 4, 0);
    state = advanceTurn(state);
    expect(state.log.some((l) => l.text.includes('通常弾を1発発射'))).toBe(true);
    expect(state.islands[1]!.lastAttackedBy?.islandId).toBe('a');
  });
});

describe('AI', () => {
  it('新しいゲームは自分の島と AI の島3つで始まり、初期の島には農場がある', () => {
    const state = newGame(1);
    expect(state.islands).toHaveLength(4);
    expect(state.islands.filter((i) => i.controller !== 'player').map((i) => i.controller).sort()).toEqual([
      'economic',
      'military',
      'tamer',
    ]);
    expect(playerIsland(state).tiles.some((t) => t.kind === 'farm')).toBe(true);
  });

  it('AI は300ターンで島を発展させ、研究を進める。同じ入力なら同じ結果になる', () => {
    let a = newGame(7);
    for (let i = 0; i < 300; i++) a = advanceTurn(a);
    for (const ai of a.islands.filter((i) => i.controller !== 'player')) {
      expect(ai.destroyed).toBe(false);
      expect(ai.research.done.length).toBeGreaterThan(0);
      expect(ai.tiles.some((t) => t.kind === 'windPower' || t.kind === 'hydroPower' || t.kind === 'thermalPower')).toBe(true);
    }
    let b = newGame(7);
    for (let i = 0; i < 300; i++) b = advanceTurn(b);
    expect(b).toEqual(a);
  });
});

describe('セーブデータの移行', () => {
  it('版2（M2）のセーブデータに AI の島を足して読み込む', () => {
    const v2Island: Record<string, unknown> = { ...generateIsland(new Rng(1), 'player', 'あなたの島') };
    for (const key of ['controller', 'destroyed', 'emptyTurns', 'lastAttackedBy', 'breeding']) delete v2Island[key];
    const text = JSON.stringify({
      format: 'hakoniwa-rts-save',
      version: 2,
      savedAt: '2026-01-01T00:00:00Z',
      state: { version: 2, turn: 50, rngState: 5, islands: [v2Island], playerIslandId: 'player', log: [], nextCommandId: 3 },
    });
    const state = deserialize(text);
    expect(state.version).toBe(4);
    expect(state.islands).toHaveLength(4);
    expect(state.islands[0]!.controller).toBe('player');
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
    expect(state.outcome).toBeNull();
    expect(state.turn).toBe(50);
  });
});
