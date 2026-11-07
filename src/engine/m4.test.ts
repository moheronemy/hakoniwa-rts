import { describe, expect, it } from 'vitest';
import { executeCommand, targetProblem, type CommandContext } from './commands';
import { applyDisaster, runDisasters } from './disasters';
import { DEFAULT_SETTINGS } from './game';
import { setTile, tileAt } from './island';
import { fireMissiles, type World } from './military';
import {
  BREED_STAGES,
  isHardened,
  MONSTER_RULES,
  MONSTERS,
  monsterOf,
  monsterTile,
  moveMonsters,
  spawnWildMonster,
} from './monsters';
import { Rng } from './rng';
import { RULES } from './rules';
import { deserialize } from './save';
import { newResearch } from './tech';
import { advanceTurn } from './turn';
import type { GameState, Island, LogEntry, TechId } from './types';

function island(id: string, fill: 'plains' | 'wall' = 'plains', size = 8): Island {
  return {
    id,
    name: `${id}島`,
    size,
    tiles: Array.from({ length: size * size }, () => ({ kind: fill, value: 0 })),
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
    satellites: {},
  };
}

function fixedRng(value: number): Rng {
  const rng = new Rng(1);
  rng.next = () => value;
  return rng;
}

function withTech(target: Island, ...ids: TechId[]): Island {
  target.research.done.push(...ids);
  return target;
}

const noLog = () => {};

function world(islands: Island[], turn = 200): World {
  return { islands, turn, emit: (_e: Omit<LogEntry, 'turn'>) => {} };
}

function ctx(w: World, rng: Rng = new Rng(1)): CommandContext {
  return { effects: { attract: false }, rng, world: w };
}

describe('怪獣のデータ', () => {
  it('マスの値に種類と体力を詰めて取り出せる', () => {
    const tile = monsterTile('m6', 8);
    expect(tile.kind).toBe('monster');
    expect(monsterOf(tile)).toEqual({ def: MONSTERS.m6, hp: 8 });
  });

  it('硬化は決まったターンに起きる', () => {
    expect(isHardened(MONSTERS.m2, 3)).toBe(true);
    expect(isHardened(MONSTERS.m2, 4)).toBe(false);
    expect(isHardened(MONSTERS.m6, 4)).toBe(true);
    expect(isHardened(MONSTERS.m1, 3)).toBe(false);
  });
});

describe('怪獣の行動', () => {
  it('防壁に囲まれた怪獣は動けない', () => {
    const a = island('a', 'wall');
    a.tiles[3 * 8 + 3] = monsterTile('m1', 2);
    moveMonsters(a, new Rng(1), 2, noLog);
    expect(tileAt(a, 3, 3).kind).toBe('monster');
  });

  it('動いた先の施設は壊れ、元の場所は荒地になる', () => {
    const a = island('a', 'wall');
    a.tiles[0 * 8 + 5] = monsterTile('m1', 2);
    setTile(a, 4, 0, 'factory', 30);
    moveMonsters(a, fixedRng(0), 2, noLog);
    expect(tileAt(a, 4, 0).kind).toBe('monster');
    expect(tileAt(a, 5, 0).kind).toBe('waste');
  });

  it('速さの能力がある怪獣は2歩動く', () => {
    const a = island('a', 'wall');
    a.tiles[0 * 8 + 5] = monsterTile('m3', 2);
    setTile(a, 4, 0, 'plains');
    setTile(a, 3, 0, 'plains');
    moveMonsters(a, fixedRng(0), 2, noLog);
    expect(tileAt(a, 3, 0).kind).toBe('monster');
  });

  it('硬化中の怪獣は動かない', () => {
    const a = island('a');
    a.tiles[3 * 8 + 3] = monsterTile('m2', 2);
    moveMonsters(a, new Rng(1), 3, noLog); // 奇数ターンは硬化
    expect(tileAt(a, 3, 3).kind).toBe('monster');
  });

  it('迎撃施設を踏むと、迎撃施設が自爆して怪獣も倒れ、死骸の値段が入る', () => {
    const a = island('a', 'wall');
    a.tiles[0 * 8 + 5] = monsterTile('m1', 2);
    setTile(a, 4, 0, 'interceptor');
    a.money = 0;
    moveMonsters(a, fixedRng(0), 2, noLog);
    expect(a.tiles.some((t) => t.kind === 'monster')).toBe(false);
    expect(a.money).toBe(MONSTERS.m1.value);
  });

  it('増殖の能力がある怪獣は、元の場所に分裂する', () => {
    const a = island('a', 'wall');
    a.tiles[0 * 8 + 5] = monsterTile('m5', 3);
    setTile(a, 4, 0, 'plains');
    moveMonsters(a, fixedRng(0), 2, noLog);
    expect(a.tiles.filter((t) => t.kind === 'monster')).toHaveLength(2);
  });

  it('範囲破壊の能力がある怪獣は、移動先の周囲を焼き払う', () => {
    const a = island('a');
    for (let i = 0; i < a.tiles.length; i++) a.tiles[i] = { kind: 'town', value: 50 };
    a.tiles[3 * 8 + 3] = monsterTile('m7', 9);
    moveMonsters(a, fixedRng(0.99), 2, noLog);
    expect(a.tiles.filter((t) => t.kind === 'waste').length).toBeGreaterThanOrEqual(6);
  });

  it('資源への干渉の能力がある怪獣は、資金か食料の1/4を奪う', () => {
    const a = island('a', 'wall');
    a.tiles[3 * 8 + 3] = monsterTile('m8', 8);
    a.money = 1000;
    a.food = 1000;
    const turn = [2, 4, 6, 8, 10].find((t) => !isHardened(MONSTERS.m8, t))!;
    moveMonsters(a, fixedRng(0), turn, noLog);
    expect(a.money + a.food).toBe(1750);
  });
});

