import { DEFAULT_SETTINGS, generateAiIslands } from './game';
import { Rng } from './rng';
import { newResearch } from './tech';
import type { GameState } from './types';

export const SAVE_VERSION = 5;

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

/** 移行の途中のデータ（形はまだ GameState と決まっていない） */
type Raw = Record<string, unknown>;

/** 版 n のデータを版 n+1 に変える関数。添字が元の版 */
const MIGRATIONS: Record<number, (state: Raw) => Raw> = {
  1: migrateV1,
  2: migrateV2,
  3: migrateV3,
  4: migrateV4,
};

/** セーブデータを読み込む。古い版は順に移行する。形式が違えば例外を投げる */
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
  const original = parsed.state;
  if (!isRecord(original) || !Array.isArray(original.islands) || typeof original.turn !== 'number') {
    throw new Error('セーブデータが壊れています');
  }
  let state: Raw = original;
  let version = parsed.version;
  if (typeof version !== 'number' || version < 1 || version > SAVE_VERSION) {
    throw new Error(`対応していないセーブデータの版です（${String(version)}）`);
  }
  while (version < SAVE_VERSION) {
    state = MIGRATIONS[version]!(state);
    version++;
  }
  return state as unknown as GameState;
}

function islandsOf(state: Raw): Raw[] {
  return state.islands as Raw[];
}

/** 版1（M1）→ 版2（M2）：島に石油と研究の状態を足す */
function migrateV1(state: Raw): Raw {
  const islands = islandsOf(state).map((island) => ({ ...island, oil: 0, research: newResearch() }));
  return { ...state, version: 2, islands };
}

/**
 * 版2（M2）→ 版3（M3）：島に持ち主と滅亡の状態を足し、AI の島を3つ新しく加える。
 * 勝敗の設定は標準の値にする。
 */
function migrateV2(state: Raw): Raw {
  const islands = islandsOf(state).map((island) => ({
    ...island,
    controller: 'player',
    destroyed: false,
    emptyTurns: 0,
    lastAttackedBy: null,
  }));
  const rng = new Rng(typeof state.rngState === 'number' ? state.rngState : 1);
  const ais = generateAiIslands(rng);
  return {
    ...state,
    version: 3,
    rngState: rng.state,
    islands: [...islands, ...ais],
    settings: { economicTarget: DEFAULT_SETTINGS.economicTarget, turnLimit: DEFAULT_SETTINGS.turnLimit },
    outcome: null,
  };
}

/**
 * 版3（M3）→ 版4（M4）：災害の強さを「ふつう」にし、島に怪獣研究所の状態を足す。
 * バランス型の AI は怪獣使い型にする。
 */
function migrateV3(state: Raw): Raw {
  const islands = islandsOf(state).map((island) => ({
    ...island,
    controller: island.controller === 'balanced' ? 'tamer' : island.controller,
    breeding: Array.isArray(island.breeding) ? island.breeding : [],
  }));
  const settings = { ...(state.settings as Raw), disasterLevel: DEFAULT_SETTINGS.disasterLevel };
  return { ...state, version: 4, islands, settings };
}

/** 版4 → 版5：島に人工衛星の状態を足す */
function migrateV4(state: Raw): Raw {
  const islands = islandsOf(state).map((island) => ({ ...island, satellites: island.satellites ?? {} }));
  return { ...state, version: 5, islands };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
