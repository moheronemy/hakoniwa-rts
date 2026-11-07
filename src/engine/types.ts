/** 地形・施設の種類 */
export type TerrainKind =
  | 'deepSea' // 深い海
  | 'shallow' // 浅瀬
  | 'waste' // 荒地
  | 'plains' // 平地
  | 'forest' // 森（value = 木の数、100本単位）
  | 'mountain' // 山
  | 'town' // 住宅地（value = 人口、100人単位）
  | 'farm' // 農場（value = 規模、1,000人単位）
  | 'factory' // 工場（value = 規模、1,000人単位）
  | 'oilField' // 海上油田（value = 埋蔵量）
  | 'windPower' // 風力発電所（value = 段階）
  | 'hydroPower' // 水力発電所（value = 段階）
  | 'thermalPower' // 火力発電所（value = 段階）
  | 'nuclearPower' // 原子力発電所（value = 段階）
  | 'lab'; // 研究所（value = 段階）

export interface Tile {
  kind: TerrainKind;
  value: number;
}

/** 命令の種類 */
export type CommandKind =
  | 'prepare' // 整地
  | 'prepareInstant' // 地ならし（即時）
  | 'reclaim' // 埋め立て
  | 'excavate' // 掘削
  | 'plant' // 植林
  | 'fell' // 伐採
  | 'farm' // 農場整備
  | 'factory' // 工場建設
  | 'attract' // 誘致活動
  | 'raiseFunds' // 資金繰り
  | 'windPower' // 風力発電所建設
  | 'hydroPower' // 水力発電所建設
  | 'thermalPower' // 火力発電所建設
  | 'nuclearPower' // 原子力発電所建設
  | 'lab' // 研究所建設
  | 'oilSearch' // 油田探し
  | 'sellOil' // 石油の売却
  | 'invest'; // 研究投資

/** 技術の種類（仕様書17章） */
export type TechId =
  | 'reclaim1' // 埋め立て改良
  | 'reclaim2' // 海洋土木
  | 'cityPlan' // 都市計画
  | 'automation' // 工場の自動化
  | 'bigFarm' // 大規模農業
  | 'oilProspect' // 石油探査
  | 'refining' // 精製技術
  | 'betterWind' // 改良風車
  | 'turbine' // 高効率タービン
  | 'grid' // 送電網
  | 'nuclear'; // 原子力

export interface Research {
  /** まだどの技術にも注いでいない研究ポイント */
  pool: number;
  /** 研究中の技術。null なら選んでいない */
  current: TechId | null;
  /** 技術ごとに注いだポイント（途中で選び直しても残る） */
  progress: Partial<Record<TechId, number>>;
  /** 完成した技術 */
  done: TechId[];
}

export interface Command {
  /** 予約の中で命令を見分けるための通し番号 */
  id: number;
  kind: CommandKind;
  /** マスを対象にしない命令では 0 */
  x: number;
  y: number;
}

export interface Island {
  id: string;
  name: string;
  /** 一辺のマス数 */
  size: number;
  /** 行優先（index = y * size + x） */
  tiles: Tile[];
  /** 資金（億円） */
  money: number;
  /** 食料（100トン単位） */
  food: number;
  /** 石油 */
  oil: number;
  research: Research;
  /** 命令予約。先頭から実行する */
  queue: Command[];
}

export type LogTone = 'info' | 'good' | 'bad';

export interface LogEntry {
  turn: number;
  islandId: string;
  text: string;
  tone: LogTone;
}

export interface GameState {
  /** セーブデータの形式のバージョン */
  version: 2;
  /** 処理済みのターン数 */
  turn: number;
  /** 乱数の内部状態 */
  rngState: number;
  islands: Island[];
  playerIslandId: string;
  log: LogEntry[];
  nextCommandId: number;
}
