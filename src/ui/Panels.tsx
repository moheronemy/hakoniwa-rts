import { useState } from 'react';
import { COMMAND_LIST, COMMANDS, commandCost, targetProblem } from '../engine/commands';
import { forecast } from '../engine/forecast';
import { isMissile } from '../engine/military';
import { autoPrepareTargets } from '../engine/game';
import { formatPeople, formatThousands, islandStats, terrainName, tileAt, tileDetail } from '../engine/island';
import { RULES } from '../engine/rules';
import { BRANCH_NAMES, canResearch, hasTech, TECH_LIST, TECHS, type Branch } from '../engine/tech';
import type { CommandKind, Island, LogEntry, TechId } from '../engine/types';

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
  const f = forecast(island);
  const sign = (n: number) => (n >= 0 ? `+${n}` : String(n));
  const round = (n: number) => Math.round(n * 10) / 10;
  const current = island.research.current;

  return (
    <div className="status">
      <dl className="resources">
        <div>
          <dt>資金</dt>
          <dd>
            {island.money.toLocaleString('ja-JP')}億円 <small>{sign(f.money)}/ターン</small>
          </dd>
        </div>
        <div>
          <dt>食料</dt>
          <dd>
            {(island.food * 100).toLocaleString('ja-JP')}トン{' '}
            <small className={f.food < 0 ? 'warn' : undefined}>{sign(f.food * 100)}/ターン</small>
          </dd>
        </div>
        <div>
          <dt>人口</dt>
          <dd>{formatPeople(stats.pop)}</dd>
        </div>
        <div title="供給／需要（万kW）">
          <dt>電力</dt>
          <dd className={f.power.ratio < 1 ? 'warn' : undefined}>
            {Math.round(f.power.supply)}/{Math.round(f.power.demand)}万kW{' '}
            <small>{Math.round(f.power.ratio * 100)}%</small>
          </dd>
        </div>
        <div>
          <dt>石油</dt>
          <dd>
            {Math.floor(island.oil)} <small className={f.oil < 0 ? 'warn' : undefined}>{sign(round(f.oil))}/ターン</small>
          </dd>
        </div>
        <div title={current ? `研究中：${TECHS[current].name}` : '研究する技術を選んでいません'}>
          <dt>研究</dt>
          <dd>
            {current ? TECHS[current].name : '未選択'} <small>+{round(f.research)}/ターン</small>
          </dd>
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
        {COMMAND_LIST.filter((def) => !isMissile(def.kind)).map((def) => {
          // マスを対象にしない命令（石油の売却など）は、実行するときに条件を確かめるので予約はできる
          const problem = def.targeted
            ? selected
              ? targetProblem(island, def.kind, selected.x, selected.y)
              : 'マスを選んでください'
            : null;
          const cost = commandCost(island, def.kind);
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
                <span className="cmd-cost">{cost > 0 ? `${cost.toLocaleString('ja-JP')}億円` : '無料'}</span>
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
  islandNames: Record<string, string>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onMove: (id: number, delta: number) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
}

export function QueuePanel({ island, islandNames, selectedId, onSelect, onMove, onRemove, onClear }: QueuePanelProps) {
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
                  {command.targetIslandId ? (
                    <span className="muted">
                      {islandNames[command.targetIslandId] ?? '?'} ({command.x}, {command.y})・
                      {command.count ? `${command.count}発` : '撃てるだけ'}
                    </span>
                  ) : (
                    def.targeted && <span className="muted">({command.x}, {command.y})</span>
                  )}
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

interface TechPanelProps {
  island: Island;
  onSelect: (id: TechId | null) => void;
}

export function TechPanel({ island, onSelect }: TechPanelProps) {
  const { research } = island;
  const branches = Object.keys(BRANCH_NAMES) as Branch[];
  return (
    <section className="panel tech">
      <div className="panel-head">
        <h2>
          技術ツリー <small>貯まっている研究ポイント {Math.floor(research.pool)}</small>
        </h2>
        {research.current && (
          <button type="button" onClick={() => onSelect(null)}>
            研究をやめる
          </button>
        )}
      </div>
      <div className="tech-branches">
        {branches.map((branch) => (
          <div key={branch} className="tech-branch">
            <h3>{BRANCH_NAMES[branch]}</h3>
            <ol>
              {TECH_LIST.filter((t) => t.branch === branch).map((tech) => {
                const done = hasTech(island, tech.id);
                const isCurrent = research.current === tech.id;
                const available = canResearch(island, tech.id);
                const spent = Math.floor(research.progress[tech.id] ?? 0);
                const state = done ? 'done' : isCurrent ? 'current' : available ? 'available' : 'locked';
                const label = done
                  ? '完成'
                  : isCurrent
                    ? `研究中 ${spent}/${tech.cost}`
                    : available
                      ? `${spent > 0 ? `${spent}/` : ''}${tech.cost}pt`
                      : `前提：${TECHS[tech.requires!].name}`;
                return (
                  <li key={tech.id} className={`tech-${state}`}>
                    <button
                      type="button"
                      disabled={!available || isCurrent}
                      title={tech.description}
                      onClick={() => onSelect(tech.id)}
                    >
                      <span className="tech-name">{tech.name}</span>
                      <span className="tech-state">{label}</span>
                      {(isCurrent || (spent > 0 && !done)) && (
                        <span className="tech-bar">
                          <span style={{ width: `${Math.min(100, (spent / tech.cost) * 100)}%` }} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
