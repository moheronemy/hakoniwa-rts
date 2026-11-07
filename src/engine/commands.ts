import { hasAdjacent, isSea, setTile, terrainName, tileAt } from './island';
import { RULES } from './rules';
import type { CommandKind, Island, TerrainKind } from './types';

/** 1ターンの中で命令が残す効果（誘致活動など） */
export interface TurnEffects {
  attract: boolean;
}

export interface CommandDef {
  kind: CommandKind;
  name: string;
  cost: number;
  /** マスを対象にするか */
  targeted: boolean;
  /** ターンを消費しない即時命令か */
  instant: boolean;
  description: string;
  /** 対象のマスに使えない理由。使えるなら null（資金は見ない） */
  checkTarget?: (island: Island, x: number, y: number) => string | null;
  /** 実行してログの文を返す。checkTarget と資金の確認は済んでいる前提 */
  apply: (island: Island, x: number, y: number, effects: TurnEffects) => string;
}

const PREPARABLE: ReadonlySet<TerrainKind> = new Set(['waste', 'town', 'farm', 'factory', 'forest']);

function requireKinds(kinds: ReadonlySet<TerrainKind>, label: string) {
  return (island: Island, x: number, y: number): string | null =>
    kinds.has(tileAt(island, x, y).kind) ? null : `${label}にしか使えません`;
}

function at(x: number, y: number): string {
  return `(${x}, ${y})`;
}

const prepareApply = (island: Island, x: number, y: number): string => {
  const before = terrainName(tileAt(island, x, y));
  setTile(island, x, y, 'plains');
  return `${at(x, y)} の${before}を整地して平地にした`;
};

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
      if (!isSea(tileAt(island, x, y).kind)) return '海か浅瀬にしか使えません';
      if (!hasAdjacent(island, x, y, (t) => !isSea(t.kind))) return '隣に陸地がありません';
      return null;
    },
    apply: (island, x, y) => {
      const tile = tileAt(island, x, y);
      if (tile.kind === 'deepSea') {
        setTile(island, x, y, 'shallow');
        return `${at(x, y)} を埋め立てて浅瀬にした`;
      }
      setTile(island, x, y, 'waste');
      return `${at(x, y)} を埋め立てて陸地にした`;
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
      return `${at(x, y)} の${before}を掘削して浅瀬にした`;
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
      return `${at(x, y)} に植林した`;
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
      return `${at(x, y)} の森を伐採し、${income}億円の収入を得た`;
    },
  },
  {
    kind: 'farm',
    name: '農場整備',
    cost: 20,
    targeted: true,
    instant: false,
    description: `平地や住宅地を農場にする。農場に重ねると規模が上がる（最大${RULES.farmMax * 1000}人）`,
    checkTarget: (island, x, y) => {
      const tile = tileAt(island, x, y);
      if (tile.kind === 'farm') return tile.value >= RULES.farmMax ? 'これ以上規模を上げられません' : null;
      return tile.kind === 'plains' || tile.kind === 'town' ? null : '平地・住宅地・農場にしか使えません';
    },
    apply: (island, x, y) => {
      const tile = tileAt(island, x, y);
      if (tile.kind === 'farm') {
        tile.value = Math.min(RULES.farmMax, tile.value + RULES.farmStep);
        return `${at(x, y)} の農場の規模を上げた`;
      }
      setTile(island, x, y, 'farm', RULES.farmInitial);
      return `${at(x, y)} に農場を作った`;
    },
  },
  {
    kind: 'factory',
    name: '工場建設',
    cost: 100,
    targeted: true,
    instant: false,
    description: `平地や住宅地に工場を建てる。工場に重ねると規模が上がる（最大${RULES.factoryMax * 1000}人）`,
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
        return `${at(x, y)} の工場の規模を上げた`;
      }
      setTile(island, x, y, 'factory', RULES.factoryInitial);
      return `${at(x, y)} に工場を建てた`;
    },
  },
  {
    kind: 'attract',
    name: '誘致活動',
    cost: 500,
    targeted: false,
    instant: false,
    description: 'このターンだけ人口の伸びが大きくなり、都市も伸びる',
    apply: (_island, _x, _y, effects) => {
      effects.attract = true;
      return '誘致活動を行った';
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
      return `資金繰りで${RULES.raiseFundsIncome}億円を得た`;
    },
  },
];

export const COMMANDS: Readonly<Record<CommandKind, CommandDef>> = Object.fromEntries(
  DEFS.map((d) => [d.kind, d]),
) as Record<CommandKind, CommandDef>;

export const COMMAND_LIST: readonly CommandDef[] = DEFS;

/** 予約に入れる時点の判定。資金は実行時に確認するのでここでは見ない */
export function targetProblem(island: Island, kind: CommandKind, x: number, y: number): string | null {
  const def = COMMANDS[kind];
  if (!def.targeted || !def.checkTarget) return null;
  return def.checkTarget(island, x, y);
}

export type CommandResult =
  | { ok: true; consumedTurn: boolean; message: string }
  | { ok: false; message: string };

/** 命令を1つ実行する。island は直接書き換える */
export function executeCommand(
  island: Island,
  kind: CommandKind,
  x: number,
  y: number,
  effects: TurnEffects,
): CommandResult {
  const def = COMMANDS[kind];
  const problem = targetProblem(island, kind, x, y);
  if (problem) return { ok: false, message: `${def.name}${def.targeted ? ` ${at(x, y)}` : ''}：${problem}` };
  if (island.money < def.cost) {
    return { ok: false, message: `${def.name}${def.targeted ? ` ${at(x, y)}` : ''}：資金が足りません（${def.cost}億円必要）` };
  }
  island.money -= def.cost;
  const message = def.apply(island, x, y, effects);
  return { ok: true, consumedTurn: !def.instant, message };
}
