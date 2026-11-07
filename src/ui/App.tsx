import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMMANDS } from '../engine/commands';
import {
  autoPrepareTargets,
  clearQueue,
  enqueueAutoPrepare,
  enqueueBreed,
  enqueueCommand,
  enqueueMissile,
  enqueueSendMonster,
  moveCommand,
  newGame,
  playerIsland,
  removeCommand,
  setResearch,
} from '../engine/game';
import { visibleTile } from '../engine/island';
import { deserialize, serialize } from '../engine/save';
import { advanceTurn } from '../engine/turn';
import type { CommandKind, GameSettings, GameState, MissileKind, MonsterId } from '../engine/types';
import { MapCanvas, type MapMarker } from './MapCanvas';
import { CommandMenu, INTERVAL_OPTIONS, LogPanel, QueuePanel, StatusBar, TechPanel } from './Panels';
import { AUTOSAVE_KEY, loadText, readPreference, saveText, writePreference } from './storage';
import { useTurnTimer } from './useTurnTimer';
import {
  BreedPanel,
  IslandTabs,
  MissileMenu,
  NewGameDialog,
  OutcomeDialog,
  RankingPanel,
  SendMonsterPanel,
} from './WarPanels';

const INTERVAL_KEY = 'turnIntervalMs';

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

function initialInterval(): number {
  const saved = Number(readPreference(INTERVAL_KEY));
  return (INTERVAL_OPTIONS as readonly number[]).includes(saved) ? saved : 5000;
}

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [intervalMs, setIntervalMs] = useState(initialInterval);
  const [viewId, setViewId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 新しいゲームの設定画面。'first' は起動時（やめられない） */
  const [newGameOpen, setNewGameOpen] = useState<false | 'first' | 'menu'>(false);
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

  const save = useCallback(() => {
    const current = gameRef.current;
    if (current) void saveText(AUTOSAVE_KEY, serialize(current));
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

  const running = game !== null && game.outcome === null && newGameOpen === false;
  const progress = useTurnTimer(intervalMs, () => setGame((g) => (g ? advanceTurn(g) : g)), running);

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
  }, [island, viewed, viewingOwn]);

  if (!game || !island || !viewed) {
    return (
      <div className="loading">
        {newGameOpen ? <NewGameDialog onStart={(s) => startGame(s)} onCancel={null} /> : '読み込み中…'}
      </div>
    );
  }

  const insertBefore =
    selectedCommand === null ? null : island.queue.findIndex((c) => c.id === selectedCommand);
  const insertIndex = insertBefore !== null && insertBefore >= 0 ? insertBefore : null;
  const islandNames = Object.fromEntries(game.islands.map((i) => [i.id, i.name]));

  function startGame(settings: GameSettings) {
    setGame(newGame(randomSeed(), settings));
    setViewId(null);
    setSelected(null);
    setSelectedCommand(null);
    setOutcomeClosed(false);
    setNewGameOpen(false);
    setNotice('新しいゲームを始めました');
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
    setIntervalMs(ms);
    writePreference(INTERVAL_KEY, String(ms));
  };

  const handleView = (id: string) => {
    setViewId(id);
    setSelected(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>箱庭RTS（仮）</h1>
        <div className="header-actions">
          <button type="button" onClick={() => setNewGameOpen('menu')}>
            新しいゲーム
          </button>
          <button type="button" onClick={handleExport}>
            セーブを書き出す
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            読み込む
          </button>
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
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="閉じる">
            ×
          </button>
        </div>
      )}
      <StatusBar
        island={island}
        turn={game.turn}
        progress={progress}
        intervalMs={intervalMs}
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
            display={viewingOwn ? undefined : visibleTile}
            dimmed={viewed.destroyed}
          />
        </div>
        <div className="side">
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
          <QueuePanel
            island={island}
            islandNames={islandNames}
            selectedId={selectedCommand}
            onSelect={setSelectedCommand}
            onMove={(id, delta) => setGame((g) => (g ? moveCommand(g, id, delta) : g))}
            onRemove={(id) => setGame((g) => (g ? removeCommand(g, id) : g))}
            onClear={() => setGame((g) => (g ? clearQueue(g) : g))}
          />
        </div>
      </main>
      <RankingPanel game={game} />
      <TechPanel island={island} onSelect={(id) => setGame((g) => (g ? setResearch(g, id) : g))} />
      <LogPanel log={game.log} />
      {newGameOpen && (
        <NewGameDialog onStart={startGame} onCancel={newGameOpen === 'menu' ? () => setNewGameOpen(false) : null} />
      )}
      {game.outcome && !outcomeClosed && !newGameOpen && (
        <OutcomeDialog outcome={game.outcome} onNewGame={() => setNewGameOpen('menu')} onClose={() => setOutcomeClosed(true)} />
      )}
    </div>
  );
}
