import { commandCost, targetProblem } from './commands';
import { forecast } from './forecast';
import { hexDistance } from './hex';
import { islandStats, tileAt, visibleTile } from './island';
import { MISSILES, missileCapacity, missileProblem, type World } from './military';
import { oilProduction } from './power';
import type { Rng } from './rng';
import { PLANTS, RULES } from './rules';
import { islandScore } from './score';
import { canResearch, hasTech, TECH_LIST } from './tech';
import type { Command, CommandKind, Controller, Island, MissileKind, TechId, TerrainKind } from './types';

/**
 * AI の島の判断（仕様書18章）。プレイヤーと同じルールで、1ターンに1命令を予約する。
 * 他の島については、プレイヤーと同じく見える情報（visibleTile）だけを使う。
 */

type AiController = Exclude<Controller, 'player'>;

interface Profile {
  /** 欲しいミサイル基地の数 */
  bases: (turn: number) => number;
  /** 欲しい迎撃施設の数 */
  interceptors: (turn: number, pop: number, attacked: boolean) => number;
  /** 欲しい研究所の段階の合計 */
  labLevels: number;
  /** 何ターンおきに攻撃するか（0 なら攻撃しない） */
  attackEvery: (turn: number, attacked: boolean) => number;
  research: TechId[];
}

const PROFILES: Record<AiController, Profile> = {
  military: {
    bases: (t) => (t < 60 ? 0 : Math.min(8, 2 + Math.floor(t / 120))),
    interceptors: (t, _pop, attacked) => 1 + (attacked ? 1 : 0) + Math.floor(t / 400),
    labLevels: 3,
    attackEvery: () => 3,
    research: ['guidance', 'interceptUp', 'betterWind', 'automation', 'landBuster', 'pinpoint', 'baseAuto', 'reclaim1', 'nukeTech', 'seaBaseTech'],
  },
  economic: {
    bases: (t) => (t < 500 ? 0 : Math.min(3, 1 + Math.floor((t - 500) / 300))),
    interceptors: (_t, pop, attacked) => 1 + Math.floor(pop / 3000) + (attacked ? 1 : 0),
    labLevels: 9,
    attackEvery: (t, attacked) => (attacked || t > 800 ? 12 : 0),
    research: ['automation', 'betterWind', 'reclaim1', 'bigFarm', 'turbine', 'interceptUp', 'reclaim2', 'grid', 'cityPlan', 'oilProspect'],
  },
  balanced: {
    bases: (t) => (t < 120 ? 0 : Math.min(4, 1 + Math.floor(t / 200))),
    interceptors: (_t, pop, attacked) => 1 + Math.floor(pop / 5000) + (attacked ? 1 : 0),
    labLevels: 6,
    attackEvery: (t) => (t > 150 ? 6 : 0),
    research: ['betterWind', 'automation', 'guidance', 'interceptUp', 'reclaim1', 'turbine', 'bigFarm', 'landBuster', 'grid', 'cityPlan'],
  },
};

/** AI の島の次の命令を決めて、命令予約を置き換える */
export function planAI(world: World, island: Island, rng: Rng): void {
  if (island.controller === 'player') return;
  const profile = PROFILES[island.controller];
  chooseResearch(island, profile);
  const command = decide(world, island, profile, rng);
  island.queue = command ? [command] : [];
}

function chooseResearch(island: Island, profile: Profile): void {
  if (island.research.current && canResearch(island, island.research.current)) return;
  const next =
    profile.research.find((id) => canResearch(island, id)) ?? TECH_LIST.find((t) => canResearch(island, t.id))?.id;
  island.research.current = next ?? null;
}

function cmd(kind: CommandKind, x = 0, y = 0, extra: Partial<Command> = {}): Command {
  return { id: 0, kind, x, y, ...extra };
}

function count(island: Island, kind: TerrainKind): number {
  return island.tiles.filter((t) => t.kind === kind).length;
}

/**
 * 建てられるマスを探す。まず「重ねて規模や段階を上げる」マスを探し、なければ新しいマスを探す。
 * 住宅地には建てない（人口を減らさないため）。
 */
