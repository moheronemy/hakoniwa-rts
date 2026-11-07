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
  | 'factory'; // 工場（value = 規模、1,000人単位）

export interface Tile {
  kind: TerrainKind;
  value: number;
}

/** 命令の種類（M1） */
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
  | 'raiseFunds'; // 資金繰り

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
  version: 1;
  /** 処理済みのターン数 */
  turn: number;
  /** 乱数の内部状態 */
  rngState: number;
  islands: Island[];
  playerIslandId: string;
  log: LogEntry[];
  nextCommandId: number;
}
