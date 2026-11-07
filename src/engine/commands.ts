import { hasAdjacent, isSea, setTile, terrainName, tileAt } from './island';
import { neighbors } from './hex';
import type { Rng } from './rng';
import { PLANTS, RULES, type PlantKind } from './rules';
import { fireMissiles, isMissile, MISSILE_LIST, type World } from './military';
import { hasTech } from './tech';
import type { CommandKind, Island, TerrainKind } from './types';

/** 1ターンの中で命令が残す効果（誘致活動など） */
export interface TurnEffects {
  attract: boolean;
}

/** 命令を実行するときに渡すもの */
export interface CommandContext {
  effects: TurnEffects;
  rng: Rng;
  /** 他の島に関わる命令（ミサイル）で使う。ないとミサイルは撃てない */
  world?: World;
}

/** ミサイルの命令に付く情報 */
export interface CommandExtra {
  targetIslandId?: string;
  count?: number;
}

export interface CommandDef {
  kind: CommandKind;
  name: string;
  /** 基本の費用。技術で変わる場合は commandCost() を使う */
  cost: number;
  /** マスを対象にするか */
  targeted: boolean;
  /** ターンを消費しない即時命令か */
  instant: boolean;
  description: string;
  /** 島の状態（研究など）で使えない理由。使えるなら null */
  checkIsland?: (island: Island) => string | null;
  /** 対象のマスに使えない理由。使えるなら null（資金は見ない） */
  checkTarget?: (island: Island, x: number, y: number) => string | null;
  /** 実行してログの文を返す。条件と資金の確認は済んでいる前提 */
  apply: (island: Island, x: number, y: number, ctx: CommandContext) => { message: string; tone?: 'good' | 'bad' };
}

const PREPARABLE: ReadonlySet<TerrainKind> = new Set(['waste', 'town', 'farm', 'factory', 'forest']);

function requireKinds(kinds: ReadonlySet<TerrainKind>, label: string) {
  return (island: Island, x: number, y: number): string | null =>
    kinds.has(tileAt(island, x, y).kind) ? null : `${label}にしか使えません`;
}

function at(x: number, y: number): string {
  return `(${x}, ${y})`;
}

const prepareApply = (island: Island, x: number, y: number) => {
  const before = terrainName(tileAt(island, x, y));
  setTile(island, x, y, 'plains');
  return { message: `${at(x, y)} の${before}を整地して平地にした` };
};

export function farmMax(island: Island): number {
  return hasTech(island, 'bigFarm') ? RULES.bigFarmMax : RULES.farmMax;
}

/** 重ねて建てると段階が上がる施設（発電所・研究所）の命令を作る */
function stackable(
  kind: PlantKind | 'lab',
  def: { name: string; cost: number; maxLevel: number },
  site: { label: string; check: (island: Island, x: number, y: number) => boolean },
  description: string,
  checkIsland?: (island: Island) => string | null,
): CommandDef {
  return {
    kind,
    name: `${def.name}建設`,
    cost: def.cost,
    targeted: true,
    instant: false,
    description,
    checkIsland,
    checkTarget: (island, x, y) => {
      const tile = tileAt(island, x, y);
      if (tile.kind === kind) return tile.value >= def.maxLevel ? 'これ以上段階を上げられません' : null;
      if (tile.kind !== 'plains') return `平地か${def.name}にしか使えません`;
      return site.check(island, x, y) ? null : site.label;
    },
    apply: (island, x, y) => {
      const tile = tileAt(island, x, y);
      if (tile.kind === kind) {
        tile.value += 1;
        return { message: `${at(x, y)} の${def.name}を${tile.value}段階にした` };
      }
      setTile(island, x, y, kind, 1);
      return { message: `${at(x, y)} に${def.name}を建てた` };
    },
  };
}

const nearSea = (island: Island, x: number, y: number) => hasAdjacent(island, x, y, (t) => isSea(t.kind));

