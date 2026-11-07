import type { Island, Research, TechId } from './types';

export type Branch = 'civil' | 'industry' | 'energy';

export const BRANCH_NAMES: Record<Branch, string> = {
  civil: '土木',
  industry: '産業',
  energy: 'エネルギー',
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
