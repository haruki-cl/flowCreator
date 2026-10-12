// node-pty の配布物（prebuilds）は、インストール時に spawn-helper の実行権限が落ちることがある（macOS で
// 「posix_spawnp failed」になる）。npm install のあとに権限を付け直す
import { chmodSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
if (existsSync(dir)) {
  for (const platform of readdirSync(dir)) {
    const helper = path.join(dir, platform, 'spawn-helper');
    if (existsSync(helper)) chmodSync(helper, 0o755);
  }
}
