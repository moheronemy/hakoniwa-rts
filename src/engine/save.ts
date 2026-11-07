import { newResearch } from './tech';
import { DEFAULT_SETTINGS, generateAiIslands } from './game';
import { Rng } from './rng';
import type { GameState, Island } from './types';

export const SAVE_VERSION = 3;

export interface SaveFile {
  format: 'hakoniwa-rts-save';
  version: number;
  savedAt: string;
  state: GameState;
}

export function serialize(state: GameState, now = new Date()): string {
  const file: SaveFile = {
    format: 'hakoniwa-rts-save',
    version: SAVE_VERSION,
    savedAt: now.toISOString(),
    state,
  };
  return JSON.stringify(file);
}

/** セーブデータを読み込む。形式が違えば例外を投げる */
export function deserialize(text: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('セーブデータを読み取れません（JSONではありません）');
  }
  if (!isRecord(parsed) || parsed.format !== 'hakoniwa-rts-save') {
    throw new Error('このゲームのセーブデータではありません');
  }
  const state = parsed.state;
  if (!isRecord(state) || !Array.isArray(state.islands) || typeof state.turn !== 'number') {
    throw new Error('セーブデータが壊れています');
  }
  if (parsed.version === 1) return migrateV2(migrateV1(state) as unknown as Record<string, unknown>);
  if (parsed.version === 2) return migrateV2(state);
  if (parsed.version !== SAVE_VERSION) {
    throw new Error(`対応していないセーブデータの版です（${String(parsed.version)}）`);
  }
  return state as unknown as GameState;
}

/** 版1（M1）→ 版2（M2）：島に石油と研究の状態を足す */
function migrateV1(state: Record<string, unknown>): GameState {
  const islands = (state.islands as Array<Record<string, unknown>>).map((island) => ({
    ...island,
    oil: 0,
    research: newResearch(),
  }));
  return { ...state, version: 2, islands } as unknown as GameState;
}

/**
 * 版2（M2）→ 版3（M3）：島に持ち主と滅亡の状態を足し、AI の島を3つ新しく加える。
 * 勝敗の設定は標準の値にする。
 */
function migrateV2(state: Record<string, unknown>): GameState {
  const islands = (state.islands as Array<Record<string, unknown>>).map((island) => ({
    ...island,
    controller: 'player',
    destroyed: false,
    emptyTurns: 0,
    lastAttackedBy: null,
  })) as unknown as Island[];
  const rng = new Rng(typeof state.rngState === 'number' ? state.rngState : 1);
  const ais = generateAiIslands(rng);
  return {
    ...(state as unknown as GameState),
    version: 3,
    rngState: rng.state,
    islands: [...islands, ...ais],
    settings: DEFAULT_SETTINGS,
    outcome: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
