import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, newSpectatorGame } from './game';
import { islandStats } from './island';
import { checkOutcome, advanceTurn } from './turn';

describe('観戦モード', () => {
  it('4島すべてが AI で始まる', () => {
    const state = newSpectatorGame(1);
    expect(state.spectator).toBe(true);
    expect(state.islands).toHaveLength(4);
    expect(state.islands.every((i) => i.controller !== 'player')).toBe(true);
    expect(state.islands[0]!.name).toBe('西の島');
  });

  it('西の島も AI として動き、全島の出来事がログに残る', () => {
    let state = newSpectatorGame(3);
    for (let i = 0; i < 400 && !state.outcome; i++) state = advanceTurn(state);
    const west = state.islands[0]!;
    expect(islandStats(west).pop).toBeGreaterThan(200);
    expect(west.research.done.length).toBeGreaterThan(0);
    const islandsInLog = new Set(state.log.map((l) => l.islandId));
    expect(islandsInLog.size).toBeGreaterThan(1);
  });

  it('決着すると勝った島を記録し、プレイヤーの勝ち負けはない', () => {
    const state = newSpectatorGame(5);
    state.settings = { ...DEFAULT_SETTINGS, economicTarget: 1 };
    const outcome = checkOutcome(state);
    expect(outcome?.winnerId).not.toBeNull();
    expect(outcome?.reason).toContain('経済的制覇');
  });

  it('西の島が滅亡しても観戦は続く', () => {
    const state = newSpectatorGame(7);
    state.islands[0]!.destroyed = true;
    expect(checkOutcome(state)).toBeNull();
  });
});
