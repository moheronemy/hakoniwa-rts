import { it } from 'vitest';
import { DEFAULT_SETTINGS } from './game';
import { simulateGame, summarizeSims } from './simulate';

// Node の型定義を入れずに環境変数だけ読む
declare const process: { env: Record<string, string | undefined> };

/**
 * バランス調整用の自動対戦。`npm run sim` で実行する（通常のテストには含めない）。
 * SIM_GAMES で対戦数、SIM_SEED で最初のシードを変えられる。
 */
it('balance simulation', { timeout: 30 * 60 * 1000 }, () => {
  const games = Number(process.env.SIM_GAMES ?? 12);
  const first = Number(process.env.SIM_SEED ?? 1);
  const results = Array.from({ length: games }, (_, i) => simulateGame(first + i, DEFAULT_SETTINGS));
  for (const r of results) {
    const pops = r.pops.map((p) => `T${p.turn}:${Object.values(p.byController).map((v) => Math.round((v ?? 0) / 100)).join('/')}万`).join(' ');
    const lost = r.destroyed.map((d) => `T${d.turn}${d.controller}`).join(',');
    console.log(`seed${r.seed} ${r.result} T${r.turn} winner=${r.winner} destroyed=[${lost}] ${pops}`);
  }
  console.log(summarizeSims(results));
});
