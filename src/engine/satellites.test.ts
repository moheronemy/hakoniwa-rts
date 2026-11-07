import { describe, expect, it } from 'vitest';
import { executeCommand, type CommandContext } from './commands';
import { runDisasters } from './disasters';
import { enqueueLaser, enqueueSatellite, newGame } from './game';
import { setTile, tileAt } from './island';
import { fireMissiles, type World } from './military';
import { MONSTERS, monsterOf, monsterTile } from './monsters';
import { Rng } from './rng';
import { RULES } from './rules';
import {
  canSeeHiddenBases,
  decaySatellites,
  disasterFactor,
  fireLaser,
  launchSatellite,
  launchSuccessRate,
  repairCost,
  repairSatellite,
  SATELLITE_RULES,
  SATELLITES,
} from './satellites';
import { deserialize, serialize } from './save';
import { newResearch } from './tech';
import { advanceTurn } from './turn';
import type { Island, LogEntry, TechId } from './types';

function island(id: string): Island {
  return {
    id,
    name: `${id}島`,
    size: 8,
    tiles: Array.from({ length: 64 }, () => ({ kind: 'plains' as const, value: 0 })),
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

function withTech(target: Island, ...ids: TechId[]): Island {
  target.research.done.push(...ids);
  return target;
}

function fixedRng(value: number): Rng {
  const rng = new Rng(1);
  rng.next = () => value;
  return rng;
}

function world(islands: Island[], turn = 200, peaceful = false): World & { logs: Omit<LogEntry, 'turn'>[] } {
  const logs: Omit<LogEntry, 'turn'>[] = [];
  return { islands, turn, peaceful, logs, emit: (e) => logs.push(e) };
}

function ctx(w: World, rng: Rng): CommandContext {
  return { effects: { attract: false }, rng, world: w };
}

const noLog = () => {};

describe('打ち上げと修復', () => {
  it('研究がないと打ち上げられず、資金も減らない', () => {
    const a = island('a');
    const result = launchSatellite(a, 'weather', fixedRng(0));
    expect(result.ok).toBe(false);
    expect(a.money).toBe(100000);
  });

  it('成功すると耐久100で衛星が加わり、失敗しても費用はかかる', () => {
    const a = withTech(island('a'), 'rocket');
    expect(launchSatellite(a, 'weather', fixedRng(0.9)).ok).toBe(true); // 0.9 ≥ 80% なので失敗
    expect(a.satellites.weather).toBeUndefined();
    expect(a.money).toBe(100000 - SATELLITES.weather.cost);
    expect(launchSatellite(a, 'weather', fixedRng(0.1)).ok).toBe(true);
    expect(a.satellites.weather).toBe(SATELLITE_RULES.launchDurability);
    expect(a.money).toBe(100000 - SATELLITES.weather.cost * 2);
    // 同じ衛星は2つ打ち上げられない
    expect(launchSatellite(a, 'weather', fixedRng(0.1)).ok).toBe(false);
  });

  it('打ち上げ改良で失敗する確率が半分になる', () => {
    const a = withTech(island('a'), 'rocket');
    expect(launchSuccessRate(a, 'weather')).toBeCloseTo(0.8);
    withTech(a, 'launchUp');
    expect(launchSuccessRate(a, 'weather')).toBeCloseTo(0.9);
  });

  it('耐久は毎ターン減って0で失われ、修復すると戻る', () => {
    const a = withTech(island('a'), 'rocket');
    a.satellites.weather = 2;
    decaySatellites(a, noLog);
    expect(a.satellites.weather).toBe(1);
    const lost: string[] = [];
    decaySatellites(a, (text) => lost.push(text));
    expect(a.satellites.weather).toBeUndefined();
    expect(lost[0]).toContain('気象衛星');

    expect(repairSatellite(a, 'weather').ok).toBe(false); // ない衛星は修復できない
    a.satellites.weather = 10;
    expect(repairSatellite(a, 'weather').ok).toBe(true);
    expect(a.satellites.weather).toBe(SATELLITE_RULES.repairDurability);
    expect(a.money).toBe(100000 - repairCost('weather'));
  });

  it('予約した打ち上げは、ターンが進むと実行される', () => {
    let state = newGame(5);
    const me = state.islands[0]!;
    me.research.done.push('rocket');
    me.money = 100000;
    state = enqueueSatellite(state, 'launchSatellite', 'weather');
    const next = advanceTurn(state);
    const after = next.islands[0]!;
    expect(after.money).toBeLessThan(100000 - SATELLITES.weather.cost + 1000);
    expect(next.log.some((l) => l.text.includes('気象衛星の打ち上げ'))).toBe(true);
  });
});

describe('衛星の効果', () => {
  it('気象・観測・迎撃衛星はそれぞれの災害を起きにくくする', () => {
    const a = island('a');
    expect(disasterFactor(a, 'typhoon')).toBe(1);
    a.satellites = { weather: 50, observation: 50, intercept: 50 };
    expect(disasterFactor(a, 'typhoon')).toBe(SATELLITE_RULES.typhoonFactor);
    expect(disasterFactor(a, 'earthquake')).toBe(SATELLITE_RULES.quakeFactor);
    expect(disasterFactor(a, 'eruption')).toBe(SATELLITE_RULES.quakeFactor);
    expect(disasterFactor(a, 'meteor')).toBe(SATELLITE_RULES.meteorFactor);
    expect(disasterFactor(a, 'hugeMeteor')).toBe(SATELLITE_RULES.meteorFactor);
  });

  it('台風の確率が下がると、同じ乱数でも台風が起きなくなる', () => {
    // 3回目の判定（台風）だけ 0.004：台風の確率 0.005 には当たるが、0.005×0.2 には当たらない
    const make = () => {
      const rng = new Rng(1);
      let calls = 0;
      rng.next = () => (++calls === 3 ? 0.004 : 0.99);
      return rng;
    };
    const plain = island('a');
    const logs: string[] = [];
    runDisasters(plain, make(), 1, (t) => logs.push(t));
    expect(logs.some((t) => t.includes('台風'))).toBe(true);

    const covered = island('b');
    covered.satellites.weather = 50;
    const logs2: string[] = [];
    runDisasters(covered, make(), 1, (t) => logs2.push(t));
    expect(logs2.some((t) => t.includes('台風'))).toBe(false);
  });

  it('迎撃衛星は他の島から飛んできたミサイルを確率で撃ち落とす', () => {
    const a = withTech(island('a'), 'pinpoint');
    const b = island('b');
    setTile(a, 0, 0, 'missileBase', 0);
    setTile(a, 7, 7, 'windPower', 3);
    setTile(b, 4, 4, 'town', 100);
    b.satellites.intercept = 50;
    const w = world([a, b]);
    fireMissiles(w, a, 'missilePinpoint', 4, 4, 'b', 0, fixedRng(0.1)); // 0.1 < 30% なので撃ち落とす
    expect(tileAt(b, 4, 4).kind).toBe('town');
    fireMissiles(w, a, 'missilePinpoint', 4, 4, 'b', 0, fixedRng(0.5));
    expect(tileAt(b, 4, 4).kind).toBe('waste');
  });

  it('観測衛星があると他の島の基地が見える', () => {
    const a = island('a');
    expect(canSeeHiddenBases(a)).toBe(false);
    a.satellites.observation = 1;
    expect(canSeeHiddenBases(a)).toBe(true);
  });
});

describe('衛星レーザー', () => {
  it('狙ったマスを確実に壊し、費用と耐久が減る', () => {
    const a = island('a');
    const b = island('b');
    a.satellites.military = 100;
    setTile(b, 3, 3, 'interceptor');
    const w = world([a, b]);
    const result = executeCommand(a, 'satelliteLaser', 3, 3, ctx(w, new Rng(1)), { targetIslandId: 'b' });
    expect(result.ok).toBe(true);
    expect(tileAt(b, 3, 3).kind).toBe('waste');
    expect(a.money).toBe(100000 - SATELLITE_RULES.laserCost);
    expect(a.satellites.military).toBe(100 - SATELLITE_RULES.laserWear);
    expect(b.lastAttackedBy).toEqual({ islandId: 'a', turn: 200 });
    expect(w.logs[0]?.islandId).toBe('b');
  });

  it('怪獣は体力が1減る', () => {
    const a = island('a');
    const b = island('b');
    a.satellites.military = 100;
    setTile(b, 2, 2, 'plains');
    b.tiles[2 * 8 + 2] = monsterTile('m1', 3); // m1 は硬くならない
    fireLaser(world([a, b]), a, 2, 2, 'b');
    expect(monsterOf(tileAt(b, 2, 2))).toEqual({ def: MONSTERS.m1, hp: 2 });
  });

  it('軍事衛星がない・序盤の保護・平和モードでは撃てない', () => {
    const a = island('a');
    const b = island('b');
    setTile(b, 3, 3, 'town', 50);
    expect(fireLaser(world([a, b]), a, 3, 3, 'b').ok).toBe(false);
    a.satellites.military = 100;
    expect(fireLaser(world([a, b], RULES.protectionTurns), a, 3, 3, 'b').ok).toBe(false);
    expect(fireLaser(world([a, b], 200, true), a, 3, 3, 'b').ok).toBe(false);
    expect(tileAt(b, 3, 3).kind).toBe('town');
    expect(a.money).toBe(100000);
  });

  it('耐久がレーザーで0になると軍事衛星は失われる', () => {
    const a = island('a');
    const b = island('b');
    a.satellites.military = SATELLITE_RULES.laserWear;
    fireLaser(world([a, b]), a, 1, 1, 'b');
    expect(a.satellites.military).toBeUndefined();
  });

  it('予約に目標の島とマスが入る', () => {
    const state = enqueueLaser(newGame(3), 'ai-east', 4, 5);
    const command = state.islands[0]!.queue.at(-1)!;
    expect(command).toMatchObject({ kind: 'satelliteLaser', targetIslandId: 'ai-east', x: 4, y: 5 });
  });
});

describe('セーブデータ', () => {
  it('衛星の状態が保存され、版4のデータには空の衛星を補う', () => {
    const state = newGame(9);
    state.islands[0]!.satellites.weather = 42;
    expect(deserialize(serialize(state)).islands[0]!.satellites.weather).toBe(42);

    const old = JSON.parse(serialize(state)) as { version: number; state: { version: number; islands: Record<string, unknown>[] } };
    old.version = 4;
    old.state.version = 4;
    for (const i of old.state.islands) delete i.satellites;
    const migrated = deserialize(JSON.stringify(old));
    expect(migrated.version).toBe(5);
    expect(migrated.islands.every((i) => typeof i.satellites === 'object')).toBe(true);
  });
});
