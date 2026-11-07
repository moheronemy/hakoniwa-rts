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
  | 'lab' // 研究所（value = 段階）
  | 'missileBase' // ミサイル基地（value = 経験値）
  | 'seaBase' // 海底基地（value = 経験値）
  | 'interceptor' // 迎撃施設
  | 'monster' // 怪獣（value = 種類×16 + 体力）
  | 'wall' // 防壁
  | 'monsterLab'; // 怪獣研究所

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
  | 'invest' // 研究投資
  | 'missileBase' // ミサイル基地建設
  | 'seaBase' // 海底基地建設
  | 'interceptor' // 迎撃施設建設
  | 'wall' // 防壁建設
  | 'monsterLab' // 怪獣研究所建設
  | 'breed' // 怪獣を育てる
  | 'sendMonster' // 怪獣派遣
  | MissileKind;

/** 怪獣の種類（仕様書8章・19章） */
export type MonsterId = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7' | 'm8';

/** 怪獣研究所で育てている（育ち上がった）怪獣 */
export interface Breeding {
  /** 怪獣研究所のマス */
  x: number;
  y: number;
  monster: MonsterId;
  /** このターン以降に送れる */
  readyTurn: number;
}

/** ミサイルの種類（命令の種類でもある） */
export type MissileKind =
  | 'missileNormal' // 通常弾
  | 'missilePrecise' // 精密弾
  | 'missilePinpoint' // 高精度弾
  | 'missileLand' // 陸地破壊弾
  | 'missileNuke'; // 核弾頭

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
  | 'nuclear' // 原子力
  | 'guidance' // 精密誘導
  | 'pinpoint' // ピンポイント誘導
  | 'interceptUp' // 迎撃改良
  | 'seaBaseTech' // 海底基地
  | 'landBuster' // 陸地破壊弾
  | 'nukeTech' // 核弾頭
  | 'baseAuto' // 基地の自動化
  | 'bio1' // 怪獣研究
  | 'bio2' // 怪獣強化
  | 'bio3' // 怪獣改良
  | 'bio4'; // 究極の怪獣

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
  /** ミサイルの目標の島 */
  targetIslandId?: string;
  /** ミサイルの発数。0 は「撃てるだけ」 */
  count?: number;
  /** 育てる怪獣の種類 */
  monster?: MonsterId;
}

/** 島の持ち主。player 以外は AI の性格 */
export type Controller = 'player' | 'military' | 'economic' | 'tamer';

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
  controller: Controller;
  /** 滅亡したか */
  destroyed: boolean;
  /** 人口0が続いているターン数 */
  emptyTurns: number;
  /** 最後にミサイルや怪獣を送り込んできた島 */
  lastAttackedBy: { islandId: string; turn: number } | null;
  /** 怪獣研究所で育てている（育ち上がった）怪獣 */
  breeding: Breeding[];
}

export type LogTone = 'info' | 'good' | 'bad';

export interface LogEntry {
  turn: number;
  /** 出来事が起きた島 */
  islandId: string;
  text: string;
  tone: LogTone;
  /** この出来事に関わる他の島（攻撃の相手など） */
  involves?: string[];
  /** すべての島に知らせる出来事（滅亡など） */
  public?: boolean;
  /** 観戦モードで見せる出来事（災害・怪獣・食料不足など） */
  notable?: boolean;
}

export interface GameSettings {
  /** 経済的制覇の目標人口（100人単位） */
  economicTarget: number;
  /** 期限のターン数 */
  turnLimit: number;
  /** 災害の強さ（0：なし、0.5：弱い、1：ふつう）。野生の怪獣の出やすさにも効く */
  disasterLevel: number;
  /** 平和モード：他の島を攻撃できず、勝利条件を満たしてもゲームは終わらない */
  peaceful?: boolean;
}

/** 平和モードで、勝利条件を満たしたことの記録（1回だけ知らせる） */
export interface Milestone {
  key: string;
  text: string;
  turn: number;
}

export interface Outcome {
  result: 'win' | 'lose';
  /** 勝った島 */
  winnerId: string | null;
  reason: string;
  turn: number;
}

export interface GameState {
  /** セーブデータの形式のバージョン */
  version: 4;
  /** 処理済みのターン数 */
  turn: number;
  /** 乱数の内部状態 */
  rngState: number;
  islands: Island[];
  playerIslandId: string;
  log: LogEntry[];
  nextCommandId: number;
  settings: GameSettings;
  /** 勝敗が決まったら入る。決まるまで null */
  outcome: Outcome | null;
  /** 観戦モード（すべての島が AI。プレイヤーの勝敗はない） */
  spectator?: boolean;
  /** 平和モードで達成した勝利条件の記録 */
  milestones?: Milestone[];
}
