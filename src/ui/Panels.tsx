import { useState } from 'react';
import { COMMAND_LIST, COMMANDS, targetProblem } from '../engine/commands';
import { autoPrepareTargets } from '../engine/game';
import { formatPeople, formatThousands, islandStats, terrainName, tileAt, tileDetail } from '../engine/island';
import { RULES } from '../engine/rules';
import type { CommandKind, Island, LogEntry } from '../engine/types';

export const INTERVAL_OPTIONS = [3000, 5000, 10000, 20000] as const;

interface StatusProps {
  island: Island;
  turn: number;
  progress: number;
  intervalMs: number;
  onIntervalChange: (ms: number) => void;
}

export function StatusBar({ island, turn, progress, intervalMs, onIntervalChange }: StatusProps) {
  const stats = islandStats(island);
  const farmWorkers = Math.min(stats.pop, stats.farm * 10);
  const foodDelta = Math.floor(farmWorkers - stats.pop * RULES.foodPerPop);
  const moneyDelta = Math.floor(Math.min(stats.pop - farmWorkers, stats.factory * 10) / 10);
  const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));

  return (
    <div className="status">
      <dl className="resources">
        <div>
          <dt>資金</dt>
          <dd>
            {island.money.toLocaleString('ja-JP')}億円 <small>{sign(moneyDelta)}/ターン</small>
          </dd>
        </div>
        <div>
          <dt>食料</dt>
          <dd>
            {(island.food * 100).toLocaleString('ja-JP')}トン{' '}
            <small className={foodDelta < 0 ? 'warn' : undefined}>{sign(foodDelta * 100)}/ターン</small>
          </dd>
        </div>
        <div>
          <dt>人口</dt>
          <dd>{formatPeople(stats.pop)}</dd>
        </div>
        <div>
          <dt>農場</dt>
          <dd>{formatThousands(stats.farm)}人規模</dd>
        </div>
        <div>
          <dt>工場</dt>
          <dd>{formatThousands(stats.factory)}人規模</dd>
        </div>
        <div>
          <dt>面積</dt>
          <dd>{stats.area}マス</dd>
        </div>
      </dl>
      <div className="turn">
        <div className="turn-label">
          ターン <strong>{turn}</strong>
        </div>
        <div className="turn-gauge" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <label className="interval">
          間隔
          <select value={intervalMs} onChange={(e) => onIntervalChange(Number(e.target.value))}>
            {INTERVAL_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                {ms / 1000}秒
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

interface CommandMenuProps {
  island: Island;
  selected: { x: number; y: number } | null;
  insertBefore: number | null;
  onEnqueue: (kind: CommandKind, count: number) => void;
  onAutoPrepare: (kind: 'prepare' | 'prepareInstant') => void;
}

export function CommandMenu({ island, selected, insertBefore, onEnqueue, onAutoPrepare }: CommandMenuProps) {
  const [count, setCount] = useState(1);
  const tile = selected ? tileAt(island, selected.x, selected.y) : null;
  const room = RULES.queueMax - island.queue.length;

  return (
    <section className="panel">
      <h2>マスと命令</h2>
      {selected && tile ? (
        <p className="tile-info">
          ({selected.x}, {selected.y}) <strong>{terrainName(tile)}</strong> {tileDetail(tile)}
        </p>
      ) : (
        <p className="tile-info muted">マップのマスを選んでください</p>
      )}
      <div className="count-row">
        <label>
          数量
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {insertBefore === null ? '予約の最後に追加' : `予約の${insertBefore + 1}番目に挿入`}・空き{room}枠
        </span>
      </div>
      <ul className="commands">
        {COMMAND_LIST.map((def) => {
          const problem = def.targeted
            ? selected
              ? targetProblem(island, def.kind, selected.x, selected.y)
              : 'マスを選んでください'
            : null;
          const disabled = problem !== null || room <= 0;
          return (
            <li key={def.kind}>
              <button
                type="button"
                disabled={disabled}
                title={problem ?? def.description}
                onClick={() => onEnqueue(def.kind, count)}
              >
                <span className="cmd-name">
                  {def.name}
                  {def.instant && <em>即時</em>}
                </span>
                <span className="cmd-cost">{def.cost > 0 ? `${def.cost}億円` : '無料'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <AutoInput island={island} room={room} onAutoPrepare={onAutoPrepare} />
    </section>
  );
}

function AutoInput({
  island,
  room,
  onAutoPrepare,
}: {
  island: Island;
  room: number;
  onAutoPrepare: (kind: 'prepare' | 'prepareInstant') => void;
}) {
  const targets = autoPrepareTargets(island).length;
  const disabled = targets === 0 || room <= 0;
  const reason = targets === 0 ? '予約していない荒地がありません' : room <= 0 ? '予約に空きがありません' : undefined;
  return (
    <div className="auto-input">
      <h3>
        自動入力 <small className="muted">予約していない荒地 {targets}か所</small>
      </h3>
      <div className="auto-buttons">
        {(['prepare', 'prepareInstant'] as const).map((kind) => {
          const def = COMMANDS[kind];
          const n = Math.min(targets, room);
          return (
            <button
              key={kind}
              type="button"
              disabled={disabled}
              title={reason ?? `荒地${n}か所に${def.name}を予約する（合計${n * def.cost}億円）`}
              onClick={() => onAutoPrepare(kind)}
            >
              {def.name}自動入力
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface QueuePanelProps {
  island: Island;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onMove: (id: number, delta: number) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
}

export function QueuePanel({ island, selectedId, onSelect, onMove, onRemove, onClear }: QueuePanelProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          命令予約 <small>{island.queue.length}/{RULES.queueMax}</small>
        </h2>
        <button type="button" onClick={onClear} disabled={island.queue.length === 0}>
          全消去
        </button>
      </div>
      {island.queue.length === 0 ? (
        <p className="muted">予約は空です。次のターンは資金繰りになります。</p>
      ) : (
        <ol className="queue">
          {island.queue.map((command, index) => {
            const def = COMMANDS[command.kind];
            const isSelected = command.id === selectedId;
            return (
              <li key={command.id} className={isSelected ? 'selected' : undefined}>
                <button type="button" className="queue-item" onClick={() => onSelect(isSelected ? null : command.id)}>
                  <span className="queue-index">{index + 1}</span>
                  <span>{def.name}</span>
                  {def.targeted && <span className="muted">({command.x}, {command.y})</span>}
                </button>
                {isSelected && (
                  <span className="queue-actions">
                    <button type="button" onClick={() => onMove(command.id, -1)} aria-label="前へ">
                      ↑
                    </button>
                    <button type="button" onClick={() => onMove(command.id, 1)} aria-label="後ろへ">
                      ↓
                    </button>
                    <button type="button" onClick={() => onRemove(command.id)}>
                      削除
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function LogPanel({ log }: { log: LogEntry[] }) {
  const recent = log.slice(-80).reverse();
  return (
    <section className="panel log">
      <h2>ログ</h2>
      <ul>
        {recent.map((entry, i) => (
          <li key={`${entry.turn}-${i}`} className={`tone-${entry.tone}`}>
            <span className="log-turn">T{entry.turn}</span>
            {entry.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