describe('野生の怪獣', () => {
  it('人口が少ない島や、災害なしの設定では現れない', () => {
    const a = island('a');
    spawnWildMonster(a, fixedRng(0), 1, noLog);
    expect(a.tiles.some((t) => t.kind === 'monster')).toBe(false);
    setTile(a, 0, 0, 'town', 200);
    for (let i = 1; i < 12; i++) a.tiles[i] = { kind: 'town', value: 200 };
    spawnWildMonster(a, fixedRng(0), 0, noLog);
    expect(a.tiles.some((t) => t.kind === 'monster')).toBe(false);
  });

  it('人口の段階に応じた種類が現れる', () => {
    const a = island('a');
    // 段階1の人口ちょうどにする
    const towns = MONSTER_RULES.stagePops[0] / 200;
    for (let i = 0; i < towns; i++) a.tiles[i] = { kind: 'town', value: 200 };
    spawnWildMonster(a, fixedRng(0), 1, noLog);
    const monster = a.tiles.find((t) => t.kind === 'monster');
    expect(monster).toBeDefined();
    expect(monsterOf(monster!).def.stage).toBe(1);
  });
});

describe('怪獣とミサイル', () => {
  function setup(id: 'm1' | 'm2' | 'm4' | 'm6', hp: number) {
    const a = withTech(island('a'), 'pinpoint', 'landBuster');
    setTile(a, 0, 0, 'missileBase', 0);
    setTile(a, 7, 7, 'windPower', 3);
    a.tiles[4 * 8 + 4] = monsterTile(id, hp);
    a.money = 10000;
    return a;
  }

  it('自分の島の怪獣を撃てる（序盤でも）。当たると体力が1減り、0で倒れて報酬と経験値が入る', () => {
    const a = setup('m1', 2);
    const w = world([a], 1);
    fireMissiles(w, a, 'missilePinpoint', 4, 4, 'a', 1, fixedRng(0.9));
    expect(monsterOf(tileAt(a, 4, 4)).hp).toBe(1);
    fireMissiles(w, a, 'missilePinpoint', 4, 4, 'a', 1, fixedRng(0.9));
    expect(tileAt(a, 4, 4).kind).toBe('waste');
    expect(a.money).toBe(10000 - 1000 + MONSTERS.m1.value);
    expect(tileAt(a, 0, 0).value).toBeGreaterThanOrEqual(MONSTERS.m1.exp);
    expect(a.lastAttackedBy).toBeNull();
  });

  it('硬化中の怪獣にはミサイルが効かない', () => {
    const a = setup('m6', 8);
    fireMissiles(world([a], 200), a, 'missilePinpoint', 4, 4, 'a', 1, fixedRng(0.9)); // 偶数ターン
    expect(monsterOf(tileAt(a, 4, 4)).hp).toBe(8);
  });

  it('ミサイル迎撃の能力がある怪獣は、確率でミサイルを無効にする', () => {
    const a = setup('m4', 4);
    fireMissiles(world([a], 201), a, 'missilePinpoint', 4, 4, 'a', 1, fixedRng(0));
    expect(monsterOf(tileAt(a, 4, 4)).hp).toBe(4);
    fireMissiles(world([a], 201), a, 'missilePinpoint', 4, 4, 'a', 1, fixedRng(0.9));
    expect(monsterOf(tileAt(a, 4, 4)).hp).toBe(3);
  });

  it('陸地破壊弾は体力に関係なく怪獣を倒す', () => {
    const a = setup('m6', 8);
    for (const p of [[3, 4], [5, 4], [3, 3], [4, 3], [3, 5], [4, 5]] as const) a.tiles[p[1] * 8 + p[0]] = monsterTile('m6', 8);
    fireMissiles(world([a], 201), a, 'missileLand', 4, 4, 'a', 1, new Rng(5));
    expect(a.tiles.filter((t) => t.kind === 'monster')).toHaveLength(6);
  });
});

