import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMMANDS } from '../engine/commands';
import {
  autoPrepareTargets,
  clearQueue,
  enqueueAutoPrepare,
  enqueueBreed,
  enqueueCommand,
  enqueueLaser,
  enqueueMissile,
  enqueueSatellite,
  enqueueSendMonster,
  moveCommand,
  newGame,
  newSpectatorGame,
  playerIsland,
  removeCommand,
  setResearch,
} from '../engine/game';
import { visibleTile } from '../engine/island';
import { deserialize, serialize } from '../engine/save';
import { advanceTurn } from '../engine/turn';
import { canSeeHiddenBases } from '../engine/satellites';
import type { CommandKind, GameSettings, GameState, MissileKind, MonsterId, SatelliteKind } from '../engine/types';
import { MapCanvas, type MapMarker } from './MapCanvas';
import { LaserPanel, SatellitePanel } from './SatellitePanels';
import {
  CommandMenu,
  INTERVAL_OPTIONS,
  LogPanel,
  QueuePanel,
  SPECTATOR_INTERVAL_OPTIONS,
  StatusBar,
  TechPanel,
} from './Panels';
import { AUTOSAVE_KEY, loadText, readPreference, saveText, writePreference } from './storage';
import { useTurnTimer } from './useTurnTimer';
import {
  BreedPanel,
  IslandTabs,
  MissileMenu,
  NewGameDialog,
  OutcomeDialog,
  PeacefulPanel,
  RankingPanel,
  SendMonsterPanel,
  SpectatorOutcomeDialog,
  SpectatorPanel,
} from './WarPanels';

const INTERVAL_KEY = 'turnIntervalMs';
const SPECTATOR_INTERVAL_KEY = 'spectatorIntervalMs';

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

