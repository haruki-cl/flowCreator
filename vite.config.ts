import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { flowStorePlugin } from './server/flowStore.ts';
import { terminalPlugin } from './server/terminal.ts';

export default defineConfig({
  // flowStorePlugin: フローを flows/ に JSON ファイルとして保存する API（npm run dev / preview で有効）
  // terminalPlugin: エディタの横に Claude Code（CLI）を出すターミナル（npm run dev でだけ有効）
  plugins: [react(), flowStorePlugin(import.meta.dirname), terminalPlugin(import.meta.dirname)],
  server: {
    // ポートが変わると URL が変わり、ブラウザ側の設定（最後に開いたフロー等）が別扱いになるので固定する
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    // React Flow と zod を含むエディタ本体は 500kB を少し超える（閲覧用テンプレートは別チャンクで遅延読み込み）
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
