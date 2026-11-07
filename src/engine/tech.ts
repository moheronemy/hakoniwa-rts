import type { Island, Research, TechId } from './types';

export type Branch = 'civil' | 'industry' | 'energy' | 'military' | 'bio' | 'space';

export const BRANCH_NAMES: Record<Branch, string> = {
  civil: '土木',
  industry: '産業',
  energy: 'エネルギー',
  military: '軍事',
  bio: '生物',
  space: '宇宙',
};

export interface TechDef {
  id: TechId;
  branch: Branch;
  name: string;
  cost: number;
  description: string;
  /** 先に完成している必要がある技術 */
  requires: TechId | null;
}

/** 技術ツリー（仕様書17章）。系統の中では上から順に研究する */
export const TECH_LIST: readonly TechDef[] = [
  { id: 'reclaim1', branch: 'civil', name: '埋め立て改良', cost: 300, requires: null, description: '埋め立ての費用が150億円から100億円になる' },
  { id: 'reclaim2', branch: 'civil', name: '海洋土木', cost: 900, requires: 'reclaim1', description: '埋め立てで、深い海を一度に荒地にできる' },
  { id: 'cityPlan', branch: 'civil', name: '都市計画', cost: 1800, requires: 'reclaim2', description: '誘致活動がなくても、都市が毎ターン1〜2伸びる' },
  { id: 'automation', branch: 'industry', name: '工場の自動化', cost: 450, requires: null, description: '工場の収入が20%増える' },
  { id: 'bigFarm', branch: 'industry', name: '大規模農業', cost: 600, requires: 'automation', description: '農場の最大規模が5万人から8万人になる' },
  { id: 'oilProspect', branch: 'industry', name: '石油探査', cost: 750, requires: 'bigFarm', description: '油田探しの成功率が2倍になる' },
  { id: 'refining', branch: 'industry', name: '精製技術', cost: 1200, requires: 'oilProspect', description: '石油の売値が50%上がり、火力発電の燃料が25%減る' },
  { id: 'betterWind', branch: 'energy', name: '改良風車', cost: 300, requires: null, description: '風力発電の出力が50%増える' },
  { id: 'turbine', branch: 'energy', name: '高効率タービン', cost: 900, requires: 'betterWind', description: '水力と火力の発電の出力が25%増える' },
  { id: 'grid', branch: 'energy', name: '送電網', cost: 1500, requires: 'turbine', description: '電力の消費が15%減る' },
  { id: 'nuclear', branch: 'energy', name: '原子力', cost: 2400, requires: 'grid', description: '原子力発電所を建てられるようになる' },
  { id: 'guidance', branch: 'military', name: '精密誘導', cost: 600, requires: null, description: '精密弾を撃てるようになる' },
  { id: 'pinpoint', branch: 'military', name: 'ピンポイント誘導', cost: 1500, requires: 'guidance', description: '高精度弾を撃てるようになる' },
  { id: 'landBuster', branch: 'military', name: '陸地破壊弾', cost: 2000, requires: 'guidance', description: '陸地破壊弾を撃てるようになる' },
  { id: 'nukeTech', branch: 'military', name: '核弾頭', cost: 4000, requires: 'landBuster', description: '核弾頭を撃てるようになる' },
  { id: 'interceptUp', branch: 'military', name: '迎撃改良', cost: 900, requires: null, description: '迎撃の確率が70%から85%になる' },
  { id: 'seaBaseTech', branch: 'military', name: '海底基地', cost: 1200, requires: null, description: '海底基地を建てられるようになる' },
  { id: 'baseAuto', branch: 'military', name: '基地の自動化', cost: 1000, requires: null, description: 'ミサイル基地と海底基地の電力消費が半分になる' },
  { id: 'bio1', branch: 'bio', name: '怪獣研究', cost: 800, requires: null, description: '怪獣研究所を建て、段階1の怪獣（M1・M2）を育てられる' },
  { id: 'bio2', branch: 'bio', name: '怪獣強化', cost: 1500, requires: 'bio1', description: '段階2の怪獣（M3・M4）を育てられる' },
  { id: 'bio3', branch: 'bio', name: '怪獣改良', cost: 2500, requires: 'bio2', description: '段階3の怪獣（M5・M6）を育てられる' },
  { id: 'bio4', branch: 'bio', name: '究極の怪獣', cost: 4000, requires: 'bio3', description: '段階4の怪獣（M7・M8）を育てられる' },
  { id: 'rocket', branch: 'space', name: '宇宙開発', cost: 1000, requires: null, description: '気象衛星を打ち上げられる（台風が起きにくくなる）' },
  { id: 'observeSat', branch: 'space', name: '観測衛星', cost: 1500, requires: 'rocket', description: '観測衛星を打ち上げられる（地震・津波・噴火が減り、他の島の基地が見える）' },
  { id: 'interceptSat', branch: 'space', name: '迎撃衛星', cost: 2500, requires: 'observeSat', description: '迎撃衛星を打ち上げられる（隕石が減り、飛んできたミサイルを撃ち落とす）' },
  { id: 'militarySat', branch: 'space', name: '軍事衛星', cost: 4000, requires: 'interceptSat', description: '軍事衛星を打ち上げられる（衛星レーザーで狙ったマスを確実に壊す）' },
  { id: 'launchUp', branch: 'space', name: '打ち上げ改良', cost: 1200, requires: 'rocket', description: '衛星の打ち上げに失敗する確率が半分になる' },
];

export const TECHS: Readonly<Record<TechId, TechDef>> = Object.fromEntries(
  TECH_LIST.map((t) => [t.id, t]),
) as Record<TechId, TechDef>;

export function newResearch(): Research {
  return { pool: 0, current: null, progress: {}, done: [] };
}

export function hasTech(island: Island, id: TechId): boolean {
  return island.research.done.includes(id);
}

/** 今研究を始められるか（未完成で、前提の技術が完成している） */
export function canResearch(island: Island, id: TechId): boolean {
  const def = TECHS[id];
  if (hasTech(island, id)) return false;
  return def.requires === null || hasTech(island, def.requires);
}

/**
 * 研究ポイントを貯めて、研究中の技術に注ぐ。完成したら完成した技術を返す。
 * 研究中の技術がなければ、ポイントは pool に貯まったまま。
 */
export function addResearchPoints(island: Island, points: number): TechId | null {
  const research = island.research;
  research.pool += points;
  const current = research.current;
  if (!current || !canResearch(island, current)) {
    research.current = null;
    return null;
  }
  const spent = research.progress[current] ?? 0;
  const need = TECHS[current].cost - spent;
  const use = Math.min(need, research.pool);
  research.pool -= use;
  research.progress[current] = spent + use;
  if (spent + use >= TECHS[current].cost) {
    research.done.push(current);
    research.current = null;
    return current;
  }
  return null;
}
