import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 閲覧用 HTML のテンプレート（JS/CSS をすべてインライン化した 1 ファイル）を作る。
// エディタは書き出し時にこのファイルを読み込み、フローの JSON を埋め込む。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'build/viewer-template',
    emptyOutDir: true,
    rollupOptions: {
      input: 'viewer.html',
    },
  },
});
