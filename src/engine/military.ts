import { cellsWithin, hexDistance, inBounds } from './hex';
import { baseLevel, isSea, islandStats, setTile, terrainName, tileAt } from './island';
import { computePower } from './power';
import type { Rng } from './rng';
import { RULES } from './rules';
import { hasTech, TECHS } from './tech';
import type { Island, LogEntry, MissileKind, TechId, TerrainKind } from './types';

/** 命令の実行中に他の島へ手を伸ばすためのもの */
export interface World {
  islands: Island[];
  turn: number;
  emit: (entry: Omit<LogEntry, 'turn'>) => void;
}

type Effect = 'destroy' | 'land' | 'nuke';

export interface MissileDef {
  kind: MissileKind;
  name: string;
  /** 1発あたりの資金 */
  money: number;
  /** 1発あたりの石油 */
  oil: number;
  /** 着弾のばらつき（狙ったマスからの距離の最大） */
  spread: number;
  tech: TechId | null;
  effect: Effect;
  description: string;
}

export const MISSILES: Readonly<Record<MissileKind, MissileDef>> = {
  missileNormal: { kind: 'missileNormal', name: '通常弾', money: 20, oil: 1, spread: 2, tech: null, effect: 'destroy', description: '狙ったマスの周囲2マスのどこかに落ち、そのマスを壊す' },
  missilePrecise: { kind: 'missilePrecise', name: '精密弾', money: 100, oil: 2, spread: 1, tech: 'guidance', effect: 'destroy', description: '狙ったマスの周囲1マスのどこかに落ち、そのマスを壊す' },
  missilePinpoint: { kind: 'missilePinpoint', name: '高精度弾', money: 500, oil: 3, spread: 0, tech: 'pinpoint', effect: 'destroy', description: '狙ったマスにちょうど落ちる。迎撃施設そのものを狙ったときは迎撃されない' },
  missileLand: { kind: 'missileLand', name: '陸地破壊弾', money: 1000, oil: 10, spread: 1, tech: 'landBuster', effect: 'land', description: '着弾した陸地を浅瀬にする（山は荒地に、浅瀬は深い海に）' },
  missileNuke: { kind: 'missileNuke', name: '核弾頭', money: 10000, oil: 50, spread: 1, tech: 'nukeTech', effect: 'nuke', description: '着弾点の周囲2マスを壊滅させる' },
};

export const MISSILE_LIST: readonly MissileDef[] = Object.values(MISSILES);

export function isMissile(kind: string): kind is MissileKind {
  return kind in MISSILES;
}

interface BaseRef {
  x: number;
  y: number;
}

function bases(island: Island): BaseRef[] {
  const result: BaseRef[] = [];
  island.tiles.forEach((tile, i) => {
    if (tile.kind === 'missileBase' || tile.kind === 'seaBase') {
      result.push({ x: i % island.size, y: Math.floor(i / island.size) });
    }
  });
  return result;
}

/** 1回の命令で撃てる発数（基地のレベルの合計 × 電力の供給率。基地があれば最低1） */
export function missileCapacity(island: Island): number {
  const list = bases(island);
  if (list.length === 0) return 0;
  const total = list.reduce((sum, b) => sum + baseLevel(tileAt(island, b.x, b.y)), 0);
  return Math.max(1, Math.floor(total * computePower(island).ratio));
}

/** 撃てない理由（資金・石油は見ない）。撃てるなら null */
export function missileProblem(
  world: Pick<World, 'islands' | 'turn'>,
  island: Island,
  kind: MissileKind,
  targetIslandId: string | undefined,
): string | null {
  const def = MISSILES[kind];
  if (def.tech && !hasTech(island, def.tech)) return `研究「${TECHS[def.tech].name}」が必要です`;
  const target = world.islands.find((i) => i.id === targetIslandId);
  if (!target || target.id === island.id) return '目標の島がありません';
  if (target.destroyed) return '目標の島はすでに滅亡しています';
  if (world.turn <= RULES.protectionTurns) return `${RULES.protectionTurns}ターン目までは攻撃できません`;
  if (bases(island).length === 0) return 'ミサイル基地がありません';
  return null;
}

/** 壊すと経験値が多く入るマス（住宅地や施設） */
const VALUABLE: ReadonlySet<TerrainKind> = new Set([
  'town', 'farm', 'factory', 'windPower', 'hydroPower', 'thermalPower', 'nuclearPower', 'lab',
  'missileBase', 'seaBase', 'interceptor', 'oilField',
]);

interface HitResult {
  /** 陸地に落ちたか */
  onLand: boolean;
  /** 壊したもの（住宅地・施設）の名前 */
  destroyed: string[];
}

/** 通常の着弾：施設や住宅地を荒地にする */
function destroyAt(target: Island, x: number, y: number, result: HitResult): void {
  const tile = tileAt(target, x, y);
  const kind = tile.kind;
  if (!isSea(kind)) result.onLand = true;
  switch (kind) {
    case 'deepSea':
    case 'shallow':
    case 'waste':
    case 'mountain':
      return;
    case 'oilField':
    case 'seaBase':
      result.destroyed.push(terrainName(tile));
      setTile(target, x, y, 'deepSea');
      return;
    case 'nuclearPower':
      result.destroyed.push(terrainName(tile));
      setTile(target, x, y, 'waste');
      // 原子力発電所が壊れると周囲2マスにも被害が広がる
      for (const p of cellsWithin(x, y, 2)) {
        if ((p.x !== x || p.y !== y) && inBounds(target.size, p.x, p.y)) destroyAt(target, p.x, p.y, result);
      }
      return;
    default:
      if (VALUABLE.has(kind)) result.destroyed.push(terrainName(tile));
      setTile(target, x, y, 'waste');
  }
}