describe('怪獣の育成と派遣', () => {
  function tamer(): { a: Island; b: Island } {
    const a = withTech(island('a'), 'bio1');
    setTile(a, 2, 2, 'monsterLab');
    const b = island('b');
    return { a, b };
  }

  it('怪獣研究所は研究「怪獣研究」がないと建てられない', () => {
    const a = island('a');
    expect(targetProblem(a, 'monsterLab', 1, 1)).toContain('怪獣研究');
    withTech(a, 'bio1');
    expect(targetProblem(a, 'monsterLab', 1, 1)).toBeNull();
  });

  it('研究所で育てると、決まったターン後に送れるようになり、送ると相手の島に現れる', () => {
    const { a, b } = tamer();
    const early = world([a, b], 150);
    const bred = executeCommand(a, 'breed', 2, 2, ctx(early), { monster: 'm1' });
    expect(bred.ok).toBe(true);
    const ready = 150 + BREED_STAGES[1]!.turns;
    expect(a.breeding).toEqual([{ x: 2, y: 2, monster: 'm1', readyTurn: ready }]);
    expect(executeCommand(a, 'breed', 2, 2, ctx(early), { monster: 'm2' }).ok).toBe(false); // 1棟に1匹

    const notYet = executeCommand(a, 'sendMonster', 0, 0, ctx(world([a, b], ready - 1)), { targetIslandId: 'b' });
    expect(notYet.ok).toBe(false);
    const sent = executeCommand(a, 'sendMonster', 0, 0, ctx(world([a, b], ready)), { targetIslandId: 'b' });
    expect(sent.ok).toBe(true);
    expect(b.tiles.filter((t) => t.kind === 'monster')).toHaveLength(1);
    expect(a.breeding).toHaveLength(0);
    expect(b.lastAttackedBy?.islandId).toBe('a');
  });

  it('段階2以上の怪獣は研究が必要で、序盤の保護の間は送れない', () => {
    const { a, b } = tamer();
    expect(executeCommand(a, 'breed', 2, 2, ctx(world([a, b], 1)), { monster: 'm3' }).ok).toBe(false);
    executeCommand(a, 'breed', 2, 2, ctx(world([a, b], 1)), { monster: 'm1' });
    const sent = executeCommand(a, 'sendMonster', 0, 0, ctx(world([a, b], RULES.protectionTurns)), { targetIslandId: 'b' });
    expect(sent.ok).toBe(false);
  });

  it('研究所が壊れると、育てていた怪獣もいなくなる', () => {
    const { a, b } = tamer();
    executeCommand(a, 'breed', 2, 2, ctx(world([a, b], 1)), { monster: 'm1' });
    setTile(a, 2, 2, 'waste');
    setTile(a, 0, 0, 'town', 50);
    setTile(a, 1, 0, 'farm', 50);
    const state: GameState = {
      version: 5,
      turn: 1,
      rngState: 3,
      islands: [a, b],
      playerIslandId: 'a',
      log: [],
      nextCommandId: 1,
      settings: { ...DEFAULT_SETTINGS, disasterLevel: 0 },
      outcome: null,
    };
    expect(advanceTurn(state).islands[0]!.breeding).toHaveLength(0);
  });

  it('防壁は平地に建てられる', () => {
    const a = island('a');
    expect(executeCommand(a, 'wall', 1, 1, ctx(world([a]))).ok).toBe(true);
    expect(tileAt(a, 1, 1).kind).toBe('wall');
  });
});