function findSite(island: Island, kind: CommandKind, rng: Rng, prefer?: (x: number, y: number) => number): Command | null {
  if (island.money < commandCost(island, kind)) return null;
  const order = rng.permutation(island.tiles.length);
  let best: { x: number; y: number; score: number } | null = null;
  for (const index of order) {
    const x = index % island.size;
    const y = Math.floor(index / island.size);
    const tile = tileAt(island, x, y);
    if (tile.kind === 'town') continue;
    if (targetProblem(island, kind, x, y) !== null) continue;
    // 重ねて建てられるならそれを優先する
    const upgrade = tile.kind === kind || (kind === 'farm' && tile.kind === 'farm') || (kind === 'factory' && tile.kind === 'factory');
    const score = (upgrade ? 1000 : 0) + (prefer ? prefer(x, y) : 0);
    if (!best || score > best.score) best = { x, y, score };
    if (!prefer && upgrade) break;
  }
  return best ? cmd(kind, best.x, best.y) : null;
}

/** そのマスの周囲2マスにある住宅地の人口（迎撃施設の置き場所の評価に使う） */
function townsAround(island: Island, x: number, y: number): number {
  let total = 0;
  island.tiles.forEach((t, i) => {
    if (t.kind === 'town' && hexDistance(x, y, i % island.size, Math.floor(i / island.size)) <= RULES.interceptRange) {
      total += t.value;
    }
  });
  return total;
}

function decide(world: World, island: Island, profile: Profile, rng: Rng): Command | null {
  const turn = world.turn;
  const f = forecast(island);
  const stats = islandStats(island);
  const attacked = island.lastAttackedBy !== null && turn - island.lastAttackedBy.turn < 100;

  // 1. 食料
  if (f.food < Math.max(3, stats.pop * 0.02)) {
    const c = findSite(island, 'farm', rng);
    if (c) return c;
  }

  // 2. 火力発電の燃料が尽きそうなら、先に油田を探す
  if (f.power.fuelNeed > 0 && island.oil < f.power.fuelNeed * 5 && oilProduction(island) === 0 && island.money > 800) {
    const c = findSite(island, 'oilSearch', rng);
    if (c) return c;
  }

  // 3. 電力
  if (f.power.supply < f.power.demand * 1.05 + 5) {
    const c = buildPower(island, rng);
    if (c) return c;
  }

  // 4. 攻撃
  const attack = planAttack(world, island, profile, rng, attacked);
  if (attack) return attack;

  // 5. 守り（迎撃施設）
  if (count(island, 'interceptor') < profile.interceptors(turn, stats.pop, attacked) && stats.pop > 200) {
    const c = findSite(island, 'interceptor', rng, (x, y) => townsAround(island, x, y));
    if (c) return c;
  }

  // 6. ミサイル基地
  if (count(island, 'missileBase') + count(island, 'seaBase') < profile.bases(turn)) {
    const c = (hasTech(island, 'seaBaseTech') && island.money > 6000 ? findSite(island, 'seaBase', rng) : null) ??
      findSite(island, 'missileBase', rng);
    if (c) return c;
  }

  // 7. 石油（基地があるのに石油が少ない）
  const needsOil = count(island, 'thermalPower') > 0 || count(island, 'missileBase') > 0;
  if (needsOil && island.oil < 40 && oilProduction(island) === 0 && island.money > 800) {
    const c = findSite(island, 'oilSearch', rng);
    if (c) return c;
  }

  // 8. 研究所
  const labLevels = island.tiles.reduce((sum, t) => sum + (t.kind === 'lab' ? t.value : 0), 0);
  if (labLevels < profile.labLevels && turn > 20 && island.money > 700) {
    const c = findSite(island, 'lab', rng);
    if (c) return c;
  }

  // 9. 工場（働き口が足りない）
  if (stats.pop - stats.farm * 10 > stats.factory * 10) {
    const c = findSite(island, 'factory', rng);
    if (c) return c;
  }

  // 10. 荒地を平地に
  const prepare = findSite(island, 'prepare', rng);
  if (prepare) return prepare;

  // 11. 平地がなくなったら浅瀬を埋め立てる
  if (count(island, 'plains') < 3) {
    const c = findSite(island, 'reclaim', rng, (x, y) => (tileAt(island, x, y).kind === 'shallow' ? 1 : 0));
    if (c) return c;
  }

  // 12. 余った石油を売る
  if (island.oil > 300) return cmd('sellOil');

  // 13. 余裕があれば誘致活動
  if (island.money > 5000 && f.power.ratio >= 1 && stats.pop > 3000) return cmd('attract');

  return null;
}

