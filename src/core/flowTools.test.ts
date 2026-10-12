import { describe, expect, it } from 'vitest';
import { createDocument } from './factory.ts';
import { layoutDocument, lintDocument, outlineDocument } from './flowTools.ts';
import { computeFrames } from './groups.ts';
import { rectsOverlap } from './geometry.ts';
import { createSampleDocument } from './sample.ts';
import { estimateSize } from './flowTools.ts';

describe('layoutDocument', () => {
  it('重なっていた座標を、重ならない位置に並べ直す（グループの枠も重ならない）', () => {
    const doc = createSampleDocument();
    const piled = { ...doc, nodes: doc.nodes.map((n) => ({ ...n, position: { x: 0, y: 0 } })) };
    expect(lintDocument(piled).some((w) => w.includes('重なっています'))).toBe(true);
    const laid = layoutDocument(piled);
    expect(lintDocument(laid).filter((w) => w.includes('重なっています'))).toEqual([]);
    const members = laid.nodes.map((n) => ({ id: n.id, groupId: n.groupId, rect: { ...n.position, ...estimateSize(n) } }));
    const frames = [...computeFrames(laid.groups, members).values()];
    for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) expect(rectsOverlap(frames[i], frames[j])).toBe(false);
  });
});

describe('lintDocument', () => {
  it('サンプルには警告がない', () => {
    expect(lintDocument(createSampleDocument())).toEqual([]);
  });

  it('長すぎる見出し・つながっていないノード・メンバーのいないグループを指摘する', () => {
    const doc = createDocument('t');
    doc.nodes = [
      { id: 'a', kind: 'process', title: 'とても長い見出しをノードに直接書いてしまった例です', position: { x: 0, y: 0 } },
      { id: 'b', kind: 'process', title: 'B', position: { x: 0, y: 200 } },
    ];
    doc.groups = [{ id: 'g', title: '空' }];
    const warnings = lintDocument(doc);
    expect(warnings.some((w) => w.includes('見出しが長すぎます'))).toBe(true);
    expect(warnings.some((w) => w.includes('どの線ともつながっていません'))).toBe(true);
    expect(warnings.some((w) => w.includes('メンバーがいません'))).toBe(true);
  });
});

describe('outlineDocument', () => {
  it('ノード・線・グループを 1 行ずつ書き出す', () => {
    const text = outlineDocument(createSampleDocument());
    expect(text).toContain('d1  [分岐] 金額は5万円以上？');
    expect(text).toContain('e3  d1 → p2  「Yes」');
    expect(text).toContain('g-approve「承認」');
  });
});
