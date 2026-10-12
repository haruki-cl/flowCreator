import type { FlowDocument } from '../../core/model';
import { parseDocument } from '../../core/schema';
import { FLOW_KEY_PREFIX, flowKey, LAST_OPENED_KEY, type StorageAdapter } from './storage';

/** 保存したフローの一覧に出す情報 */
export type FlowSummary = { id: string; title: string; updatedAt: string; nodeCount: number };

/** フローの保存先。ファイル（flows/ ディレクトリ）か、ブラウザ内（IndexedDB）のどちらか */
export interface FlowRepository {
  readonly kind: 'files' | 'browser';
  /** 画面に出す保存先（ディレクトリの絶対パスなど） */
  readonly location: string;
  list(): Promise<FlowSummary[]>;
  load(id: string): Promise<FlowDocument | null>;
  save(doc: FlowDocument): Promise<void>;
  remove(id: string): Promise<void>;
}

const byUpdatedDesc = (a: FlowSummary, b: FlowSummary) => b.updatedAt.localeCompare(a.updatedAt);

/** ブラウザ内（IndexedDB）に保存する。ファイル保存の API が使えないとき（静的に配信したときなど）に使う */
export function browserRepository(storage: StorageAdapter): FlowRepository {
  return {
    kind: 'browser',
    location: 'このブラウザの中',
    async list() {
      const keys = (await storage.keys()).filter((key) => key.startsWith(FLOW_KEY_PREFIX));
      const summaries: FlowSummary[] = [];
      for (const raw of await Promise.all(keys.map((key) => storage.get(key)))) {
        const parsed = parseDocument(raw);
        if (!parsed.ok) continue;
        const { id, title, updatedAt, nodes } = parsed.doc;
        summaries.push({ id, title, updatedAt, nodeCount: nodes.length });
      }
      return summaries.sort(byUpdatedDesc);
    },
    async load(id) {
      const parsed = parseDocument(await storage.get(flowKey(id)));
      return parsed.ok ? parsed.doc : null;
    },
    async save(doc) {
      await storage.set(flowKey(doc.id), doc);
    },
    async remove(id) {
      await storage.del(flowKey(id));
    },
  };
}

async function request(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok && res.status !== 404) throw new Error(`${init?.method ?? 'GET'} ${input} → ${res.status}`);
  return res;
}

/** 開発サーバーの API 経由で、ディレクトリに JSON ファイルとして保存する（server/flowStore.ts） */
export function fileRepository(location: string, base = ''): FlowRepository {
  const url = (id?: string) => `${base}/api/flows${id === undefined ? '' : `/${encodeURIComponent(id)}`}`;
  return {
    kind: 'files',
    location,
    async list() {
      const body = (await (await request(url())).json()) as { flows: FlowSummary[] };
      return body.flows.map(({ id, title, updatedAt, nodeCount }) => ({ id, title, updatedAt, nodeCount })).sort(byUpdatedDesc);
    },
    async load(id) {
      const res = await request(url(id));
      if (res.status === 404) return null;
      const parsed = parseDocument(await res.json());
      return parsed.ok ? parsed.doc : null;
    },
    async save(doc) {
      await request(url(doc.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
    },
    async remove(id) {
      await request(url(id), { method: 'DELETE' });
    },
  };
}

/**
 * GitHub Pages など、静的に配信する版（VITE_STATIC_SITE=1 でビルド）。
 * フォルダへの保存はできないので、ファイル保存の API を探しに行かず、最初からブラウザ内に保存する
 */
export const STATIC_SITE = import.meta.env.VITE_STATIC_SITE === '1';

/** ファイル保存の API があればそれを、なければブラウザ内の保存を使う */
export async function detectRepository(storage: StorageAdapter, base = ''): Promise<FlowRepository> {
  if (STATIC_SITE) return browserRepository(storage);
  try {
    const res = await fetch(`${base}/api/flows`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const body = (await res.json()) as { location?: unknown; flows?: unknown };
      if (typeof body.location === 'string' && Array.isArray(body.flows)) return fileRepository(body.location, base);
    }
  } catch {
    // API がない（静的に配信している等）
  }
  return browserRepository(storage);
}

// 最後に開いたフローは、保存先に関係なくブラウザ側に覚えておく（画面の状態なので）
export async function getLastOpened(storage: StorageAdapter): Promise<string | null> {
  const id = await storage.get(LAST_OPENED_KEY);
  return typeof id === 'string' ? id : null;
}

export async function setLastOpened(storage: StorageAdapter, id: string): Promise<void> {
  await storage.set(LAST_OPENED_KEY, id);
}

const MIGRATED_KEY = 'meta:migratedToFiles';

/**
 * ファイル保存に切り替わったとき、それまでブラウザ内に保存していたフローをファイルへコピーする（1 回だけ）。
 * ブラウザ内のデータは消さない。コピーした件数を返す。
 */
export async function migrateBrowserFlows(storage: StorageAdapter, files: FlowRepository): Promise<number> {
  if ((await storage.get(MIGRATED_KEY)) === true) return 0;
  const browser = browserRepository(storage);
  const existing = new Set((await files.list()).map((f) => f.id));
  let copied = 0;
  for (const summary of await browser.list()) {
    if (existing.has(summary.id)) continue;
    const doc = await browser.load(summary.id);
    if (!doc) continue;
    await files.save(doc);
    copied++;
  }
  await storage.set(MIGRATED_KEY, true);
  return copied;
}

/** 起動時に開くフロー: 最後に開いたもの → なければ更新が一番新しいもの */
export async function loadInitialDocument(repo: FlowRepository, storage: StorageAdapter): Promise<FlowDocument | null> {
  const last = await getLastOpened(storage);
  const doc = last ? await repo.load(last) : null;
  if (doc) return doc;
  const [latest] = await repo.list();
  return latest ? repo.load(latest.id) : null;
}