const DEFS: CommandDef[] = [
  {
    kind: 'prepare',
    name: '整地',
    cost: 5,
    targeted: true,
    instant: false,
    description: '荒地や施設を平地にする',
    checkTarget: requireKinds(PREPARABLE, '荒地・森・住宅地・農場・工場'),
    apply: prepareApply,
  },
  {
    kind: 'prepareInstant',
    name: '地ならし',
    cost: 100,
    targeted: true,
    instant: true,
    description: '整地と同じだが、ターンを消費しない（費用が高い）',
    checkTarget: requireKinds(PREPARABLE, '荒地・森・住宅地・農場・工場'),
    apply: prepareApply,
  },
  {
    kind: 'reclaim',
    name: '埋め立て',
    cost: 150,
    targeted: true,
    instant: false,
    description: '深い海は浅瀬に、浅瀬は荒地にする（隣に陸地が必要）',
    checkTarget: (island, x, y) => {
      const kind = tileAt(island, x, y).kind;
      if (kind !== 'deepSea' && kind !== 'shallow') return '海か浅瀬にしか使えません';
      if (!hasAdjacent(island, x, y, (t) => !isSea(t.kind))) return '隣に陸地がありません';
      return null;
    },
    apply: (island, x, y) => {
      const tile = tileAt(island, x, y);
      if (tile.kind === 'deepSea' && !hasTech(island, 'reclaim2')) {
        setTile(island, x, y, 'shallow');
        return { message: `${at(x, y)} を埋め立てて浅瀬にした` };
      }
      setTile(island, x, y, 'waste');
      return { message: `${at(x, y)} を埋め立てて陸地にした` };
    },
  },
  {
    kind: 'excavate',
    name: '掘削',
    cost: 200,
    targeted: true,
    instant: false,
    description: '陸地を掘って浅瀬にする（山は掘れない）',
    checkTarget: (island, x, y) => {
      const kind = tileAt(island, x, y).kind;
      if (isSea(kind)) return '陸地にしか使えません';
      if (kind === 'mountain') return '山は掘削できません';
      return null;
    },
    apply: (island, x, y) => {
      const before = terrainName(tileAt(island, x, y));
      setTile(island, x, y, 'shallow');
      return { message: `${at(x, y)} の${before}を掘削して浅瀬にした` };
    },
  },
  {
    kind: 'plant',
    name: '植林',
    cost: 50,
    targeted: true,
    instant: false,
    description: '平地に木を植えて森にする',
    checkTarget: requireKinds(new Set(['plains']), '平地'),
    apply: (island, x, y) => {
      setTile(island, x, y, 'forest', 1);
      return { message: `${at(x, y)} に植林した` };
    },
  },
  {
    kind: 'fell',
    name: '伐採',
    cost: 0,
    targeted: true,
    instant: false,
    description: `森を切り開いて平地にし、木を売る（100本あたり${RULES.treeValue}億円）`,
    checkTarget: requireKinds(new Set(['forest']), '森'),
    apply: (island, x, y) => {
      const income = tileAt(island, x, y).value * RULES.treeValue;
      island.money += income;
      setTile(island, x, y, 'plains');
      return { message: `${at(x, y)} の森を伐採し、${income}億円の収入を得た` };
    },
  },
  {
    kind: 'farm',
    name: '農場整備',
    cost: 20,
    targeted: true,
    instant: false,
    description: '平地や住宅地を農場にする。農場に重ねると規模が上がる',
    checkTarget: (island, x, y) => {
      const tile = tileAt(island, x, y);
      if (tile.kind === 'farm') return tile.value >= farmMax(island) ? 'これ以上規模を上げられません' : null;
      return tile.kind === 'plains' || tile.kind === 'town' ? null : '平地・住宅地・農場にしか使えません';
    },
    apply: (island, x, y) => {
      const tile = tileAt(island, x, y);
      if (tile.kind === 'farm') {
        tile.value = Math.min(farmMax(island), tile.value + RULES.farmStep);
        return { message: `${at(x, y)} の農場の規模を上げた` };
      }
      setTile(island, x, y, 'farm', RULES.farmInitial);
      return { message: `${at(x, y)} に農場を作った` };
    },
  },
  {
    kind: 'factory',
    name: '工場建設',
    cost: 100,
    targeted: true,
    instant: false,
    description: '平地や住宅地に工場を建てる。工場に重ねると規模が上がる。動かすには電力が要る',
    checkTarget: (island, x, y) => {
      const tile = tileAt(island, x, y);
      if (tile.kind === 'factory') {
        return tile.value >= RULES.factoryMax ? 'これ以上規模を上げられません' : null;
      }
      return tile.kind === 'plains' || tile.kind === 'town' ? null : '平地・住宅地・工場にしか使えません';
    },
    apply: (island, x, y) => {
      const tile = tileAt(island, x, y);
      if (tile.kind === 'factory') {
        tile.value = Math.min(RULES.factoryMax, tile.value + RULES.factoryStep);
        return { message: `${at(x, y)} の工場の規模を上げた` };
      }
      setTile(island, x, y, 'factory', RULES.factoryInitial);
      return { message: `${at(x, y)} に工場を建てた` };
    },
  },
  stackable(
    'windPower',
    PLANTS.windPower,
    {
      label: `隣に平地か荒地が${RULES.windOpenNeighbors}マス以上必要です`,
      check: (island, x, y) =>
        neighbors(island.size, x, y).filter((p) => {
          const kind = tileAt(island, p.x, p.y).kind;
          return kind === 'plains' || kind === 'waste';
        }).length >= RULES.windOpenNeighbors,
    },
    `出力${PLANTS.windPower.output}万kW。隣に平地か荒地が${RULES.windOpenNeighbors}マス以上必要。重ねると出力が上がる（最大${PLANTS.windPower.maxLevel}段階）`,
  ),
  stackable(
    'hydroPower',
    PLANTS.hydroPower,
    { label: '隣に山が必要です', check: (island, x, y) => hasAdjacent(island, x, y, (t) => t.kind === 'mountain') },
    `出力${PLANTS.hydroPower.output}万kW。隣に山が必要。重ねると出力が上がる（最大${PLANTS.hydroPower.maxLevel}段階）`,
  ),
  stackable(
    'thermalPower',
    PLANTS.thermalPower,
    { label: '隣に海が必要です', check: nearSea },
    `出力${PLANTS.thermalPower.output}万kW。1段階につき毎ターン石油1を使う。隣に海が必要（最大${PLANTS.thermalPower.maxLevel}段階）`,
  ),
  stackable(
    'nuclearPower',
    PLANTS.nuclearPower,
    { label: '隣に海が必要です', check: nearSea },
    `出力${PLANTS.nuclearPower.output}万kW。隣に海が必要（最大${PLANTS.nuclearPower.maxLevel}段階）。研究「原子力」が必要`,
    (island) => (hasTech(island, 'nuclear') ? null : '研究「原子力」が必要です'),
  ),
  stackable(
    'lab',
    { name: '研究所', cost: 500, maxLevel: RULES.labMax },
    { label: '', check: () => true },
    `1段階につき毎ターン研究ポイント${RULES.researchPerLab}。電力${RULES.powerPerLab}万kWを使う（最大${RULES.labMax}段階）`,
  ),
  {
    kind: 'missileBase',
    name: 'ミサイル基地建設',
    cost: 300,
    targeted: true,
    instant: false,
    description: `ミサイルを撃つ基地。他の島からは森に見える。経験値でレベルが上がり、1回に撃てる数が増える。電力${RULES.powerPerMissileBase}万kW`,
    checkTarget: requireKinds(new Set(['plains']), '平地'),
    apply: (island, x, y) => {
      setTile(island, x, y, 'missileBase', 0);
      return { message: `${at(x, y)} にミサイル基地を建てた` };
    },
  },
  {
    kind: 'seaBase',
    name: '海底基地建設',
    cost: 3000,
    targeted: true,
    instant: false,
    description: `深い海に建てる基地。他の島からは海に見え、直撃でしか壊れない。電力${RULES.powerPerSeaBase}万kW。研究「海底基地」が必要`,
    checkIsland: (island) => (hasTech(island, 'seaBaseTech') ? null : '研究「海底基地」が必要です'),
    checkTarget: requireKinds(new Set(['deepSea']), '深い海'),
    apply: (island, x, y) => {
      setTile(island, x, y, 'seaBase', 0);
      return { message: `${at(x, y)} に海底基地を建てた` };
    },
  },
  {
    kind: 'interceptor',
    name: '迎撃施設建設',
    cost: 800,
    targeted: true,
    instant: false,
    description: `周囲${RULES.interceptRange}マスに落ちるミサイルを${Math.round(RULES.interceptChance * 100)}%の確率で撃ち落とす。電力${RULES.powerPerInterceptor}万kW`,
    checkTarget: requireKinds(new Set(['plains']), '平地'),
    apply: (island, x, y) => {
      setTile(island, x, y, 'interceptor', 0);
      return { message: `${at(x, y)} に迎撃施設を建てた` };
    },
  },
  {
    kind: 'oilSearch',
    name: '油田探し',
    cost: 300,
    targeted: true,
    instant: false,
    description: `深い海で油田を探す（当たる確率${Math.round(RULES.oilSearchChance * 100)}%）`,
    checkTarget: requireKinds(new Set(['deepSea']), '深い海'),
    apply: (island, x, y, { rng }) => {
      const chance = RULES.oilSearchChance * (hasTech(island, 'oilProspect') ? 2 : 1);
      if (rng.next() >= chance) return { message: `${at(x, y)} で油田を探したが、見つからなかった`, tone: 'bad' };
      const reserve = RULES.oilReserveMin + rng.int(RULES.oilReserveMax - RULES.oilReserveMin + 1);
      setTile(island, x, y, 'oilField', reserve);
      return { message: `${at(x, y)} で油田が見つかった！（埋蔵量${reserve}）` };
    },
  },
  {
    kind: 'sellOil',
    name: '石油の売却',
    cost: 0,
    targeted: false,
    instant: false,
    description: '持っている石油をすべて売る',
    checkIsland: (island) => (island.oil >= 1 ? null : '売る石油がありません'),
    apply: (island) => {
      const amount = Math.floor(island.oil);
      const income = Math.floor(amount * oilPrice(island));
      island.oil -= amount;
      island.money += income;
      return { message: `石油${amount}を売って${income}億円を得た` };
    },
  },
  {
    kind: 'invest',
    name: '研究投資',
    cost: 1000,
    targeted: false,
    instant: false,
    description: `資金を研究に回し、研究ポイントを${RULES.investPoints}得る`,
    apply: (island) => {
      island.research.pool += RULES.investPoints;
      return { message: `研究に投資し、研究ポイントを${RULES.investPoints}得た` };
    },
  },
  {
    kind: 'attract',
    name: '誘致活動',
    cost: 500,
    targeted: false,
    instant: false,
    description: 'このターンだけ人口の伸びが大きくなり、都市も伸びる',
    apply: (_island, _x, _y, { effects }) => {
      effects.attract = true;
      return { message: '誘致活動を行った' };
    },
  },
  {
    kind: 'raiseFunds',
    name: '資金繰り',
    cost: 0,
    targeted: false,
    instant: false,
    description: `${RULES.raiseFundsIncome}億円を得る（予約が空のときも自動でこれになる）`,
    apply: (island) => {
      island.money += RULES.raiseFundsIncome;
      return { message: `資金繰りで${RULES.raiseFundsIncome}億円を得た` };
    },
  },
];

