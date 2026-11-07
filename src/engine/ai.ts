import { breedCost, breedProblem, commandCost, readyMonsters, targetProblem } from './commands';
import { forecast } from './forecast';
import { hexDistance } from './hex';
import { islandStats, tileAt, visibleTile } from './island';
import { MISSILES, missileCapacity, missileProblem, type World } from './military';
import { isHardened, MONSTER_LIST, monsterOf } from './monsters';
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
  /** 欲しい怪獣研究所の数（怪獣使い型だけ） */
  monsterLabs: number;
  research: TechId[];
}

const PROFILES: Record<AiController, Profile> = {
  military: {
    bases: (t) => (t < 60 ? 0 : Math.min(8, 2 + Math.floor(t / 120))),
    interceptors: (t, _pop, attacked) => 1 + (attacked ? 1 : 0) + Math.floor(t / 400),
    labLevels: 3,
    attackEvery: () => 3,
    monsterLabs: 0,
    research: ['guidance', 'interceptUp', 'betterWind', 'automation', 'landBuster', 'pinpoint', 'baseAuto', 'reclaim1', 'nukeTech', 'seaBaseTech'],
  },
  economic: {
    bases: (t) => (t < 500 ? 0 : Math.min(3, 1 + Math.floor((t - 500) / 300))),
    interceptors: (_t, pop, attacked) => 1 + Math.floor(pop / 3000) + (attacked ? 1 : 0),
    labLevels: 9,
    attackEvery: (t, attacked) => (attacked || t > 800 ? 12 : 0),
    monsterLabs: 0,
    research: ['automation', 'betterWind', 'guidance', 'reclaim1', 'bigFarm', 'turbine', 'interceptUp', 'reclaim2', 'grid', 'cityPlan'],
  },
  tamer: {
    bases: (t) => (t < 120 ? 0 : Math.min(3, 1 + Math.floor(t / 250))),
    interceptors: (_t, pop, attacked) => 1 + Math.floor(pop / 5000) + (attacked ? 1 : 0),
    labLevels: 6,
    attackEvery: (t) => (t > 200 ? 10 : 0),
    monsterLabs: 1,
    research: ['bio1', 'betterWind', 'automation', 'bio2', 'interceptUp', 'reclaim1', 'bio3', 'turbine', 'bio4', 'guidance'],
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
  return findSiteIn(island, kind, rng, prefer, false);
}

/**
 * 平地などが見つからなければ、人口のいちばん少ない住宅地に建てる（狭い島で農場や工場を作るため）。
 */
function findSiteOrTown(island: Island, kind: 'farm' | 'factory' | 'lab', rng: Rng): Command | null {
  return findSiteIn(island, kind, rng, undefined, false) ?? findSiteIn(island, kind, rng, (x, y) => -tileAt(island, x, y).value, true);
}

function findSiteIn(
  island: Island,
  kind: CommandKind,
  rng: Rng,
  prefer: ((x: number, y: number) => number) | undefined,
  townsOnly: boolean,
): Command | null {
  if (island.money < commandCost(island, kind)) return null;
  const order = rng.permutation(island.tiles.length);
  let best: { x: number; y: number; score: number } | null = null;
  for (const index of order) {
    const x = index % island.size;
    const y = Math.floor(index / island.size);
    const tile = tileAt(island, x, y);
    if ((tile.kind === 'town') !== townsOnly) continue;
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

  // 1. 食料（平地がなければ、人口の少ない村を農場にする）
  if (f.food < Math.max(3, stats.pop * 0.02)) {
    const c = findSiteOrTown(island, 'farm', rng);
    if (c) return c;
  }

  // 1.5 島が狭いので、平地や荒地が少なくなったら埋め立てで広げる
  if (count(island, 'plains') + count(island, 'waste') < 4 && island.money > 300) {
    const c = findSite(island, 'reclaim', rng, (x, y) => (tileAt(island, x, y).kind === 'shallow' ? 1 : 0));
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

  // 3.5 工場（働き口が足りない）。収入の元なので、軍備や研究より先に建てる
  if (stats.pop - stats.farm * 10 > stats.factory * 10 && f.power.supply >= f.power.demand) {
    const c = findSiteOrTown(island, 'factory', rng);
    if (c) return c;
  }

  // 3.6 研究所が1つもなければ建てる（狭い島では後回しにすると、いつまでも建たない）
  if (count(island, 'lab') === 0 && turn > 30 && island.money > 600) {
    const c = findSiteOrTown(island, 'lab', rng);
    if (c) return c;
  }

  // 4. 自分の島に出た怪獣を撃つ。基地がなければ、まず基地を建てる
  const hunt = huntMonsters(world, island, rng);
  if (hunt) return hunt;
  if (island.tiles.some((t) => t.kind === 'monster') && missileCapacity(island) === 0) {
    const c = findSite(island, 'missileBase', rng);
    if (c) return c;
  }

  // 5. 怪獣を育てて送る（怪獣使い型）。6. 攻撃。平和モードでは他の島を攻撃しない
  if (!world.peaceful) {
    const tame = planMonsters(world, island, profile, rng, attacked);
    if (tame) return tame;
    const attack = planAttack(world, island, profile, rng, attacked);
    if (attack) return attack;
  }

  // 7. 守り（迎撃施設）
  if (count(island, 'interceptor') < profile.interceptors(turn, stats.pop, attacked) && stats.pop > 200) {
    const c = findSite(island, 'interceptor', rng, (x, y) => townsAround(island, x, y));
    if (c) return c;
  }

  // 8. ミサイル基地
  if (count(island, 'missileBase') + count(island, 'seaBase') < profile.bases(turn)) {
    const c = (hasTech(island, 'seaBaseTech') && island.money > 6000 ? findSite(island, 'seaBase', rng) : null) ??
      findSite(island, 'missileBase', rng);
    if (c) return c;
  }

  // 9. 石油（基地があるのに石油が少ない）
  const needsOil = count(island, 'thermalPower') > 0 || count(island, 'missileBase') > 0;
  if (needsOil && island.oil < 40 && oilProduction(island) === 0 && island.money > 800) {
    const c = findSite(island, 'oilSearch', rng);
    if (c) return c;
  }

  // 10. 研究所
  const labLevels = island.tiles.reduce((sum, t) => sum + (t.kind === 'lab' ? t.value : 0), 0);
  if (labLevels < profile.labLevels && turn > 20 && island.money > 700) {
    const c = findSite(island, 'lab', rng);
    if (c) return c;
  }

  // 11. 荒地を平地に（村が育つ場所になる）。農場を作る資金を残すため、資金が少ないときはしない
  if (island.money > 60) {
    const prepare = findSite(island, 'prepare', rng);
    if (prepare) return prepare;
  }

  // 12. 資金に余裕があれば、埋め立てで島を広げる
  if (island.money > 1500) {
    const c = findSite(island, 'reclaim', rng, (x, y) => (tileAt(island, x, y).kind === 'shallow' ? 1 : 0));
    if (c) return c;
  }

  // 13. 余った石油を売る
  if (island.oil > 300) return cmd('sellOil');

  // 14. 余裕があれば誘致活動
  if (island.money > 5000 && f.power.ratio >= 1 && stats.pop > 3000) return cmd('attract');

  return null;
}

/** 自分の島に怪獣がいれば、硬くなっていない怪獣をミサイルで撃つ */
function huntMonsters(world: World, island: Island, rng: Rng): Command | null {
  if (missileCapacity(island) === 0) return null;
  const targets: Array<{ x: number; y: number; hp: number }> = [];
  island.tiles.forEach((t, i) => {
    if (t.kind !== 'monster') return;
    const { def, hp } = monsterOf(t);
    if (!isHardened(def, world.turn)) targets.push({ x: i % island.size, y: Math.floor(i / island.size), hp });
  });
  if (targets.length === 0) return null;
  const target = targets[rng.int(targets.length)]!;
  // 自分の施設を巻き込まないよう、ばらつきの小さい弾から使う
  const kinds: MissileKind[] = ['missilePinpoint', 'missilePrecise', 'missileNormal'];
  for (const kind of kinds) {
    const def = MISSILES[kind];
    if (def.tech && !hasTech(island, def.tech)) continue;
    if (island.money < def.money || island.oil < def.oil) continue;
    if (missileProblem(world, island, kind, island.id) !== null) continue;
    return cmd(kind, target.x, target.y, { targetIslandId: island.id, count: target.hp });
  }
  return null;
}

/** 怪獣使い型：怪獣研究所を建て、怪獣を育てて送る */
function planMonsters(world: World, island: Island, profile: Profile, rng: Rng, attacked: boolean): Command | null {
  if (profile.monsterLabs === 0 || !hasTech(island, 'bio1')) return null;

  // 育ち上がった怪獣がいれば送る
  if (readyMonsters(island, world.turn).length > 0 && world.turn > RULES.protectionTurns) {
    const enemies = world.islands.filter((i) => i.id !== island.id && !i.destroyed);
    const recent = island.lastAttackedBy;
    const revenge = attacked && recent ? enemies.find((e) => e.id === recent.islandId) : undefined;
    const target = leaderToStop(world, enemies) ?? revenge ?? [...enemies].sort((a, b) => islandScore(b) - islandScore(a))[0];
    if (target) return cmd('sendMonster', 0, 0, { targetIslandId: target.id });
  }

  // 空いている研究所で、育てられる中でいちばん強い段階の怪獣を育てる
  const freeLab = island.tiles.findIndex(
    (t, i) => t.kind === 'monsterLab' && !island.breeding.some((b) => b.x === i % island.size && b.y === Math.floor(i / island.size)),
  );
  if (freeLab >= 0) {
    const options = MONSTER_LIST.filter((m) => breedProblem(island, m.id) === null && island.money >= breedCost(m.id) + 1000);
    const best = options.filter((m) => m.stage === Math.max(...options.map((o) => o.stage)));
    if (best.length > 0) {
      const pick = best[rng.int(best.length)]!;
      return cmd('breed', freeLab % island.size, Math.floor(freeLab / island.size), { monster: pick.id });
    }
  }

  // 研究所を建てる
  if (count(island, 'monsterLab') < profile.monsterLabs) return findSite(island, 'monsterLab', rng);
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
  const target = leaderToStop(world, enemies) ?? (island.controller === 'military' ? strongest : (revenge ?? strongest));

  const kind = chooseMissile(island);
  if (!kind) return null;
  if (missileProblem(world, island, kind, target.id) !== null) return null;

  const aim = chooseAim(target, rng);
  if (!aim) return null;
  return cmd(kind, aim.x, aim.y, { targetIslandId: target.id, count: 0 });
}

/**
 * 経済的制覇に近づいた島（目標人口の60%以上で、いちばん人口の多い島）。いなければ undefined。
 * どの AI もこの島を優先して攻撃し、先行する島の独走を止める。
 */
function leaderToStop(world: World, enemies: Island[]): Island | undefined {
  if (!world.economicTarget) return undefined;
  const leader = [...enemies].sort((a, b) => islandStats(b).pop - islandStats(a).pop)[0];
  return leader && islandStats(leader).pop >= world.economicTarget * 0.6 ? leader : undefined;
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
