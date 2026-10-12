import { defineConfig } from '@playwright/test';

/** ファイル保存のテストで使う保存先（e2e/file-storage.spec.ts と共有） */
export const FILE_STORE_DIR = 'build/e2e-flows';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    // ローカルにインストール済みの Google Chrome を使う
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  },
  // サーバーは配列の順に 1 つずつ起動される（2 つ目は 1 つ目のビルド結果を使う）
  webServer: [
    {
      // 通常のテスト: ブラウザ内保存（テストごとにブラウザのデータが分かれるので、互いに干渉しない）。
      // 共有リンクは公開版ではなく、このサーバーを指すようにする
      command: 'VITE_PUBLIC_URL=http://localhost:4173/ npm run build && FLOWCREATOR_STORAGE=browser npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // ファイル保存・ターミナルのテスト: 一時フォルダに保存する開発サーバー（外部での変更の通知も開発サーバーでだけ届く）。
      // ターミナルでは本物の Claude Code の代わりに、テスト用の偽 CLI を起動する
      command: [
        `FLOWCREATOR_DATA_DIR=${FILE_STORE_DIR}`,
        `FLOWCREATOR_CLAUDE_COMMAND='node e2e/fixtures/fake-claude.mjs'`,
        'FLOWCREATOR_TERMINAL_SHELL=/bin/sh',
        'npx vite --port 4174 --strictPort',
      ].join(' '),
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
