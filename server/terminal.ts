import { randomBytes } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { spawn, type IPty } from 'node-pty';
import type { Plugin } from 'vite';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { isTrustedRequest } from './flowStore.ts';

/**
 * エディタの横に出すターミナル。開発サーバーが Claude Code（CLI）を擬似端末で起動し、ブラウザと WebSocket でつなぐ。
 *
 * 守り:
 * - 開発サーバー（npm run dev）でだけ動く。ビルドした成果物や閲覧用 HTML には含まれない
 * - 自分のマシン（localhost）からの接続だけを受け付ける（Host と Origin を確認）
 * - 起動ごとに作る合言葉（トークン）を要求する。トークンはエディタの HTML にだけ埋め込むので、
 *   ほかのサイトからは読めず、接続もできない
 */

export const TERMINAL_PATH = '/api/terminal';
export const TERMINAL_TOKEN_META = 'flowcreator-terminal-token';
/** 再接続したときに見せ直す出力の量 */
const SCROLLBACK_BYTES = 256 * 1024;

/**
 * 開発サーバーを Claude Code の中から起動したときに引き継がれる「親セッションの印」。
 * ターミナルの Claude Code は独立したセッションとして動かすので渡さない
 * （そのままだと会話の記録が保存されず、セッション間の通信用の合言葉まで渡ってしまう）。
 * 利用者が設定した CLAUDE_CODE_* の設定値（API の接続先など）はそのまま渡す
 */
export const PARENT_SESSION_ENV = [
  'CLAUDECODE',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_SESSION_ID',
];

export type ServerMessage =
  | { t: 'hello'; cwd: string }
  | { t: 'o'; d: string }
  | { t: 'exit'; code: number };

export type ClientMessage = { t: 'i'; d: string } | { t: 'r'; c: number; r: number } | { t: 'restart' };

export type TerminalOptions = {
  /** 起動するコマンド（シェル経由で実行するので、シェルの関数やエイリアスも使える） */
  command: string;
  cwd: string;
  shell: string;
};

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function parse(raw: RawData): ClientMessage | null {
  try {
    const value = JSON.parse(raw.toString()) as ClientMessage;
    if (value.t === 'i' && typeof value.d === 'string') return value;
    if (value.t === 'r' && Number.isInteger(value.c) && Number.isInteger(value.r) && value.c > 0 && value.r > 0) return value;
    if (value.t === 'restart') return value;
  } catch {
    // 形式の違うメッセージは無視する
  }
  return null;
}

/**
 * 1 つの擬似端末を、接続してきた画面で共有する。ページを開き直しても会話は続き、直近の出力を見せ直す。
 * 中のプログラムが終了したら、次に接続したとき（または「もう一度起動」）に起動し直す。
 */
export class TerminalSession {
  private pty: IPty | null = null;
  private scrollback = '';
  private readonly clients = new Set<WebSocket>();
  private size = { cols: 100, rows: 30 };
  private readonly options: TerminalOptions;

  constructor(options: TerminalOptions) {
    this.options = options;
  }

  attach(ws: WebSocket): void {
    this.clients.add(ws);
    send(ws, { t: 'hello', cwd: this.options.cwd });
    if (this.scrollback !== '') send(ws, { t: 'o', d: this.scrollback });
    if (!this.pty) this.start();
    let first = true;
    ws.on('message', (raw) => {
      const message = parse(raw);
      if (!message || (!this.pty && message.t !== 'restart')) return;
      if (message.t === 'i') this.pty?.write(message.d);
      if (message.t === 'r') {
        // 開き直した画面に描き直させるため、最初のサイズ通知では大きさが同じでも一度変える
        if (first && message.c === this.size.cols && message.r === this.size.rows) this.pty?.resize(Math.max(2, message.c - 1), message.r);
        first = false;
        this.size = { cols: message.c, rows: message.r };
        this.pty?.resize(message.c, message.r);
      }
      if (message.t === 'restart') this.restart();
    });
    ws.on('close', () => this.clients.delete(ws));
  }

  private broadcast(message: ServerMessage): void {
    for (const ws of this.clients) send(ws, message);
  }

  private start(): void {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
    // 開発サーバー（Vite）が設定する値や、親の Claude Code セッションの印は、中で起動するプログラムに持ち込まない
    delete env.NODE_ENV;
    for (const name of PARENT_SESSION_ENV) delete env[name];
    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';
    const { shell, command, cwd } = this.options;
    // zsh / bash はログイン＋対話シェルとして起動し、普段の設定（関数・エイリアス・PATH）をそのまま使う
    const args = /(?:^|\/)(?:zsh|bash)$/.test(shell) ? ['-ilc', command] : ['-c', command];
    try {
      this.pty = spawn(shell, args, { name: 'xterm-256color', cols: this.size.cols, rows: this.size.rows, cwd, env });
    } catch (error) {
      const hint = String(error).includes('posix_spawnp') ? '（npm install をやり直すと直ることがあります）' : '';
      this.broadcast({ t: 'o', d: `\r\nターミナルを起動できませんでした: ${String(error)}${hint}\r\n` });
      this.broadcast({ t: 'exit', code: -1 });
      return;
    }
    this.pty.onData((data) => {
      this.scrollback += data;
      if (this.scrollback.length > SCROLLBACK_BYTES) {
        // 途中の行から見せないよう、改行の直後から残す
        const cut = this.scrollback.length - SCROLLBACK_BYTES;
        const newline = this.scrollback.indexOf('\n', cut);
        this.scrollback = this.scrollback.slice(newline === -1 ? cut : newline + 1);
      }
      this.broadcast({ t: 'o', d: data });
    });
    this.pty.onExit(({ exitCode }) => {
      this.pty = null;
      this.broadcast({ t: 'exit', code: exitCode });
    });
  }

