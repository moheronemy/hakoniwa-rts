import { tileAt, setTile, terrainName, isSea } from './island';
import type { World } from './military';
import { isHardened, monsterOf, monsterTile } from './monsters';
import type { Rng } from './rng';
import { RULES } from './rules';
import { hasTech, TECHS } from './tech';
import type { Island, SatelliteKind, TechId } from './types';

/**
 * 人工衛星（仕様書24章）。数値はすべて仮。
 */
export interface SatelliteDef {
  kind: SatelliteKind;
  name: string;
  /** 打ち上げの費用（億円）。修復はこの半分 */
  cost: number;
  /** 打ち上げが成功する確率 */
  success: number;
  tech: TechId;
  description: string;
}

export const SATELLITE_LIST: readonly SatelliteDef[] = [
  { kind: 'weather', name: '気象衛星', cost: 3000, success: 0.8, tech: 'rocket', description: '台風が起きる確率が1/5になる' },
  { kind: 'observation', name: '観測衛星', cost: 5000, success: 0.7, tech: 'observeSat', description: '地震・津波・噴火が半分に減り、他の島のミサイル基地と海底基地が見える' },
  { kind: 'intercept', name: '迎撃衛星', cost: 8000, success: 0.6, tech: 'interceptSat', description: '隕石が3割に減り、飛んできたミサイルを30%の確率で撃ち落とす' },
  { kind: 'military', name: '軍事衛星', cost: 15000, success: 0.5, tech: 'militarySat', description: '衛星レーザーで、他の島の狙ったマスを確実に壊せる（迎撃されない）' },
];

export const SATELLITES: Readonly<Record<SatelliteKind, SatelliteDef>> = Object.fromEntries(
  SATELLITE_LIST.map((d) => [d.kind, d]),
) as Record<SatelliteKind, SatelliteDef>;

export const SATELLITE_RULES = {
  /** 打ち上げたときの耐久 */
  launchDurability: 100,
  /** 修復したときの耐久 */
  repairDurability: 150,
  /** 1ターンに減る耐久 */
  decayPerTurn: 1,
  /** 衛星レーザー1回で減る耐久 */
  laserWear: 10,
  /** 衛星レーザー1回の費用（億円） */
  laserCost: 2000,
  /** 迎撃衛星がミサイルを撃ち落とす確率 */
  interceptChance: 0.3,
  /** 災害の確率に掛ける値 */
  typhoonFactor: 0.2,
  quakeFactor: 0.5,
  meteorFactor: 0.3,
} as const;

export function hasSatellite(island: Island, kind: SatelliteKind): boolean {
  return (island.satellites[kind] ?? 0) > 0;
}

/** 観測衛星があると、他の島の基地が見える */
export function canSeeHiddenBases(island: Island): boolean {
  return hasSatellite(island, 'observation');
}

export function launchSuccessRate(island: Island, kind: SatelliteKind): number {
  const base = SATELLITES[kind].success;
  return hasTech(island, 'launchUp') ? 1 - (1 - base) / 2 : base;
}

export function repairCost(kind: SatelliteKind): number {
  return Math.floor(SATELLITES[kind].cost / 2);
}

/** 打ち上げられない理由（資金は見ない）。打ち上げられるなら null */
export function launchProblem(island: Island, kind: SatelliteKind | undefined): string | null {
  if (!kind) return '衛星の種類を選んでください';
  const def = SATELLITES[kind];
  if (!hasTech(island, def.tech)) return `研究「${TECHS[def.tech].name}」が必要です`;
  if (hasSatellite(island, kind)) return `${def.name}はすでに打ち上げてあります（修復はできます）`;
  return null;
}

export function repairProblem(island: Island, kind: SatelliteKind | undefined): string | null {
  if (!kind) return '衛星の種類を選んでください';
  return hasSatellite(island, kind) ? null : `${SATELLITES[kind].name}がありません`;
}

type Result = { ok: true; message: string; tone: 'good' | 'bad' } | { ok: false; message: string };

/** 打ち上げ（失敗すると費用だけかかる） */
export function launchSatellite(island: Island, kind: SatelliteKind | undefined, rng: Rng): Result {
  const problem = launchProblem(island, kind);
  if (problem || !kind) return { ok: false, message: `人工衛星打ち上げ：${problem}` };
  const def = SATELLITES[kind];
  if (island.money < def.cost) return { ok: false, message: `${def.name}打ち上げ：資金が足りません（${def.cost}億円必要）` };
  island.money -= def.cost;
  if (rng.next() >= launchSuccessRate(island, kind)) {
    return { ok: true, message: `${def.name}の打ち上げに失敗した…`, tone: 'bad' };
  }
  island.satellites[kind] = SATELLITE_RULES.launchDurability;
  return { ok: true, message: `${def.name}の打ち上げに成功した！`, tone: 'good' };
}