function buildPower(island: Island, rng: Rng): Command | null {
  const reserve = 300;
  if (hasTech(island, 'nuclear') && island.money > PLANTS.nuclearPower.cost + reserve) {
    const c = findSite(island, 'nuclearPower', rng);
    if (c) return c;
  }
  const fuelOk = island.oil >= 20 || oilProduction(island) > 0;
  if (fuelOk && island.money > PLANTS.thermalPower.cost + reserve) {
    const c = findSite(island, 'thermalPower', rng);
    if (c) return c;
  }
  return findSite(island, 'hydroPower', rng) ?? findSite(island, 'windPower', rng);
}

/** 攻撃の相手と弾と狙うマスを決める */
function planAttack(world: World, island: Island, profile: Profile, rng: Rng, attacked: boolean): Command | null {
  const every = profile.attackEvery(world.turn, attacked);
  if (every <= 0) return null;
  if ((world.turn + idOffset(island.id)) % every !== 0) return null;
  if (missileCapacity(island) === 0) return null;

  const enemies = world.islands.filter((i) => i.id !== island.id && !i.destroyed);
  if (enemies.length === 0) return null;
  const recent = island.lastAttackedBy;
  const revenge = recent && world.turn - recent.turn < 100 ? enemies.find((e) => e.id === recent.islandId) : undefined;
  const strongest = [...enemies].sort((a, b) => islandScore(b) - islandScore(a))[0]!;
  const target = island.controller === 'military' ? strongest : (revenge ?? strongest);

  const kind = chooseMissile(island);
  if (!kind) return null;
  if (missileProblem(world, island, kind, target.id) !== null) return null;

  const aim = chooseAim(target, rng);
  if (!aim) return null;
  return cmd(kind, aim.x, aim.y, { targetIslandId: target.id, count: 0 });
}

function chooseMissile(island: Island): MissileKind | null {
  const reserve = 500;
  const can = (kind: MissileKind, shots: number) => {
    const def = MISSILES[kind];
    return (
      (!def.tech || hasTech(island, def.tech)) &&
      island.money >= def.money * shots + reserve &&
      island.oil >= def.oil * shots
    );
  };
  if (island.controller === 'military') {
    if (can('missileNuke', 2)) return 'missileNuke';
    if (can('missileLand', 4)) return 'missileLand';
  }
  if (can('missilePrecise', 3)) return 'missilePrecise';
  if (can('missileNormal', 3)) return 'missileNormal';
  return null;
}

/** 見えている範囲で、人口の多い住宅地を狙う（迎撃施設に守られているマスは避ける） */
function chooseAim(target: Island, rng: Rng): { x: number; y: number } | null {
  const interceptors: Array<{ x: number; y: number }> = [];
  target.tiles.forEach((t, i) => {
    if (visibleTile(t).kind === 'interceptor') interceptors.push({ x: i % target.size, y: Math.floor(i / target.size) });
  });
  let best: { x: number; y: number; score: number } | null = null;
  for (const index of rng.permutation(target.tiles.length)) {
    const tile = visibleTile(target.tiles[index]!);
    if (tile.kind !== 'town' && tile.kind !== 'factory' && tile.kind !== 'farm') continue;
    const x = index % target.size;
    const y = Math.floor(index / target.size);
    const covered = interceptors.some((p) => hexDistance(p.x, p.y, x, y) <= RULES.interceptRange);
    const score = (tile.kind === 'town' ? tile.value : tile.value / 2) - (covered ? 150 : 0);
    if (!best || score > best.score) best = { x, y, score };
  }
  return best;
}

function idOffset(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h;
}
