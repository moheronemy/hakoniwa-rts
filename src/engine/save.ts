import type { GameState } from './types';

export const SAVE_VERSION = 1;

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
  if (parsed.version !== SAVE_VERSION) {
    throw new Error(`対応していないセーブデータの版です（${String(parsed.version)}）`);
  }
  const state = parsed.state;
  if (!isRecord(state) || !Array.isArray(state.islands) || typeof state.turn !== 'number') {
    throw new Error('セーブデータが壊れています');
  }
  return state as unknown as GameState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
