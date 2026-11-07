import { terrainName, visibleTile } from '../engine/island';
import { RULES } from '../engine/rules';
import {
  canSeeHiddenBases,
  laserProblem,
  launchProblem,
  launchSuccessRate,
  repairCost,
  repairProblem,
  SATELLITE_LIST,
  SATELLITE_RULES,
} from '../engine/satellites';
import { hasTech } from '../engine/tech';
import type { GameState, Island, SatelliteKind } from '../engine/types';

/** 島の人工衛星を「気象衛星(80)・観測衛星(12)」のように並べる。なければ null */
export function satelliteSummary(island: Island): string | null {
  const parts = SATELLITE_LIST.filter((d) => (island.satellites[d.kind] ?? 0) > 0).map(
    (d) => `${d.name}(${island.satellites[d.kind]})`,
  );
  return parts.length > 0 ? parts.join('・') : null;
}

interface SatellitePanelProps {
  island: Island;
  insertBefore: number | null;
  onOrder: (kind: 'launchSatellite' | 'repairSatellite', satellite: SatelliteKind) => void;
}

/** 自分の島の人工衛星（打ち上げと修復） */
export function SatellitePanel({ island, insertBefore, onOrder }: SatellitePanelProps) {
  if (!hasTech(island, 'rocket') && !satelliteSummary(island)) return null;
  const room = RULES.queueMax - island.queue.length;
  return (
    <section className="panel">
      <h2>
        人工衛星 <small>{insertBefore === null ? '予約の最後に追加' : `予約の${insertBefore + 1}番目に挿入`}</small>
      </h2>
      <p className="muted">
        耐久は毎ターン{SATELLITE_RULES.decayPerTurn}ずつ減り、0になると失われます。修復すると{SATELLITE_RULES.repairDurability}に戻ります。
      </p>
      <ul className="commands satellites">
        {SATELLITE_LIST.map((def) => {
          const durability = island.satellites[def.kind] ?? 0;
          const launchedProblem = launchProblem(island, def.kind) ?? (room <= 0 ? '予約に空きがありません' : null);
          const fixProblem = repairProblem(island, def.kind) ?? (room <= 0 ? '予約に空きがありません' : null);
          const unlocked = hasTech(island, def.tech);
          return (
            <li key={def.kind} className="satellite-row">
              <div className="satellite-name">
                <strong>{def.name}</strong>
                <span className={durability > 0 ? (durability < 25 ? 'warn' : undefined) : 'muted'}>
                  {durability > 0 ? `耐久${durability}` : unlocked ? 'なし' : '未研究'}
                </span>
              </div>
              <p className="muted satellite-desc">{def.description}</p>
              {durability > 0 ? (
                <button
                  type="button"
                  disabled={fixProblem !== null}
                  title={fixProblem ?? undefined}
                  onClick={() => onOrder('repairSatellite', def.kind)}
                >
                  <span className="cmd-name">修復</span>
                  <span className="cmd-cost">{repairCost(def.kind).toLocaleString('ja-JP')}億円</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={launchedProblem !== null}
                  title={launchedProblem ?? undefined}
                  onClick={() => onOrder('launchSatellite', def.kind)}
                >
                  <span className="cmd-name">打ち上げ</span>
                  <span className="cmd-cost">
                    {def.cost.toLocaleString('ja-JP')}億円・成功{Math.round(launchSuccessRate(island, def.kind) * 100)}%
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface LaserPanelProps {
  game: GameState;
  player: Island;
  target: Island;
  selected: { x: number; y: number } | null;
  onFire: () => void;
}

/** 他の島を見ているときの、衛星の情報と衛星レーザー */
export function LaserPanel({ game, player, target, selected, onFire }: LaserPanelProps) {
  const theirs = satelliteSummary(target);
  const hasMilitary = (player.satellites.military ?? 0) > 0;
  if (!theirs && !hasMilitary && !canSeeHiddenBases(player)) return null;
  const see = canSeeHiddenBases(player) ? (t: (typeof target.tiles)[number]) => t : visibleTile;
  const tile = selected ? see(target.tiles[selected.y * target.size + selected.x]!) : null;
  // 序盤の保護は実行するターンで判断されるので、予約の時点では見ない
  const world = {
    islands: game.islands,
    turn: Math.max(game.turn + 1, RULES.protectionTurns + 1),
    peaceful: game.settings.peaceful,
  };
  const room = RULES.queueMax - player.queue.length;
  const problem = !selected
    ? '狙うマスを選んでください'
    : (laserProblem(world, player, target.id) ?? (room <= 0 ? '予約に空きがありません' : null));
  return (
    <section className="panel">
      <h2>
        人工衛星 <small>{target.name}：{theirs ?? 'なし'}</small>
      </h2>
      {canSeeHiddenBases(player) && <p className="muted">観測衛星で、この島のミサイル基地と海底基地が見えています。</p>}
      {(target.satellites.intercept ?? 0) > 0 && (
        <p className="muted">迎撃衛星があるので、ミサイルは{Math.round(SATELLITE_RULES.interceptChance * 100)}%の確率で撃ち落とされます。</p>
      )}
      {hasMilitary && (
        <>
          {selected && tile && (
            <p className="tile-info">
              ({selected.x}, {selected.y}) <strong>{terrainName(tile)}</strong>
            </p>
          )}
          <ul className="commands">
            <li>
              <button type="button" disabled={problem !== null} title={problem ?? undefined} onClick={onFire}>
                <span className="cmd-name">衛星レーザー</span>
                <span className="cmd-cost">
                  {SATELLITE_RULES.laserCost.toLocaleString('ja-JP')}億円・軍事衛星の耐久-{SATELLITE_RULES.laserWear}
                </span>
              </button>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
