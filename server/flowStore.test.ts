import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSampleDocument } from '../src/core/sample.ts';
import { createFlowStoreHandler, fileNameFor } from './flowStore.ts';

let dir: string;
let server: Server;
let base: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'flowcreator-'));
  const handler = createFlowStoreHandler(dir);
  server = createServer((req, res) => void handler(req, res, () => {
    res.statusCode = 404;
    res.end('next');
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  base = `http://localhost:${address.port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

const put = (id: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/flows/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('flow store API', () => {
  it('保存すると「フロー名__ID.flow.json」ができ、一覧と 1 件取得で読める', async () => {
    const doc = createSampleDocument();
    expect((await put(doc.id, doc)).status).toBe(204);
    expect(await readdir(dir)).toEqual([fileNameFor(doc)]);
    expect(JSON.parse(await readFile(path.join(dir, fileNameFor(doc)), 'utf8'))).toEqual(doc);

    const list = await (await fetch(`${base}/api/flows`)).json();
    expect(list.location).toBe(path.resolve(dir));
    expect(list.flows).toEqual([
      { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, nodeCount: doc.nodes.length, file: fileNameFor(doc) },
    ]);
    expect(await (await fetch(`${base}/api/flows/${doc.id}`)).json()).toEqual(doc);
  });

  it('名前を変えて保存すると、古い名前のファイルは消える', async () => {
    const doc = createSampleDocument();
    await put(doc.id, doc);
    await put(doc.id, { ...doc, title: '新しい名前' });
    expect(await readdir(dir)).toEqual([fileNameFor({ id: doc.id, title: '新しい名前' })]);
  });

  it('削除できる。存在しないフローは 404', async () => {
    const doc = createSampleDocument();
    await put(doc.id, doc);
    expect((await fetch(`${base}/api/flows/${doc.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await readdir(dir)).toEqual([]);
    expect((await fetch(`${base}/api/flows/${doc.id}`)).status).toBe(404);
  });

  it('不正な内容・ID の食い違い・不正な ID・JSON 以外は受け付けない', async () => {
    const doc = createSampleDocument();
    expect((await put(doc.id, { hello: 1 })).status).toBe(400);
    expect((await put('other-id', doc)).status).toBe(400);
    expect((await put('..%2F..%2Fetc', doc)).status).toBe(400);
    const text = await fetch(`${base}/api/flows/${doc.id}`, { method: 'PUT', body: JSON.stringify(doc), headers: { 'Content-Type': 'text/plain' } });
    expect(text.status).toBe(415);
    expect(await readdir(dir)).toEqual([]);
  });

  it('ほかのサイトからのリクエスト（Origin が違う・Host がローカルでない）は拒否する', async () => {
    const doc = createSampleDocument();
    expect((await put(doc.id, doc, { Origin: 'https://evil.example' })).status).toBe(403);
    // fetch は Host ヘッダーを書き換えられないので http.request で送る（DNS リバインディングの再現）
    const port = Number(new URL(base).port);
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/api/flows', headers: { Host: `evil.example:${port}` } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
    expect(await readdir(dir)).toEqual([]);
  });

  it('フォルダに置いた壊れたファイルや別形式のファイルは一覧に出さない', async () => {
    await writeFile(path.join(dir, 'broken.flow.json'), '{', 'utf8');
    await writeFile(path.join(dir, 'other.flow.json'), '{"hello":1}', 'utf8');
    const list = await (await fetch(`${base}/api/flows`)).json();
    expect(list.flows).toEqual([]);
  });

  it('API 以外のパスは次の処理へ回す', async () => {
    const res = await fetch(`${base}/index.html`);
    expect(await res.text()).toBe('next');
  });
});

describe('同時保存', () => {
  it('同じフローを同時に何度保存しても失敗しない', async () => {
    const doc = createSampleDocument();
    const results = await Promise.all(Array.from({ length: 8 }, () => put(doc.id, doc)));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(204));
    expect(await readdir(dir)).toEqual([fileNameFor(doc)]);
  });
});