describe('災害', () => {
  it('災害なしの設定では何も起きない', () => {
    const a = island('a');
    const before = structuredClone(a.tiles);
    for (let i = 0; i < 50; i++) runDisasters(a, fixedRng(0), 0, noLog);
    expect(a.tiles).toEqual(before);
  });

  it('地震は都市や工場を壊す（町は壊さない）', () => {
    const a = island('a');
    setTile(a, 0, 0, 'town', 150);
    setTile(a, 1, 0, 'town', 50);
    setTile(a, 2, 0, 'factory', 30);
    applyDisaster(a, 'earthquake', fixedRng(0), noLog);
    expect([0, 1, 2].map((x) => tileAt(a, x, 0).kind)).toEqual(['waste', 'town', 'waste']);
  });

  it('津波は海に面したマスを壊す', () => {
    const a = island('a');
    for (let x = 0; x < 8; x++) setTile(a, x, 0, 'deepSea');
    setTile(a, 3, 1, 'town', 50);
    setTile(a, 3, 5, 'town', 50);
    applyDisaster(a, 'tsunami', fixedRng(0), noLog);
    expect(tileAt(a, 3, 1).kind).toBe('waste');
    expect(tileAt(a, 3, 5).kind).toBe('town');
  });

  it('台風は農場を平地にする', () => {
    const a = island('a');
    setTile(a, 3, 3, 'farm', 20);
    applyDisaster(a, 'typhoon', fixedRng(0), noLog);
    expect(tileAt(a, 3, 3).kind).toBe('plains');
  });

  it('隕石はマスを深い海にし、巨大隕石は周囲も壊し、噴火は山を作る', () => {
    const a = island('a');
    applyDisaster(a, 'meteor', fixedRng(0.99), noLog);
    expect(a.tiles.filter((t) => t.kind === 'deepSea')).toHaveLength(1);

    const b = island('b');
    applyDisaster(b, 'hugeMeteor', fixedRng(0.5), noLog);
    expect(tileAt(b, 4, 4).kind).toBe('deepSea');
    expect(b.tiles.filter((t) => t.kind === 'shallow')).toHaveLength(6);

    const c = island('c');
    applyDisaster(c, 'eruption', fixedRng(0.5), noLog);
    expect(tileAt(c, 4, 4).kind).toBe('mountain');
    expect(c.tiles.filter((t) => t.kind === 'waste')).toHaveLength(6);
  });
});

describe('セーブデータの移行（版3 → 版4）', () => {
  it('バランス型を怪獣使い型にし、災害の強さと怪獣研究所の状態を補う', () => {
    const v3Island = (controller: string) => {
      const raw: Record<string, unknown> = { ...island(controller), controller };
      delete raw.breeding;
      return raw;
    };
    const text = JSON.stringify({
      format: 'hakoniwa-rts-save',
      version: 3,
      savedAt: '2026-01-01T00:00:00Z',
      state: {
        version: 3,
        turn: 300,
        rngState: 5,
        islands: [v3Island('player'), v3Island('balanced')],
        playerIslandId: 'player',
        log: [],
        nextCommandId: 3,
        settings: { economicTarget: 15000, turnLimit: 2000 },
        outcome: null,
      },
    });
    const state = deserialize(text);
    expect(state.version).toBe(5);
    expect(state.islands[1]!.controller).toBe('tamer');
    expect(state.islands.every((i) => Array.isArray(i.breeding))).toBe(true);
    expect(state.settings.disasterLevel).toBe(1);
  });
});
