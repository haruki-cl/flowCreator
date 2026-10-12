import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowDocument } from '../../core/model';
import { createSampleDocument } from '../../core/sample';
import { useDoc } from '../store/docStore';
import { AUTOSAVE_DEBOUNCE_MS, startAutosave, type SaveStatus } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
  useDoc.getState().loadDocument(createSampleDocument());
});
afterEach(() => vi.useRealTimers());

function recorder() {
  const saved: FlowDocument[] = [];
  return { saved, persist: async (doc: FlowDocument) => void saved.push(doc) };
}

describe('startAutosave', () => {
  it('変更をまとめて 1 回だけ保存し、内容が同じなら書かない', async () => {
    const { saved, persist } = recorder();
    const statuses: SaveStatus[] = [];
    const autosave = startAutosave(useDoc, persist, (s) => statuses.push(s));

    useDoc.getState().updateNodeData('p1', { title: 'A' });
    useDoc.getState().updateNodeData('p1', { title: 'AB' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 10);
    expect(saved).toHaveLength(1);
    expect(saved[0].nodes.find((n) => n.id === 'p1')?.title).toBe('AB');
    expect(statuses).toEqual(['saving', 'saved']);

    // 選択の変更だけでは保存しない
    useDoc.getState().selectOnly({ kind: 'node', id: 'p1' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 10);
    expect(saved).toHaveLength(1);
    autosave.stop();
  });

  it('flush で待たずに保存し、isDirty で未保存の変更がわかる', async () => {
    const { saved, persist } = recorder();
    const autosave = startAutosave(useDoc, persist, () => {});
    expect(autosave.isDirty()).toBe(false);
    useDoc.getState().renameFlow('すぐ保存');
    expect(autosave.isDirty()).toBe(true);
    await autosave.flush();
    expect(saved.at(-1)?.title).toBe('すぐ保存');
    expect(autosave.isDirty()).toBe(false);
    autosave.stop();
  });

  it('保存済みのフローを開いただけでは保存し直さない（markSaved）', async () => {
    const { saved, persist } = recorder();
    const autosave = startAutosave(useDoc, persist, () => {});
    useDoc.getState().loadDocument(createSampleDocument());
    autosave.markSaved();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 10);
    expect(saved).toHaveLength(0);
    useDoc.getState().renameFlow('編集した');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 10);
    expect(saved).toHaveLength(1);
    autosave.stop();
  });

  it('保存に失敗したら error を通知する', async () => {
    const statuses: SaveStatus[] = [];
    const autosave = startAutosave(useDoc, async () => {
      throw new Error('disk full');
    }, (s) => statuses.push(s));
    useDoc.getState().renameFlow('失敗');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 10);
    expect(statuses).toEqual(['saving', 'error']);
    autosave.stop();
  });
});

describe('contentKeyOf', () => {
  it('キーの順番が違っても、中身が同じなら同じとみなす（自分の保存を外部の変更と取り違えない）', async () => {
    const { contentKeyOf } = await import('./autosave');
    const { parseDocument } = await import('../../core/schema');
    const { toDocument, fromDocument } = await import('../../core/serialize');
    const doc = createSampleDocument();
    const { meta, nodes, edges, groups } = fromDocument(doc);
    const fromEditor = toDocument(meta, nodes, edges, groups);
    const parsed = parseDocument(JSON.parse(JSON.stringify(doc)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(JSON.stringify(parsed.doc)).not.toBe(JSON.stringify(fromEditor)); // キーの順番は実際に違う
    expect(contentKeyOf(parsed.doc)).toBe(contentKeyOf(fromEditor));
    expect(contentKeyOf({ ...parsed.doc, title: '別' })).not.toBe(contentKeyOf(fromEditor));
  });
});
