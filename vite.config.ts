/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Node の型定義を入れずに環境変数だけ読む
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパス（/hakoniwa-rts/）に置かれるので、相対パスで出力する
  base: './',
  plugins: [react()],
  test: {
    // npm run sim のときだけ、バランス調整用の自動対戦（*.sim.ts）を実行する
    include: process.env.SIM ? ['src/**/*.sim.ts'] : ['src/**/*.test.ts'],
  },
});
