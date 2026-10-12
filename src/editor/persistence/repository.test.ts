import { describe, expect, it } from 'vitest';
import { createDocument } from '../../core/factory';
import type { FlowDocument } from '../../core/model';
import { createSampleDocument } from '../../core/sample';
import { browserRepository, loadInitialDocument, migrateBrowserFlows, setLastOpened, type FlowRepository } from './repository';
import { flowKey, MemoryStorage } from './storage';

/** テスト用: メモリ上の「ファイル保存」 */
function memoryFiles(): FlowRepository & { docs: Map<string, FlowDocument> } {
  const docs = new Map<string, FlowDocument>();
  return {
    kind: 'files',
    location: '/tmp/flows',
    docs,
    async list() {
      return [...docs.values()]
        .map(({ id, title, updatedAt, nodes }) => ({ id, title, updatedAt, nodeCount: nodes.length }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async load(id) {
      return docs.get(id) ?? null;
    },
    async save(doc) {
      docs.set(doc.id, doc);
    },
    async remove(id) {
      docs.delete(id);
    },
  };
}

describe('browserRepository', () => {
  it('保存したフローを更新が新しい順に並べ、壊れたデータは飛ばす。削除できる', async () => {
    const storage = new MemoryStorage();
    const repo = browserRepository(storage);
    const old = { ...createDocument('古い'), updatedAt: '2026-01-01T00:00:00.000Z' };
    const recent = { ...createSampleDocument(), updatedAt: '2026-10-01T00:00:00.000Z' };
    await repo.save(old);
    await repo.save(recent);
    await storage.set(flowKey('broken'), { nope: true });
    expect((await repo.list()).map((f) => f.title)).toEqual([recent.title, '古い']);
    expect((await repo.load(old.id))?.title).toBe('古い');
    await repo.remove(old.id);
    expect((await repo.list()).map((f) => f.title)).toEqual([recent.title]);
  });
});

describe('migrateBrowserFlows', () => {
  it('ブラウザ内のフローをファイルへ 1 回だけコピーし、ブラウザ側は消さない', async () => {
    const storage = new MemoryStorage();
    const browser = browserRepository(storage);
    const files = memoryFiles();
    const a = createDocument('A');
    const b = createDocument('B');
    await browser.save(a);
    await browser.save(b);
    await files.save(b); // 既にファイルにあるものはコピーしない
    expect(await migrateBrowserFlows(storage, files)).toBe(1);
    expect(files.docs.get(a.id)?.title).toBe('A');
    expect(await browser.load(a.id)).not.toBeNull();
    // 2 回目は何もしない（ファイル側で消したフローが復活しないように）
    await files.remove(a.id);
    expect(await migrateBrowserFlows(storage, files)).toBe(0);
    expect(files.docs.has(a.id)).toBe(false);
  });
});

describe('loadInitialDocument', () => {
  it('最後に開いたフロー → なければ更新が一番新しいフローを開く', async () => {
    const storage = new MemoryStorage();
    const files = memoryFiles();
    const old = { ...createDocument('古い'), updatedAt: '2026-01-01T00:00:00.000Z' };
    const recent = { ...createDocument('新しい'), updatedAt: '2026-10-01T00:00:00.000Z' };
    await files.save(old);
    await files.save(recent);
    expect((await loadInitialDocument(files, storage))?.title).toBe('新しい');
    await setLastOpened(storage, old.id);
    expect((await loadInitialDocument(files, storage))?.title).toBe('古い');
    expect(await loadInitialDocument(memoryFiles(), new MemoryStorage())).toBeNull();
  });
});