  restart(): void {
    this.dispose();
    this.scrollback = '';
    this.start();
  }

  dispose(): void {
    const pty = this.pty;
    this.pty = null;
    pty?.kill();
  }
}

/** HTTP サーバーに、ターミナル用の WebSocket の受け口を付ける（それ以外の接続は素通しする） */
export function attachTerminal(httpServer: Server, session: TerminalSession, token: string): () => void {
  const wss = new WebSocketServer({ noServer: true });
  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== TERMINAL_PATH) return; // Vite 自身の接続（HMR）などはそのまま
    if (!isTrustedRequest(req) || url.searchParams.get('token') !== token) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => session.attach(ws));
  };
  httpServer.on('upgrade', onUpgrade);
  return () => {
    httpServer.off('upgrade', onUpgrade);
    session.dispose();
    wss.close();
  };
}

/** ターミナルの Claude Code の既定（フローの編集には軽めの設定で十分なので） */
export const DEFAULT_CLAUDE_MODEL = 'sonnet';
export const DEFAULT_CLAUDE_EFFORT = 'medium';
/** シェルのコマンドに埋め込むので、モデル名・effort に使える文字を限る */
const SAFE_OPTION = /^[A-Za-z0-9._:[\]-]+$/;

/**
 * 起動するコマンド。FLOWCREATOR_CLAUDE_COMMAND があればそれをそのまま使い、
 * なければ claude にモデルと effort を付けて起動する（FLOWCREATOR_CLAUDE_MODEL / FLOWCREATOR_CLAUDE_EFFORT で変えられる）
 */
export function claudeCommand(env: NodeJS.ProcessEnv): string {
  if (env.FLOWCREATOR_CLAUDE_COMMAND) return env.FLOWCREATOR_CLAUDE_COMMAND;
  const option = (name: string, value: string | undefined, fallback: string) => {
    if (value === undefined || value === '') return fallback;
    if (SAFE_OPTION.test(value)) return value;
    console.warn(`[flowcreator] ${name} に使えない文字が含まれているため、既定値（${fallback}）を使います`);
    return fallback;
  };
  const model = option('FLOWCREATOR_CLAUDE_MODEL', env.FLOWCREATOR_CLAUDE_MODEL, DEFAULT_CLAUDE_MODEL);
  const effort = option('FLOWCREATOR_CLAUDE_EFFORT', env.FLOWCREATOR_CLAUDE_EFFORT, DEFAULT_CLAUDE_EFFORT);
  return `claude --model ${model} --effort ${effort}`;
}

/**
 * 設定（環境変数）:
 * - FLOWCREATOR_TERMINAL=off             ターミナルを使わない
 * - FLOWCREATOR_CLAUDE_MODEL             モデル（既定は sonnet）
 * - FLOWCREATOR_CLAUDE_EFFORT            effort（既定は medium）
 * - FLOWCREATOR_CLAUDE_COMMAND           起動するコマンドを丸ごと指定する（上の 2 つは使われない）
 * - FLOWCREATOR_TERMINAL_SHELL           起動に使うシェル（既定はログインシェル $SHELL）
 */
export function terminalPlugin(projectRoot: string): Plugin {
  const enabled = process.env.FLOWCREATOR_TERMINAL !== 'off';
  const token = randomBytes(24).toString('hex');
  return {
    name: 'flowcreator-terminal',
    apply: 'serve',
    configureServer(server) {
      if (!enabled || !server.httpServer) return;
      const session = new TerminalSession({
        command: claudeCommand(process.env),
        cwd: projectRoot,
        shell: process.env.FLOWCREATOR_TERMINAL_SHELL ?? process.env.SHELL ?? '/bin/zsh',
      });
      const detach = attachTerminal(server.httpServer as Server, session, token);
      server.httpServer.on('close', detach);
      process.once('exit', () => session.dispose());
    },
    transformIndexHtml() {
      if (!enabled) return [];
      // エディタの HTML にだけトークンを埋め込む（同じオリジンのページしか読めない）
      return [{ tag: 'meta', attrs: { name: TERMINAL_TOKEN_META, content: token }, injectTo: 'head' }];
    },
  };
}
