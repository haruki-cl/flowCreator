import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { FlowDocument } from '../src/core/model.ts';
import { parseDocument } from '../src/core/schema.ts';
import { fileNameFor, FLOW_FILE_SUFFIX } from '../src/core/fileName.ts';

export { fileNameFor, FLOW_FILE_SUFFIX };

/**
 * フローを JSON ファイルとしてディレクトリに保存する、ローカル専用の小さな API。
 * Vite の開発サーバー・プレビューサーバーに組み込む（npm run dev で起動したときに使える）。
 *
 *   GET    /api/flows       一覧（保存先のパスと各フローの概要）
 *   GET    /api/flows/:id   1 件
 *   PUT    /api/flows/:id   保存（上書き）
 *   DELETE /api/flows/:id   削除
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export type StoredFlowSummary = { id: string; title: string; updatedAt: string; nodeCount: number; file: string };

export type FlowFileEntry = { file: string; doc: FlowDocument };
type Entry = FlowFileEntry;

/** ディレクトリ内の *.flow.json を読む（壊れたファイルや形式の違うファイルは飛ばす） */
export async function readFlows(dir: string): Promise<FlowFileEntry[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const entries: Entry[] = [];
  for (const file of names) {
    if (!file.endsWith(FLOW_FILE_SUFFIX)) continue;
    try {
      const parsed = parseDocument(JSON.parse(await readFile(path.join(dir, file), 'utf8')));
      if (parsed.ok) entries.push({ file, doc: parsed.doc });
    } catch {
      // 読めないファイルは無視する
    }
  }
  return entries;
}


function insideDir(root: string, file: string): string | null {
  const full = path.resolve(root, file);
  return full.startsWith(root + path.sep) ? full : null;
}

/**
 * フローを「フロー名__ID.flow.json」に書く。書きかけのファイルが残らないよう一時ファイルから置き換え、
 * 名前が変わった場合は古い名前のファイルを消す。書いたファイル名を返す
 */
export async function writeFlow(dir: string, doc: FlowDocument): Promise<string> {
  const root = path.resolve(dir);
  const file = fileNameFor(doc);
  const target = insideDir(root, file);
  if (!target) throw new Error(`invalid file name: ${file}`);
  const existing = (await readFlows(root)).filter((e) => e.doc.id === doc.id);
  await mkdir(root, { recursive: true });
  // 同時に保存されても一時ファイルの名前が衝突しないようにする
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  await rename(temp, target);
  for (const old of existing) {
    if (old.file === file) continue;
    const stale = insideDir(root, old.file);
    if (stale) await rm(stale, { force: true });
  }
  return file;
}

export async function removeFlow(dir: string, id: string): Promise<void> {
  const root = path.resolve(dir);
  for (const old of (await readFlows(root)).filter((e) => e.doc.id === id)) {
    const stale = insideDir(root, old.file);
    if (stale) await rm(stale, { force: true });
  }
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * ほかのサイトから localhost の API を叩かれないようにする。
 * Host がローカルでない（DNS リバインディング）か、Origin が自分以外（CSRF）なら拒否する。
 */
export function isTrustedRequest(req: IncomingMessage): boolean {
  const host = req.headers.host ?? '';
  const hostname = host.replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(hostname)) return false;
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return false;
  return true;
}

export function createFlowStoreHandler(dir: string) {
  const root = path.resolve(dir);

  return async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/flows' && !url.pathname.startsWith('/api/flows/')) {
      next();
      return;
    }
    if (!isTrustedRequest(req)) {
      send(res, 403, { error: 'forbidden' });
      return;
    }
    try {
      if (url.pathname === '/api/flows') {
        if (req.method !== 'GET') return send(res, 405);
        const entries = await readFlows(root);
        const flows: StoredFlowSummary[] = entries.map(({ file, doc }) => ({
          id: doc.id,
          title: doc.title,
          updatedAt: doc.updatedAt,
          nodeCount: doc.nodes.length,
          file,
        }));
        return send(res, 200, { location: root, flows });
      }

      const id = decodeURIComponent(url.pathname.slice('/api/flows/'.length));
      if (!ID_PATTERN.test(id)) return send(res, 400, { error: 'invalid id' });

      if (req.method === 'GET') {
        const found = (await readFlows(root)).find((e) => e.doc.id === id);
        return found ? send(res, 200, found.doc) : send(res, 404, { error: 'not found' });
      }

      if (req.method === 'PUT') {
        if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415);
        const parsed = parseDocument(JSON.parse(await readBody(req)));
        if (!parsed.ok) return send(res, 400, { error: parsed.error });
        if (parsed.doc.id !== id) return send(res, 400, { error: 'id mismatch' });
        await writeFlow(root, parsed.doc);
        return send(res, 204);
      }

      if (req.method === 'DELETE') {
        await removeFlow(root, id);
        return send(res, 204);
      }

      return send(res, 405);
    } catch (error) {
      console.error('[flowcreator] フローの保存処理に失敗しました', error);
      return send(res, 500, { error: 'failed' });
    }
  };
}

/**
 * 保存先: 環境変数 FLOWCREATOR_DATA_DIR（相対パスはプロジェクト直下から）。未指定ならプロジェクト直下の flows/。
 * FLOWCREATOR_STORAGE=browser のときは API を出さない（アプリはブラウザ内の保存に切り替わる）。
 */
export const FLOWS_CHANGED_EVENT = 'flowcreator:flows-changed';

/** 保存先のディレクトリ（環境変数 FLOWCREATOR_DATA_DIR、未指定ならプロジェクト直下の flows/） */
export function flowsDir(projectRoot: string): string {
  return path.resolve(projectRoot, process.env.FLOWCREATOR_DATA_DIR ?? 'flows');
}

export function flowStorePlugin(projectRoot: string): Plugin {
  const enabled = process.env.FLOWCREATOR_STORAGE !== 'browser';
  const dir = flowsDir(projectRoot);
  const handler = createFlowStoreHandler(dir);
  return {
    name: 'flowcreator-flow-store',
    configureServer(server) {
      if (!enabled) return;
      server.middlewares.use(handler);
      // AI やエディタ以外でファイルが書き換えられたら、開いている画面に知らせる（取り込みは画面側で判断する）
      void mkdir(dir, { recursive: true }).then(() => server.watcher.add(dir));
      server.watcher.on('all', (_event, file) => {
        if (path.dirname(path.resolve(file)) === dir && file.endsWith(FLOW_FILE_SUFFIX)) {
          server.ws.send(FLOWS_CHANGED_EVENT, { file: path.basename(file) });
        }
      });
    },
    configurePreviewServer(server) {
      if (enabled) server.middlewares.use(handler);
    },
  };
}
