import { useState } from 'react';
import { breedCost, breedProblem, readyMonsters } from '../engine/commands';
import {
  CONTROLLER_NAMES,
  DEFAULT_SETTINGS,
  DISASTER_LEVEL_OPTIONS,
  ECONOMIC_TARGET_OPTIONS,
  TURN_LIMIT_OPTIONS,
} from '../engine/game';
import { formatPeople, islandStats, terrainName, tileDetail, visibleTile } from '../engine/island';
import { MISSILE_LIST, missileCapacity, missileProblem } from '../engine/military';
import { abilityNames, BREED_STAGES, MONSTER_LIST, MONSTERS } from '../engine/monsters';
import { RULES } from '../engine/rules';
import { islandScore, ranking } from '../engine/score';
import type { GameSettings, GameState, Island, MissileKind, MonsterId, Outcome } from '../engine/types';

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
  const own = target.id === player.id;
  const protectedFor = own ? 0 : RULES.protectionTurns - game.turn;

  return (
    <section className="panel">
      <h2>
        {own ? (
          <>
            自分の島の怪獣を撃つ <small>自分の施設に当たると壊れます</small>
          </>
        ) : (
          <>
            {target.name}への攻撃 <small>{CONTROLLER_NAMES[target.controller]}</small>
          </>
        )}
      </h2>
      {selected && tile ? (
        <p className="tile-info">
          ({selected.x}, {selected.y}) <strong>{terrainName(tile)}</strong> {tile.kind === 'monster' ? tileDetail(tile) : ''}
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
              <tr key={island.id} className={!game.spectator && island.id === game.playerIslandId ? 'me' : undefined}>
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
  /** 観戦モードの設定画面にする */
  spectator?: boolean;
}

/** 新しいゲーム（または観戦）の設定 */
export function NewGameDialog({ onStart, onCancel, spectator = false }: NewGameProps) {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="newgame-title">
      <div className="dialog">
        <h2 id="newgame-title">{spectator ? '観戦モード' : '新しいゲーム'}</h2>
        <p>
          {spectator
            ? 'AI の島4つの戦いを眺めます。勝ち方は3つで、どれかを最初に達成した島の勝ちです。観戦中は自動セーブしないので、遊んでいたゲームはそのまま残ります。'
            : 'AI の島3つと競います。勝ち方は3つで、どれかを最初に達成した島の勝ちです。'}
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
        <label>
          災害の強さ（野生の怪獣の出やすさにも効く）
          <select
            value={settings.disasterLevel}
            onChange={(e) => setSettings({ ...settings, disasterLevel: Number(e.target.value) })}
          >
            {DISASTER_LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
            {spectator ? '観戦を始める' : '始める'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 観戦中の右側の欄（選んだマスの情報と、観戦をやめるボタン） */
export function SpectatorPanel({
  island,
  selected,
  onExit,
}: {
  island: Island;
  selected: { x: number; y: number } | null;
  onExit: () => void;
}) {
  const tile = selected ? island.tiles[selected.y * island.size + selected.x] : undefined;
  const s = islandStats(island);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          観戦中 <small>{CONTROLLER_NAMES[island.controller]}</small>
        </h2>
        <button type="button" onClick={onExit}>
          観戦をやめる
        </button>
      </div>
      <p className="tile-info">
        {island.name}：人口{formatPeople(s.pop)}・面積{s.area}マス・研究{island.research.done.length}個
        {island.destroyed ? '（滅亡）' : ''}
      </p>
      {selected && tile ? (
        <p className="tile-info">
          ({selected.x}, {selected.y}) <strong>{terrainName(tile)}</strong> {tileDetail(tile)}
        </p>
      ) : (
        <p className="tile-info muted">マスを選ぶと、その情報が出ます。観戦中はミサイル基地や海底基地も見えます。</p>
      )}
    </section>
  );
}

/** 観戦の決着の画面 */
export function SpectatorOutcomeDialog({
  outcome,
  onAgain,
  onExit,
  onClose,
}: {
  outcome: Outcome;
  onAgain: () => void;
  onExit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="spectator-outcome-title">
      <div className="dialog">
        <h2 id="spectator-outcome-title">観戦終了</h2>
        <p>{outcome.reason}</p>
        <p className="muted">ターン {outcome.turn}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            島を眺める
          </button>
          <button type="button" onClick={onExit}>
            観戦をやめる
          </button>
          <button type="button" className="primary" onClick={onAgain}>
            もう一度観戦
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

interface BreedPanelProps {
  game: GameState;
  island: Island;
  lab: { x: number; y: number };
  onBreed: (monster: MonsterId) => void;
}

/** 怪獣研究所のマスを選んだときのメニュー（怪獣を育てる） */
export function BreedPanel({ game, island, lab, onBreed }: BreedPanelProps) {
  const current = island.breeding.find((b) => b.x === lab.x && b.y === lab.y);
  const queued = island.queue.some((c) => c.kind === 'breed' && c.x === lab.x && c.y === lab.y);
  const room = RULES.queueMax - island.queue.length;
  return (
    <section className="panel">
      <h2>
        怪獣研究所 ({lab.x}, {lab.y})
      </h2>
      <p className="tile-info">
        {current
          ? current.readyTurn <= game.turn
            ? `${MONSTERS[current.monster].name}が育ち上がっています。他の島を表示して「怪獣派遣」で送れます`
            : `${MONSTERS[current.monster].name}を育てています（あと${current.readyTurn - game.turn}ターン）`
          : queued
            ? '育てる命令を予約しています'
            : '空いています。育てる怪獣を選んでください'}
      </p>
      <ul className="commands">
        {MONSTER_LIST.map((m) => {
          const stage = BREED_STAGES[m.stage]!;
          const problem =
            breedProblem(island, m.id) ??
            (current || queued ? 'この研究所では育てられません（1棟に1匹）' : null) ??
            (room <= 0 ? '予約に空きがありません' : null);
          const abilities = abilityNames(m);
          return (
            <li key={m.id}>
              <button
                type="button"
                disabled={problem !== null}
                title={problem ?? `体力${m.hpMin}${m.hpRange > 1 ? `〜${m.hpMin + m.hpRange - 1}` : ''}・${abilities.join('・') || '能力なし'}`}
                onClick={() => onBreed(m.id)}
              >
                <span className="cmd-name">
                  {m.name} <em>段階{m.stage}</em>
                </span>
                <span className="cmd-cost">
                  {breedCost(m.id).toLocaleString('ja-JP')}億円・{stage.turns}ターン
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface SendMonsterProps {
  game: GameState;
  player: Island;
  target: Island;
  onSend: () => void;
}

/** 他の島を表示しているときの「怪獣派遣」 */
export function SendMonsterPanel({ game, player, target, onSend }: SendMonsterProps) {
  if (player.breeding.length === 0 && !player.tiles.some((t) => t.kind === 'monsterLab')) return null;
  const ready = readyMonsters(player, game.turn);
  const room = RULES.queueMax - player.queue.length;
  const problem =
    player.breeding.length === 0 ? '育てている怪獣がいません' : room <= 0 ? '予約に空きがありません' : null;
  return (
    <section className="panel">
      <h2>
        怪獣派遣 <small>育ち上がった怪獣 {ready.length}匹・育てている怪獣 {player.breeding.length - ready.length}匹</small>
      </h2>
      <p className="muted">
        予約を実行するときに育ち上がった怪獣がいれば、{target.name}のどこかに1匹送り込みます。
      </p>
      <button type="button" disabled={problem !== null} title={problem ?? undefined} onClick={onSend}>
        {target.name}に怪獣を送る
      </button>
    </section>
  );
}
