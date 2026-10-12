import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { attachTerminal, TerminalSession, TERMINAL_PATH, type ServerMessage } from './terminal.ts';

const TOKEN = 'test-token';
let server: Server;
let port: number;
let detach: () => void;

beforeEach(async () => {
  server = createServer((_req, res) => res.end());
  // テストでは本物の Claude Code の代わりに cat（入力をそのまま返す）を起動する
  const session = new TerminalSession({ command: 'cat', cwd: process.cwd(), shell: '/bin/sh' });
  detach = attachTerminal(server, session, TOKEN);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});

afterEach(async () => {
  detach();
  await new Promise((resolve) => server.close(resolve));
});

function connect(query: string, origin = `http://localhost:${port}`) {
  const ws = new WebSocket(`ws://localhost:${port}${TERMINAL_PATH}${query}`, { origin });
  const messages: ServerMessage[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  const output = () => messages.filter((m) => m.t === 'o').map((m) => (m as { d: string }).d).join('');
  return { ws, messages, output };
}

const opened = (ws: WebSocket) => new Promise<void>((resolve, reject) => {
  ws.once('open', () => resolve());
  ws.once('error', reject);
});

async function until(check: () => boolean, timeout = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('terminal', () => {
  it('トークンが正しい接続だけを受け付け、入力が中のプログラムに届いて出力が返る', async () => {
    const { ws, messages, output } = connect(`?token=${TOKEN}`);
    await opened(ws);
    await until(() => messages.some((m) => m.t === 'hello'));
    ws.send(JSON.stringify({ t: 'r', c: 80, r: 24 }));
    ws.send(JSON.stringify({ t: 'i', d: 'hello-pty\r' }));
    await until(() => output().includes('hello-pty'));
    ws.close();
  });

  it('開き直すと、直前の出力を見せ直す（会話は続いている）', async () => {
    const first = connect(`?token=${TOKEN}`);
    await opened(first.ws);
    first.ws.send(JSON.stringify({ t: 'i', d: 'remember-me\r' }));
    await until(() => first.output().includes('remember-me'));
    first.ws.close();
    const second = connect(`?token=${TOKEN}`);
    await opened(second.ws);
    await until(() => second.output().includes('remember-me'));
    second.ws.close();
  });

  it('トークンなし・違うトークン・ほかのサイトからの接続は拒否する', async () => {
    for (const [query, origin] of [
      ['', undefined],
      ['?token=wrong', undefined],
      [`?token=${TOKEN}`, 'https://evil.example'],
    ] as const) {
      const { ws } = connect(query, origin);
      await expect(opened(ws)).rejects.toThrow(/403/);
    }
  });
});

describe('terminal の環境変数', () => {
  it('親の Claude Code セッションの印は渡さず、それ以外の設定は渡す（値は表示せず名前だけ確かめる）', async () => {
    const saved = { ...process.env };
    process.env.CLAUDECODE = '1';
    process.env.CLAUDE_CODE_MESSAGING_TOKEN = 'secret';
    process.env.FLOWCREATOR_TEST_SETTING = 'keep';
    const httpServer = createServer((_req, res) => res.end());
    const session = new TerminalSession({ command: 'env | cut -d= -f1; sleep 5', cwd: process.cwd(), shell: '/bin/sh' });
    const stop = attachTerminal(httpServer, session, TOKEN);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const p = (httpServer.address() as { port: number }).port;
    const ws = new WebSocket(`ws://localhost:${p}${TERMINAL_PATH}?token=${TOKEN}`, { origin: `http://localhost:${p}` });
    let out = '';
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()) as ServerMessage;
      if (m.t === 'o') out += m.d;
    });
    try {
      await until(() => out.includes('FLOWCREATOR_TEST_SETTING'));
      const names = out.split(/\r?\n/).map((l) => l.trim());
      expect(names).not.toContain('CLAUDECODE');
      expect(names).not.toContain('CLAUDE_CODE_MESSAGING_TOKEN');
      expect(names).not.toContain('NODE_ENV');
    } finally {
      ws.close();
      stop();
      await new Promise((resolve) => httpServer.close(resolve));
      process.env = saved;
    }
  });
});

describe('claudeCommand', () => {
  it('既定は Sonnet・effort medium で起動し、環境変数で変えられる', async () => {
    const { claudeCommand } = await import('./terminal.ts');
    expect(claudeCommand({})).toBe('claude --model sonnet --effort medium');
    expect(claudeCommand({ FLOWCREATOR_CLAUDE_MODEL: 'opus', FLOWCREATOR_CLAUDE_EFFORT: 'high' })).toBe('claude --model opus --effort high');
    expect(claudeCommand({ FLOWCREATOR_CLAUDE_COMMAND: 'node fake.mjs', FLOWCREATOR_CLAUDE_MODEL: 'opus' })).toBe('node fake.mjs');
  });

  it('シェルに解釈される文字を含む値は使わない', async () => {
    const { claudeCommand } = await import('./terminal.ts');
    expect(claudeCommand({ FLOWCREATOR_CLAUDE_MODEL: 'sonnet; rm -rf ~' })).toBe('claude --model sonnet --effort medium');
    expect(claudeCommand({ FLOWCREATOR_CLAUDE_EFFORT: '$(whoami)' })).toBe('claude --model sonnet --effort medium');
  });
});
