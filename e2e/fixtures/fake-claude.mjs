// E2E 用の「Claude Code の代わり」。`edit <フローのファイル>` と打つと、そのフローの p1 の見出しを書き換える
import { readFileSync, writeFileSync } from 'node:fs';
import readline from 'node:readline';

process.stdout.write('fake-claude ready\r\n> ');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl.on('line', (line) => {
  const match = line.match(/^edit\s+@?"?([^"]+?)"?\s*$/);
  if (match) {
    const file = match[1];
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    doc.nodes = doc.nodes.map((n) => (n.id === 'p1' ? { ...n, title: 'AI が書いた見出し' } : n));
    doc.updatedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify(doc, null, 2));
    process.stdout.write('edited\r\n> ');
  } else {
    process.stdout.write(`you said: ${line}\r\n> `);
  }
});
