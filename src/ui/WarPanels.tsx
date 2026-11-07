import { useState } from 'react';
import { CONTROLLER_NAMES, DEFAULT_SETTINGS, ECONOMIC_TARGET_OPTIONS, TURN_LIMIT_OPTIONS } from '../engine/game';
import { formatPeople, islandStats, terrainName, visibleTile } from '../engine/island';
import { MISSILE_LIST, missileCapacity, missileProblem } from '../engine/military';
import { RULES } from '../engine/rules';
import { islandScore, ranking } from '../engine/score';
import type { GameSettings, GameState, Island, MissileKind, Outcome } from '../engine/types';

interface TabsProps {
  game: GameState;
  viewId: string;
  onSelect: (id: string) => void;
}

/** 自分の島と AI の島を切り替えるタブ */
export function IslandTabs({ game, viewId, onSelect }: TabsProps) {
  const order = ranking(game.islands).map((i) => i.id);
  return (
    <div className="island-tabs" role="tablist">
      {game.islands.map((island) => {
        const rank = order.indexOf(island.id) + 1;
        return (
          <button
            key={island.id}
            type="button"
            role="tab"
            aria-selected={island.id === viewId}
            className={`${island.id === viewId ? 'active' : ''} ${island.destroyed ? 'destroyed' : ''}`}
            onClick={() => onSelect(island.id)}
          >
            <span className="tab-name">{island.name}</span>
            <span className="tab-sub">
              {island.destroyed ? '滅亡' : `${rank}位・${formatPeople(islandStats(island).pop)}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface MissileMenuProps {
  game: GameState;
  player: Island;
  target: Island;
  selected: { x: number; y: number } | null;
  insertBefore: number | null;
  onFire: (kind: MissileKind, shots: number) => void;
}

const SHOT_OPTIONS = [0, 1, 2, 3, 5, 10, 20] as const;

/** AI の島を表示しているときの命令メニュー（ミサイル） */
export function MissileMenu({ game, player, target, selected, insertBefore, onFire }: MissileMenuProps) {
  const [shots, setShots] = useState(0);
  const tile = selected ? visibleTile(target.tiles[selected.y * target.size + selected.x]!) : null;
  // 予約に入れる時点では、序盤の保護は「実行するターン」で判断されるので、ここでは見ない
  const world = { islands: game.islands, turn: Math.max(game.turn + 1, RULES.protectionTurns + 1) };
  const capacity = missileCapacity(player);
  const room = RULES.queueMax - player.queue.length;
  const protectedFor = RULES.protectionTurns - game.turn;

  return (
    <section className="panel">
      <h2>
        {target.name}への攻撃 <small>{CONTROLLER_NAMES[target.controller]}</small>
      </h2>
      {selected && tile ? (
        <p className="tile-info">
          ({selected.x}, {selected.y}) <strong>{terrainName(tile)}</strong>
        </p>
      ) : (
        <p className="tile-info muted">狙うマスを選んでください</p>
      )}
      {protectedFor > 0 && (
        <p className="muted">序盤の保護：あと{protectedFor}ターンは撃てません（予約はできます）</p>
      )}
      <div className="count-row">
        <label>
          発数
          <select value={shots} onChange={(e) => setShots(Number(e.target.value))}>
            {SHOT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? '撃てるだけ' : n}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          1回に撃てる数 {capacity}発・{insertBefore === null ? '予約の最後に追加' : `予約の${insertBefore + 1}番目に挿入`}
        </span>
      </div>
      <ul className="commands">
        {MISSILE_LIST.map((def) => {
          const problem = !selected
            ? '狙うマスを選んでください'
            : (missileProblem(world, player, def.kind, target.id) ?? (room <= 0 ? '予約に空きがありません' : null));
          return (
            <li key={def.kind}>
              <button type="button" disabled={problem !== null} title={problem ?? def.description} onClick={() => onFire(def.kind, shots)}>
                <span className="cmd-name">{def.name}発射</span>
                <span className="cmd-cost">
                  1発 {def.money.toLocaleString('ja-JP')}億円・石油{def.oil}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 順位表と勝利条件 */
export function RankingPanel({ game }: { game: GameState }) {
  const rows = ranking(game.islands);
  return (
    <section className="panel ranking">
      <h2>
        順位{' '}
        <small>
          経済的制覇：人口{formatPeople(game.settings.economicTarget)}・期限：{game.settings.turnLimit}ターン
        </small>
      </h2>
      <table>
        <thead>
          <tr>
            <th>順位</th>
            <th>島</th>
            <th>性格</th>
            <th>スコア</th>
            <th>人口</th>
            <th>面積</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((island, i) => {
            const s = islandStats(island);
            return (
              <tr key={island.id} className={island.id === game.playerIslandId ? 'me' : undefined}>
                <td>{island.destroyed ? '－' : i + 1}</td>
                <td>{island.name}</td>
                <td>{CONTROLLER_NAMES[island.controller]}</td>
                <td>{island.destroyed ? '滅亡' : islandScore(island).toLocaleString('ja-JP')}</td>
                <td>{formatPeople(s.pop)}</td>
                <td>{s.area}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

interface NewGameProps {
  onStart: (settings: GameSettings) => void;
  onCancel: (() => void) | null;
}

/** 新しいゲームの設定 */
export function NewGameDialog({ onStart, onCancel }: NewGameProps) {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="newgame-title">
      <div className="dialog">
        <h2 id="newgame-title">新しいゲーム</h2>
        <p>
          AI の島3つと競います。勝ち方は3つで、どれかを最初に達成した島の勝ちです。
        </p>
        <ul className="rules">
          <li>軍事的制覇：自分以外の島をすべて滅亡させる</li>
          <li>経済的制覇：目標の人口に最初に届く</li>
          <li>期限：期限のターンでスコア1位</li>
        </ul>
        <label>
          経済的制覇の目標人口
          <select
            value={settings.economicTarget}
            onChange={(e) => setSettings({ ...settings, economicTarget: Number(e.target.value) })}
          >
            {ECONOMIC_TARGET_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {formatPeople(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          期限
          <select value={settings.turnLimit} onChange={(e) => setSettings({ ...settings, turnLimit: Number(e.target.value) })}>
            {TURN_LIMIT_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}ターン
              </option>
            ))}
          </select>
        </label>
        <p className="muted">最初の{RULES.protectionTurns}ターンは、どの島もミサイルを撃てません。</p>
        <div className="dialog-actions">
          {onCancel && (
            <button type="button" onClick={onCancel}>
              やめる
            </button>
          )}
          <button type="button" className="primary" onClick={() => onStart(settings)}>
            始める
          </button>
        </div>
      </div>
    </div>
  );
}

/** 勝敗が決まったときの画面 */
export function OutcomeDialog({ outcome, onNewGame, onClose }: { outcome: Outcome; onNewGame: () => void; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="outcome-title">
      <div className={`dialog outcome-${outcome.result}`}>
        <h2 id="outcome-title">{outcome.result === 'win' ? '勝利' : '敗北'}</h2>
        <p>{outcome.reason}</p>
        <p className="muted">ターン {outcome.turn}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            島を眺める
          </button>
          <button type="button" className="primary" onClick={onNewGame}>
            新しいゲーム
          </button>
        </div>
      </div>
    </div>
  );
}