export function repairSatellite(island: Island, kind: SatelliteKind | undefined): Result {
  const problem = repairProblem(island, kind);
  if (problem || !kind) return { ok: false, message: `人工衛星修復：${problem}` };
  const cost = repairCost(kind);
  if (island.money < cost) return { ok: false, message: `${SATELLITES[kind].name}修復：資金が足りません（${cost}億円必要）` };
  island.money -= cost;
  island.satellites[kind] = SATELLITE_RULES.repairDurability;
  return { ok: true, message: `${SATELLITES[kind].name}を修復した`, tone: 'good' };
}

/** 毎ターン耐久が減り、0になった衛星は失われる */
export function decaySatellites(island: Island, log: (text: string, tone?: 'info' | 'good' | 'bad') => void): void {
  for (const kind of Object.keys(island.satellites) as SatelliteKind[]) {
    const left = (island.satellites[kind] ?? 0) - SATELLITE_RULES.decayPerTurn;
    if (left > 0) {
      island.satellites[kind] = left;
    } else {
      delete island.satellites[kind];
      log(`${SATELLITES[kind].name}が寿命で失われた`, 'bad');
    }
  }
}

/** 災害の確率に掛ける値（衛星がなければ1） */
export function disasterFactor(island: Island, disaster: string): number {
  if (disaster === 'typhoon' && hasSatellite(island, 'weather')) return SATELLITE_RULES.typhoonFactor;
  if ((disaster === 'earthquake' || disaster === 'tsunami' || disaster === 'eruption') && hasSatellite(island, 'observation')) {
    return SATELLITE_RULES.quakeFactor;
  }
  if ((disaster === 'meteor' || disaster === 'hugeMeteor') && hasSatellite(island, 'intercept')) {
    return SATELLITE_RULES.meteorFactor;
  }
  return 1;
}

/** 衛星レーザーを撃てない理由（資金は見ない）。撃てるなら null */
export function laserProblem(
  world: Pick<World, 'islands' | 'turn' | 'peaceful'>,
  island: Island,
  targetIslandId: string | undefined,
): string | null {
  if (!hasSatellite(island, 'military')) return '軍事衛星がありません';
  const target = world.islands.find((i) => i.id === targetIslandId);
  if (!target || target.destroyed) return '目標の島がありません';
  if (target.id !== island.id) {
    if (world.peaceful) return '平和モードでは他の島を攻撃できません';
    if (world.turn <= RULES.protectionTurns) return `${RULES.protectionTurns}ターン目までは攻撃できません`;
  }
  return null;
}

/**
 * 衛星レーザー：狙ったマスを確実に壊す（迎撃されない）。怪獣は体力が1減る（硬化中は効かない）。
 */
export function fireLaser(
  world: World,
  island: Island,
  x: number,
  y: number,
  targetIslandId: string | undefined,
): Result {
  const problem = laserProblem(world, island, targetIslandId);
  if (problem) return { ok: false, message: `衛星レーザー：${problem}` };
  if (island.money < SATELLITE_RULES.laserCost) {
    return { ok: false, message: `衛星レーザー：資金が足りません（${SATELLITE_RULES.laserCost}億円必要）` };
  }
  const target = world.islands.find((i) => i.id === targetIslandId)!;
  island.money -= SATELLITE_RULES.laserCost;
  island.satellites.military = (island.satellites.military ?? 0) - SATELLITE_RULES.laserWear;
  if ((island.satellites.military ?? 0) <= 0) delete island.satellites.military;

  const tile = tileAt(target, x, y);
  let effect: string;
  if (tile.kind === 'monster') {
    const { def, hp } = monsterOf(tile);
    if (isHardened(def, world.turn)) effect = `${def.name}は硬くなっていて効かなかった`;
    else if (hp <= 1) {
      setTile(target, x, y, 'waste');
      island.money += def.value;
      effect = `${def.name}を倒した（${def.value}億円）`;
    } else {
      target.tiles[y * target.size + x] = monsterTile(def.id, hp - 1);
      effect = `${def.name}の体力を1減らした`;
    }
  } else if (isSea(tile.kind) && tile.kind !== 'oilField') {
    effect = '海に当たり、効果はなかった';
  } else if (tile.kind === 'waste' || tile.kind === 'mountain') {
    effect = `${terrainName(tile)}に当たり、効果はなかった`;
  } else {
    effect = `${terrainName(tile)}を破壊した`;
    setTile(target, x, y, tile.kind === 'oilField' || tile.kind === 'seaBase' ? 'deepSea' : 'waste');
  }

  const message = `${target.name} (${x}, ${y}) に衛星レーザーを撃った：${effect}`;
  if (target.id !== island.id) {
    target.lastAttackedBy = { islandId: island.id, turn: world.turn };
    world.emit({
      islandId: target.id,
      text: `${island.name}の衛星レーザーが (${x}, ${y}) に命中：${effect}`,
      tone: 'bad',
      involves: [island.id],
    });
  }
  return { ok: true, message, tone: 'good' };
}