/** 陸地破壊弾：陸地を浅瀬に、山を荒地に、浅瀬を深い海にする */
function landAt(target: Island, x: number, y: number, result: HitResult): void {
  const tile = tileAt(target, x, y);
  if (VALUABLE.has(tile.kind)) result.destroyed.push(terrainName(tile));
  switch (tile.kind) {
    case 'deepSea':
      return;
    case 'shallow':
    case 'oilField':
    case 'seaBase':
      setTile(target, x, y, 'deepSea');
      return;
    case 'mountain':
      result.onLand = true;
      setTile(target, x, y, 'waste');
      return;
    default:
      result.onLand = true;
      setTile(target, x, y, 'shallow');
  }
}

/** 核弾頭：周囲1マスの陸地は浅瀬に、周囲2マスは通常の着弾と同じく壊す */
function nukeAt(target: Island, x: number, y: number, result: HitResult): void {
  for (const p of cellsWithin(x, y, 2)) {
    if (!inBounds(target.size, p.x, p.y)) continue;
    if (hexDistance(x, y, p.x, p.y) <= 1) landAt(target, p.x, p.y, result);
    else destroyAt(target, p.x, p.y, result);
  }
}

function interceptChance(target: Island): number {
  const base = hasTech(target, 'interceptUp') ? RULES.interceptChanceImproved : RULES.interceptChance;
  return base * computePower(target).ratio;
}

/**
 * ミサイルを撃つ（命令1つ分）。資金・石油の確認と支払いもここで行う。
 * 撃てなかったときは ok: false（ターンを消費しない）。
 */
export function fireMissiles(
  world: World,
  island: Island,
  kind: MissileKind,
  aimX: number,
  aimY: number,
  targetIslandId: string | undefined,
  count: number,
  rng: Rng,
): { ok: true; message: string } | { ok: false; message: string } {
  const def = MISSILES[kind];
  const problem = missileProblem(world, island, kind, targetIslandId);
  if (problem) return { ok: false, message: `${def.name}発射：${problem}` };
  const target = world.islands.find((i) => i.id === targetIslandId)!;
  if (island.money < def.money || island.oil < def.oil) {
    return { ok: false, message: `${def.name}発射：資金か石油が足りません（1発 ${def.money}億円・石油${def.oil}）` };
  }

  const capacity = missileCapacity(island);
  const wanted = count > 0 ? Math.min(count, capacity) : capacity;
  const ownBases = bases(island);
  const order = rng.permutation(ownBases.length).map((i) => ownBases[i]!);
  const chance = interceptChance(target);
  const interceptors: BaseRef[] = [];
  target.tiles.forEach((t, i) => {
    if (t.kind === 'interceptor') interceptors.push({ x: i % target.size, y: Math.floor(i / target.size) });
  });

  let fired = 0;
  let intercepted = 0;
  let missed = 0;
  const destroyedAll: string[] = [];
  const popBefore = islandStats(target).pop;

  for (const base of order) {
    let shots = baseLevel(tileAt(island, base.x, base.y));
    while (shots > 0 && fired < wanted && island.money >= def.money && island.oil >= def.oil) {
      shots--;
      fired++;
      island.money -= def.money;
      island.oil -= def.oil;

      const spots = cellsWithin(aimX, aimY, def.spread);
      const land = spots[rng.int(spots.length)]!;
      if (!inBounds(target.size, land.x, land.y)) {
        missed++;
        continue;
      }
      const targetsInterceptor =
        kind === 'missilePinpoint' && tileAt(target, land.x, land.y).kind === 'interceptor';
      const covered = interceptors.some(
        (p) => tileAt(target, p.x, p.y).kind === 'interceptor' && hexDistance(p.x, p.y, land.x, land.y) <= RULES.interceptRange,
      );
      if (covered && !targetsInterceptor && rng.next() < chance) {
        intercepted++;
        continue;
      }

      const result: HitResult = { onLand: false, destroyed: [] };
      if (def.effect === 'land') landAt(target, land.x, land.y, result);
      else if (def.effect === 'nuke') nukeAt(target, land.x, land.y, result);
      else destroyAt(target, land.x, land.y, result);
      destroyedAll.push(...result.destroyed);

      const baseTile = tileAt(island, base.x, base.y);
      if (baseTile.kind === 'missileBase' || baseTile.kind === 'seaBase') {
        const gain = (result.onLand ? RULES.expLand : 0) + (result.destroyed.length > 0 ? RULES.expDestroy : 0);
        baseTile.value = Math.min(RULES.expMax, baseTile.value + gain);
      }
    }
    if (fired >= wanted) break;
  }

  target.lastAttackedBy = { islandId: island.id, turn: world.turn };
  const hits = fired - intercepted - missed;
  const popLost = popBefore - islandStats(target).pop;
  const parts = [`${target.name} (${aimX}, ${aimY}) に${def.name}を${fired}発発射`];
  const details: string[] = [];
  if (intercepted > 0) details.push(`${intercepted}発は迎撃された`);
  if (missed > 0) details.push(`${missed}発は島の外に落ちた`);
  details.push(`${hits}発が着弾`);
  if (destroyedAll.length > 0) details.push(`${summarize(destroyedAll)}を破壊`);
  if (popLost > 0) details.push(`人口${(popLost * 100).toLocaleString('ja-JP')}人が失われた`);
  const message = `${parts[0]}：${details.join('、')}`;

  world.emit({
    islandId: target.id,
    text: `${island.name}から${def.name}が${fired}発飛来：${details.join('、')}`,
    tone: 'bad',
    involves: [island.id],
  });
  return { ok: true, message };
}

function summarize(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n}${c}つ` : n)).join('・');
}
