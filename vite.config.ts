/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパス（/hakoniwa-rts/）に置かれるので、相対パスで出力する
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
