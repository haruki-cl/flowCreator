import { describe, expect, it } from 'vitest';
import { createSampleDocument } from './sample.ts';
import { SCHEMA_VERSION } from './model.ts';
import { parseDocument, parseDocumentText } from './schema.ts';

describe('parseDocument', () => {
  it('正常なファイルを受け付ける', () => {
    const doc = createSampleDocument();
    const result = parseDocument(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(doc);
  });

  it('flowCreator 以外のファイルを拒否する', () => {
    expect(parseDocument({ hello: 1 })).toMatchObject({ ok: false });
    expect(parseDocument([])).toMatchObject({ ok: false });
  });

  it('新しいバージョンのファイルを拒否する', () => {
    const doc = { ...createSampleDocument(), schemaVersion: SCHEMA_VERSION + 1 };
    const result = parseDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('新しいバージョン');
  });

  it('未知の kind・必須項目の欠落・存在しないノードへのエッジを拒否する', () => {
    const base = createSampleDocument();
    expect(parseDocument({ ...base, nodes: [{ ...base.nodes[0], kind: 'loop' }] }).ok).toBe(false);
    const { title: _title, ...noTitle } = base.nodes[0];
    expect(parseDocument({ ...base, nodes: [noTitle] }).ok).toBe(false);
    expect(parseDocument({ ...base, edges: [{ id: 'x', source: 's', target: 'missing' }] }).ok).toBe(false);
    expect(parseDocument({ ...base, nodes: [base.nodes[0], base.nodes[0]], edges: [] }).ok).toBe(false);
  });

  it('v1（グループ導入前）のファイルは groups を空で補って読み込む', () => {
    const { groups: _groups, ...rest } = createSampleDocument();
    const v1 = { ...rest, schemaVersion: 1, nodes: rest.nodes.map(({ groupId: _g, ...n }) => n) };
    const result = parseDocument(v1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.doc.groups).toEqual([]);
    }
  });

  it('存在しないグループに属するノードを拒否する', () => {
    const base = createSampleDocument();
    expect(parseDocument({ ...base, groups: [] }).ok).toBe(false);
  });

  it('settings がなければ既定値を補う', () => {
    const { settings: _settings, ...rest } = createSampleDocument();
    const result = parseDocument(rest);
    expect(result.ok && result.doc.settings).toEqual({ direction: 'TB' });
  });

  it('JSON として壊れていればエラー', () => {
    expect(parseDocumentText('{')).toMatchObject({ ok: false });
  });
});
