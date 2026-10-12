import { describe, expect, it } from 'vitest';
import { createSampleDocument } from './sample.ts';
import { cleanDetails, fromDocument, toDocument } from './serialize.ts';

describe('serialize', () => {
  it('toDocument(fromDocument(doc)) で元に戻る', () => {
    const doc = createSampleDocument(new Date('2026-01-01T00:00:00Z'));
    const { meta, nodes, edges, groups } = fromDocument(doc);
    expect(toDocument(meta, nodes, edges, groups)).toEqual(doc);
  });

  it('React Flow 固有のフィールドと空の項目を落とす', () => {
    const doc = createSampleDocument();
    const { meta, nodes, edges, groups } = fromDocument(doc);
    const dirtyNodes = nodes.map((n) => ({
      ...n,
      selected: true,
      dragging: false,
      measured: { width: 176, height: 44 },
      position: { x: n.position.x + 0.4, y: n.position.y },
      data: { ...n.data, summary: n.data.summary ?? '   ', details: { notes: '', ...n.data.details } },
    }));
    const dirtyEdges = edges.map((e) => ({ ...e, selected: true, data: { ...e.data, detail: e.data?.detail ?? '' } }));
    const out = toDocument(meta, dirtyNodes, dirtyEdges, groups);
    expect(out).toEqual(toDocument(meta, nodes, edges, groups));
    expect(JSON.stringify(out)).not.toMatch(/selected|measured|dragging/);
  });

  it('グループの空の要約・説明は落とす', () => {
    const doc = createSampleDocument();
    const { meta, nodes, edges } = fromDocument(doc);
    const out = toDocument(meta, nodes, edges, [{ id: 'g-apply', title: '申請', summary: ' ', description: '' }]);
    expect(out.groups).toEqual([{ id: 'g-apply', title: '申請' }]);
  });

  it('cleanDetails は中身がなければ undefined', () => {
    expect(cleanDetails({ owner: '', links: [{ label: '', url: '' }] })).toBeUndefined();
    expect(cleanDetails({ owner: '経理', notes: ' ' })).toEqual({ owner: '経理' });
  });
});
