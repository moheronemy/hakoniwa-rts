import { useEffect, useRef, useState } from 'react';

/** タイマーの刻み。短い間隔（観戦モードの0.1秒など）でも遅れないよう、間隔の半分以下にする */
function tickFor(intervalMs: number): number {
  return Math.max(16, Math.min(100, Math.floor(intervalMs / 2)));
}

/** タブが裏に回って間引かれたあとなどに、一度に進めすぎないための上限 */
const MAX_STEP_MS = 250;

/**
 * 一定間隔ごとに onTurn を呼ぶタイマー。
 * タブが裏に回っている間（document.hidden）は止まり、次のターンまでの残り時間を保つ。
 * 戻り値は次のターンまでの進み具合（0〜1）。
 */
export function useTurnTimer(intervalMs: number, onTurn: () => void, running: boolean): number {
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
  const onTurnRef = useRef(onTurn);
  onTurnRef.current = onTurn;

  useEffect(() => {
    if (!running) return undefined;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min(now - last, MAX_STEP_MS);
      last = now;
      if (document.hidden) return;
      elapsed.current += delta;
      if (elapsed.current >= intervalMs) {
        // 端数を次のターンに繰り越す（短い間隔でもターンの数がずれないように）
        elapsed.current = Math.min(elapsed.current - intervalMs, intervalMs);
        onTurnRef.current();
      }
      setProgress(Math.min(1, elapsed.current / intervalMs));
    }, tickFor(intervalMs));
    return () => window.clearInterval(id);
  }, [intervalMs, running]);

  return progress;
}
