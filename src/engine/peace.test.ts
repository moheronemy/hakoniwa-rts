import { describe, expect, it } from 'vitest';
import { executeCommand, type CommandContext } from './commands';
import { DEFAULT_SETTINGS, newGame, newSpectatorGame, playerIsland } from './game';
import { setTile } from './island';
import { missileProblem, PEACEFUL_MESSAGE, type World } from './military';
import { Rng } from './rng';
import { advanceTurn, checkOutcome } from './turn';
import type { GameState } from './types';

const PEACE = { ...DEFAULT_SETTINGS, peaceful: true };

function world(state: GameState, turn = 500): World {
  return { islands: state.islands, turn, emit: () => {}, peaceful: true };
}

describe('平和モード', () => {
  it('他の島へのミサイルは撃てないが、自分の島へは撃てる', () => {
    const state = newGame(1, PEACE);
    const me = playerIsland(state);
    setTile(me, 0, 0, 'missileBase', 0);
    const w = world(state);
    expect(missileProblem(w, me, 'missileNormal', state.islands[1]!.id)).toBe(PEACEFUL_MESSAGE);
    expect(missileProblem(w, me, 'missileNormal', me.id)).toBeNull();
  });

  it('怪獣を他の島に送れない', () => {
    const state = newGame(2, PEACE);
    const me = playerIsland(state);
    me.breeding.push({ x: 0, y: 0, monster: 'm1', readyTurn: 0 });
    const ctx: CommandContext = { effects: { attract: false }, rng: new Rng(1), world: world(state) };
    const result = executeCommand(me, 'sendMonster', 0, 0, ctx, { targetIslandId: state.islands[1]!.id });
    expect(result.ok).toBe(false);
    expect(result.message).toContain(PEACEFUL_MESSAGE);
  });

  it('AI は攻撃も怪獣の派遣もしない', () => {
    let state = newGame(4, PEACE);
    for (let i = 0; i < 600 && !state.outcome; i++) state = advanceTurn(state);
    expect(state.islands.every((i) => i.lastAttackedBy === null)).toBe(true);
    expect(state.islands.every((i) => !i.tiles.some((t) => t.kind === 'monsterLab'))).toBe(true);
  });

  it('勝利条件を満たしてもゲームは続き、達成は1回だけ記録される', () => {
    let state = newGame(5, { ...PEACE, economicTarget: 50 });
    const me = playerIsland(state);
    setTile(me, 0, 0, 'town', 100);
    setTile(me, 1, 0, 'farm', 50);
    state = advanceTurn(state);
    state = advanceTurn(state);
    expect(state.outcome).toBeNull();
    const mine = (state.milestones ?? []).filter((m) => m.key === `economic:${me.id}`);
    expect(mine).toHaveLength(1);
    expect(state.log.filter((l) => l.text.includes('経済的制覇の条件')).length).toBe(1);
  });

  it('期限のターンを迎えても続く', () => {
    let state = newGame(6, { ...PEACE, turnLimit: 3 });
    for (let i = 0; i < 5; i++) state = advanceTurn(state);
    expect(state.turn).toBe(5);
    expect(state.outcome).toBeNull();
    expect(state.milestones?.some((m) => m.key === 'deadline')).toBe(true);
  });

  it('自分の島が滅亡したら終わる', () => {
    const state = newGame(7, PEACE);
    playerIsland(state).destroyed = true;
    expect(checkOutcome(state)?.result).toBe('lose');
  });

  it('観戦モードでも平和モードを選べ、決着しない', () => {
    const state = newSpectatorGame(8, { ...PEACE, economicTarget: 1 });
    expect(checkOutcome(state)).toBeNull();
  });
});
