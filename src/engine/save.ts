import { newResearch } from './tech';
import type { GameState } from './types';

export const SAVE_VERSION = 2;

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
  if (parsed.version === 1) return migrateV1(state);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
