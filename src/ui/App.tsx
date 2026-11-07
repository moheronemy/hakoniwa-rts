import { useCallback, useEffect, useRef, useState } from 'react';
import { clearQueue, enqueueCommand, moveCommand, newGame, playerIsland, removeCommand } from '../engine/game';
import { deserialize, serialize } from '../engine/save';
import { advanceTurn } from '../engine/turn';
import type { CommandKind, GameState } from '../engine/types';
import { MapCanvas } from './MapCanvas';
import { CommandMenu, INTERVAL_OPTIONS, LogPanel, QueuePanel, StatusBar } from './Panels';
import { AUTOSAVE_KEY, loadText, readPreference, saveText, writePreference } from './storage';
import { useTurnTimer } from './useTurnTimer';

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
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const fileInput = useRef<HTMLInputElement>(null);

  // 起動時：自動セーブがあれば続きから、なければ新しいゲーム
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
      setGame(newGame(randomSeed()));
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

  const progress = useTurnTimer(
    intervalMs,
    () => setGame((g) => (g ? advanceTurn(g) : g)),
    game !== null,
  );

  // 予約から命令が実行されて消えたら、その選択を外す
  useEffect(() => {
    if (game && selectedCommand !== null && !playerIsland(game).queue.some((c) => c.id === selectedCommand)) {
      setSelectedCommand(null);
    }
  }, [game, selectedCommand]);

  if (!game) {
    return <div className="loading">読み込み中…</div>;
  }

  const island = playerIsland(game);
  const insertBefore =
    selectedCommand === null ? null : island.queue.findIndex((c) => c.id === selectedCommand);
  const insertIndex = insertBefore !== null && insertBefore >= 0 ? insertBefore : null;

  const handleEnqueue = (kind: CommandKind, count: number) => {
    const target = selected ?? { x: 0, y: 0 };
    setGame((g) => (g ? enqueueCommand(g, kind, target.x, target.y, count, insertIndex ?? undefined) : g));
  };

  const handleNewGame = () => {
    if (!window.confirm('今のゲームを捨てて、新しいゲームを始めますか？')) return;
    setGame(newGame(randomSeed()));
    setSelected(null);
    setSelectedCommand(null);
    setNotice('新しいゲームを始めました');
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
      setSelected(null);
      setSelectedCommand(null);
      setNotice(`ターン${loaded.turn}のセーブデータを読み込みました`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '読み込みに失敗しました');
    }
  };

  const handleIntervalChange = (ms: number) => {
    setIntervalMs(ms);
    writePreference(INTERVAL_KEY, String(ms));
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>箱庭RTS（仮）</h1>
        <div className="header-actions">
          <button type="button" onClick={handleNewGame}>
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
      <main className="layout">
        <div className="map-wrap">
          <MapCanvas island={island} selected={selected} onSelect={(x, y) => setSelected({ x, y })} />
        </div>
        <div className="side">
          <CommandMenu island={island} selected={selected} insertBefore={insertIndex} onEnqueue={handleEnqueue} />
          <QueuePanel
            island={island}
            selectedId={selectedCommand}
            onSelect={setSelectedCommand}
            onMove={(id, delta) => setGame((g) => (g ? moveCommand(g, id, delta) : g))}
            onRemove={(id) => setGame((g) => (g ? removeCommand(g, id) : g))}
            onClear={() => setGame((g) => (g ? clearQueue(g) : g))}
          />
        </div>
      </main>
      <LogPanel log={game.log} />
    </div>
  );
}
