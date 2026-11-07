import { useEffect, useRef, useState } from 'react';

const TICK_MS = 100;
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
        elapsed.current = 0;
        onTurnRef.current();
      }
      setProgress(Math.min(1, elapsed.current / intervalMs));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [intervalMs, running]);

  return progress;
}