// ミサイルの命令。実行は executeCommand から fireMissiles に回す
for (const m of MISSILE_LIST) {
  DEFS.push({
    kind: m.kind,
    name: `${m.name}発射`,
    cost: m.money,
    targeted: true,
    instant: false,
    description: `${m.description}。1発 ${m.money}億円・石油${m.oil}`,
    apply: () => {
      throw new Error('ミサイルは fireMissiles で実行する');
    },
  });
}

export const COMMANDS: Readonly<Record<CommandKind, CommandDef>> = Object.fromEntries(
  DEFS.map((d) => [d.kind, d]),
) as Record<CommandKind, CommandDef>;

export const COMMAND_LIST: readonly CommandDef[] = DEFS;

/** 石油1あたりの売値（億円） */
export function oilPrice(island: Island): number {
  return RULES.oilPrice * (hasTech(island, 'refining') ? 1 + RULES.refiningPriceBonus : 1);
}

/** 研究を反映した命令の費用 */
export function commandCost(island: Island, kind: CommandKind): number {
  if (kind === 'reclaim' && hasTech(island, 'reclaim1')) return RULES.reclaimCostImproved;
  return COMMANDS[kind].cost;
}

/** 予約に入れる時点・実行する時点の判定。資金は見ない */
export function targetProblem(island: Island, kind: CommandKind, x: number, y: number): string | null {
  const def = COMMANDS[kind];
  const islandProblem = def.checkIsland?.(island) ?? null;
  if (islandProblem) return islandProblem;
  if (!def.targeted || !def.checkTarget) return null;
  return def.checkTarget(island, x, y);
}