function initialInterval(key: string, options: readonly number[], fallback: number): number {
  const saved = Number(readPreference(key));
  return options.includes(saved) ? saved : fallback;
}

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [intervalMs, setIntervalMs] = useState(() => initialInterval(INTERVAL_KEY, INTERVAL_OPTIONS, 5000));
  const [spectatorIntervalMs, setSpectatorIntervalMs] = useState(() =>
    initialInterval(SPECTATOR_INTERVAL_KEY, SPECTATOR_INTERVAL_OPTIONS, 250),
  );
  const [viewId, setViewId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 設定画面。'first' は起動時（やめられない）、'spectator' は観戦モード */
  const [newGameOpen, setNewGameOpen] = useState<false | 'first' | 'menu' | 'spectator'>(false);
  const [outcomeClosed, setOutcomeClosed] = useState(false);
  const gameRef = useRef(game);
  gameRef.current = game;
  const fileInput = useRef<HTMLInputElement>(null);

  // 起動時：自動セーブがあれば続きから、なければ新しいゲームの設定画面
  useEffect(() => {
    let cancelled = false;
    void loadText(AUTOSAVE_KEY).then((text) => {
      if (cancelled) return;
      if (text) {
        try {
          setGame(deserialize(text));
          setNotice('自動セーブから再開しました');
          return;
        } catch {
          // 読めなければ新しく始める
        }
      }
      setNewGameOpen('first');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 観戦中は保存しない（遊んでいたゲームの自動セーブをそのまま残す）
  const save = useCallback(() => {
    const current = gameRef.current;
    if (current && !current.spectator) void saveText(AUTOSAVE_KEY, serialize(current));
  }, []);

  // 毎ターンと、タブが裏に回ったとき・閉じるときに自動セーブする。
  // 閉じる瞬間の保存は書き込みが終わる前に打ち切られることがあるので、毎ターンの保存を主にする。
  useEffect(() => {
    if (game && game.turn > 0) save();
  }, [game?.turn, save]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) save();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', save);
    };
  }, [save]);

  const spectating = game?.spectator === true;
  const running = game !== null && game.outcome === null && newGameOpen === false;
  const progress = useTurnTimer(
    spectating ? spectatorIntervalMs : intervalMs,
    () => setGame((g) => (g ? advanceTurn(g) : g)),
    running,
  );

  // 平和モードで勝利条件を満たしたら、通知で知らせる（ゲームは続く）
  const milestoneCount = game?.milestones?.length ?? 0;
  const lastMilestone = useRef(milestoneCount);
  useEffect(() => {
    const latest = game?.milestones?.[milestoneCount - 1];
    // 読み込んだセーブデータの古い記録では知らせない（達成したそのターンだけ）
    if (milestoneCount > lastMilestone.current && latest && latest.turn === game?.turn) setNotice(latest.text);
    lastMilestone.current = milestoneCount;
  }, [milestoneCount, game?.milestones, game?.turn]);

  // 予約から命令が実行されて消えたら、その選択を外す
  useEffect(() => {
    if (game && selectedCommand !== null && !playerIsland(game).queue.some((c) => c.id === selectedCommand)) {
      setSelectedCommand(null);
    }
  }, [game, selectedCommand]);

  const island = game ? playerIsland(game) : null;
  const viewed = game?.islands.find((i) => i.id === (viewId ?? game.playerIslandId)) ?? island;
  const viewingOwn = !!viewed && viewed.id === island?.id;

  // マップの印：自分の島では予約の順番、他の島ではそこを狙う予約の順番
  const markers = useMemo<MapMarker[]>(() => {
    if (!island || !viewed) return [];
    const seen = new Set<string>();
    const result: MapMarker[] = [];
    if (spectating) return result;
    island.queue.forEach((c, index) => {
      const onThisIsland = c.targetIslandId
        ? c.targetIslandId === viewed.id && c.kind !== 'sendMonster'
        : viewingOwn && COMMANDS[c.kind].targeted;
      if (!onThisIsland) return;
      const key = `${c.x},${c.y}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ x: c.x, y: c.y, label: String(index + 1) });
    });
    return result;
  }, [island, viewed, viewingOwn, spectating]);

  if (!game || !island || !viewed) {
    return (
      <div className="loading">
        {newGameOpen ? (
          <NewGameDialog
            spectator={newGameOpen === 'spectator'}
            onStart={(s) => (newGameOpen === 'spectator' ? startSpectator(s) : startGame(s))}
            onCancel={newGameOpen === 'spectator' ? () => setNewGameOpen('first') : null}
          />
        ) : (
          '読み込み中…'
        )}
      </div>
    );
  }

  const insertBefore =
    selectedCommand === null ? null : island.queue.findIndex((c) => c.id === selectedCommand);
  const insertIndex = insertBefore !== null && insertBefore >= 0 ? insertBefore : null;
  const islandNames = Object.fromEntries(game.islands.map((i) => [i.id, i.name]));

  function resetView() {
    setViewId(null);
    setSelected(null);
    setSelectedCommand(null);
    setOutcomeClosed(false);
    setNewGameOpen(false);
  }

  function startGame(settings: GameSettings) {
    setGame(newGame(randomSeed(), settings));
    resetView();
    setNotice('新しいゲームを始めました');
  }

  function startSpectator(settings: GameSettings) {
    setGame(newSpectatorGame(randomSeed(), settings));
    resetView();
    setNotice('観戦を始めました。観戦中は自動セーブしません');
  }

  /** 観戦をやめて、自動セーブしてあった（遊んでいた）ゲームに戻る */
  async function exitSpectator() {
    resetView();
    const text = await loadText(AUTOSAVE_KEY);
    if (text) {
      try {
        const loaded = deserialize(text);
        if (!loaded.spectator) {
          setGame(loaded);
          setNotice('観戦をやめて、遊んでいたゲームに戻りました');
          return;
        }
      } catch {
        // 読めなければ新しいゲームへ
      }
    }
    setGame(null);
    setNewGameOpen('first');
  }

  const handleEnqueue = (kind: CommandKind, count: number) => {
    const target = selected ?? { x: 0, y: 0 };
    setGame((g) => (g ? enqueueCommand(g, kind, target.x, target.y, count, insertIndex ?? undefined) : g));
  };

  const handleFire = (kind: MissileKind, shots: number) => {
    if (!selected) return;
    setGame((g) => (g ? enqueueMissile(g, kind, viewed.id, selected.x, selected.y, shots, insertIndex ?? undefined) : g));
  };

  const handleBreed = (monster: MonsterId) => {
    if (!selected) return;
    setGame((g) => (g ? enqueueBreed(g, selected.x, selected.y, monster, insertIndex ?? undefined) : g));
  };

  const handleSatellite = (kind: 'launchSatellite' | 'repairSatellite', satellite: SatelliteKind) => {
    setGame((g) => (g ? enqueueSatellite(g, kind, satellite, insertIndex ?? undefined) : g));
  };

  const handleLaser = () => {
    if (!selected) return;
    setGame((g) => (g ? enqueueLaser(g, viewed.id, selected.x, selected.y, insertIndex ?? undefined) : g));
  };

  const handleSend = () => {
    setGame((g) => (g ? enqueueSendMonster(g, viewed.id, insertIndex ?? undefined) : g));
  };

  const selectedTile = selected ? viewed.tiles[selected.y * viewed.size + selected.x] : undefined;

  const handleAutoPrepare = (kind: 'prepare' | 'prepareInstant') => {
    const total = autoPrepareTargets(island).length;
    const { state, added } = enqueueAutoPrepare(game, kind, insertIndex ?? undefined);
    setGame(state);
    const name = COMMANDS[kind].name;
    setNotice(
      added < total
        ? `荒地${added}か所に${name}を予約しました（予約の空きが足りず、${total - added}か所は入れていません）`
        : `荒地${added}か所に${name}を予約しました`,
    );
  };

  const handleExport = () => {
    const blob = new Blob([serialize(game)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hakoniwa-rts-turn${game.turn}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const loaded = deserialize(await file.text());
      setGame(loaded);
      setViewId(null);
      setSelected(null);
      setSelectedCommand(null);
      setOutcomeClosed(false);
      setNotice(`ターン${loaded.turn}のセーブデータを読み込みました`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '読み込みに失敗しました');
    }
  };

  const handleIntervalChange = (ms: number) => {
    if (spectating) {
      setSpectatorIntervalMs(ms);
      writePreference(SPECTATOR_INTERVAL_KEY, String(ms));
    } else {
      setIntervalMs(ms);
      writePreference(INTERVAL_KEY, String(ms));
    }
  };

  const handleView = (id: string) => {
    setViewId(id);
    setSelected(null);
  };

  const header = (
    <header className="app-header">
      <h1>
        箱庭RTS（仮）{spectating && <small className="spectator-badge">観戦中</small>}
        {game.settings.peaceful && <small className="spectator-badge peaceful-badge">平和モード</small>}
      </h1>
      <div className="header-actions">
        {spectating ? (
          <button type="button" onClick={() => void exitSpectator()}>
            観戦をやめる
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setNewGameOpen('menu')}>
              新しいゲーム
            </button>
            <button type="button" onClick={() => setNewGameOpen('spectator')}>
              観戦モード
            </button>
            <button type="button" onClick={handleExport}>
              セーブを書き出す
            </button>
            <button type="button" onClick={() => fileInput.current?.click()}>
              読み込む
            </button>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImport(file);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );

  const sidePanels = spectating ? (
    <SpectatorPanel island={viewed} selected={selected} onExit={() => void exitSpectator()} />
  ) : (
    <>
      {viewingOwn && selectedTile?.kind === 'monsterLab' && selected && (
        <BreedPanel game={game} island={island} lab={selected} onBreed={handleBreed} />
      )}
      {viewingOwn && selectedTile?.kind === 'monster' && (
        <MissileMenu
          game={game}
          player={island}
          target={island}
          selected={selected}
          insertBefore={insertIndex}
          onFire={handleFire}
        />
      )}
      {viewingOwn ? (
        <CommandMenu
          island={island}
          selected={selected}
          insertBefore={insertIndex}
          onEnqueue={handleEnqueue}
          onAutoPrepare={handleAutoPrepare}
        />
      ) : game.settings.peaceful ? (
        <PeacefulPanel island={viewed} selected={selected} />
      ) : (
        <>
          <MissileMenu
            game={game}
            player={island}
            target={viewed}
            selected={selected}
            insertBefore={insertIndex}
            onFire={handleFire}
          />
          <SendMonsterPanel game={game} player={island} target={viewed} onSend={handleSend} />
        </>
      )}
      {viewingOwn ? (
        <SatellitePanel island={island} insertBefore={insertIndex} onOrder={handleSatellite} />
      ) : (
        <LaserPanel game={game} player={island} target={viewed} selected={selected} onFire={handleLaser} />
      )}
      <QueuePanel
        island={island}
        islandNames={islandNames}
        selectedId={selectedCommand}
        onSelect={setSelectedCommand}
        onMove={(id, delta) => setGame((g) => (g ? moveCommand(g, id, delta) : g))}
        onRemove={(id) => setGame((g) => (g ? removeCommand(g, id) : g))}
        onClear={() => setGame((g) => (g ? clearQueue(g) : g))}
      />
    </>
  );

  return (
    <div className="app">
      {header}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="閉じる">
            ×
          </button>
        </div>
      )}
      <StatusBar
        island={spectating ? viewed : island}
        turn={game.turn}
        progress={progress}
        intervalMs={spectating ? spectatorIntervalMs : intervalMs}
        intervalOptions={spectating ? SPECTATOR_INTERVAL_OPTIONS : INTERVAL_OPTIONS}
        onIntervalChange={handleIntervalChange}
      />
      <IslandTabs game={game} viewId={viewed.id} onSelect={handleView} />
      <main className="layout">
        <div className="map-wrap">
          <MapCanvas
            island={viewed}
            selected={selected}
            onSelect={(x, y) => setSelected({ x, y })}
            markers={markers}
            display={viewingOwn || spectating || canSeeHiddenBases(island) ? undefined : visibleTile}
            dimmed={viewed.destroyed}
          />
        </div>
        <div className="side">{sidePanels}</div>
      </main>
      <RankingPanel game={game} />
      {!spectating && (
        <TechPanel island={island} onSelect={(id) => setGame((g) => (g ? setResearch(g, id) : g))} />
      )}
      <LogPanel log={game.log} islandNames={spectating ? islandNames : undefined} />
      {newGameOpen && (
        <NewGameDialog
          spectator={newGameOpen === 'spectator'}
          onStart={newGameOpen === 'spectator' ? startSpectator : startGame}
          onCancel={newGameOpen === 'first' ? null : () => setNewGameOpen(false)}
        />
      )}
      {game.outcome && !outcomeClosed && !newGameOpen && spectating && (
        <SpectatorOutcomeDialog
          outcome={game.outcome}
          onAgain={() => setNewGameOpen('spectator')}
          onExit={() => void exitSpectator()}
          onClose={() => setOutcomeClosed(true)}
        />
      )}
      {game.outcome && !outcomeClosed && !newGameOpen && !spectating && (
        <OutcomeDialog outcome={game.outcome} onNewGame={() => setNewGameOpen('menu')} onClose={() => setOutcomeClosed(true)} />
      )}
    </div>
  );
}