export type CommandResult =
  | { ok: true; consumedTurn: boolean; message: string; tone: 'good' | 'bad' }
  | { ok: false; message: string };

/** 命令を1つ実行する。island は直接書き換える */
export function executeCommand(
  island: Island,
  kind: CommandKind,
  x: number,
  y: number,
  ctx: CommandContext,
  extra: CommandExtra = {},
): CommandResult {
  const def = COMMANDS[kind];
  if (isMissile(kind)) {
    if (!ctx.world) return { ok: false, message: `${def.name}：目標の島がありません` };
    const result = fireMissiles(ctx.world, island, kind, x, y, extra.targetIslandId, extra.count ?? 0, ctx.rng);
    return result.ok ? { ok: true, consumedTurn: true, message: result.message, tone: 'good' } : result;
  }
  const label = `${def.name}${def.targeted ? ` ${at(x, y)}` : ''}`;
  const problem = targetProblem(island, kind, x, y);
  if (problem) return { ok: false, message: `${label}：${problem}` };
  const cost = commandCost(island, kind);
  if (island.money < cost) {
    return { ok: false, message: `${label}：資金が足りません（${cost}億円必要）` };
  }
  island.money -= cost;
  const result = def.apply(island, x, y, ctx);
  return { ok: true, consumedTurn: !def.instant, message: result.message, tone: result.tone ?? 'good' };
}
