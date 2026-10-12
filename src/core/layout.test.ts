import { describe, expect, it } from 'vitest';
import { rectsOverlap } from './geometry.ts';
import { computeFrames } from './groups.ts';
import { dagreLayout, type LayoutInput } from './layout.ts';

const input: LayoutInput = {
  direction: 'TB',
  nodes: [
    { id: 'start', width: 176, height: 44 },
    { id: 'a', width: 176, height: 60 },
    { id: 'd', width: 200, height: 100 },
    { id: 'b', width: 176, height: 44 },
    { id: 'c', width: 176, height: 84 },
    { id: 'end', width: 176, height: 44 },
  ],
  edges: [
    { source: 'start', target: 'a' },
    { source: 'a', target: 'd' },
    { source: 'd', target: 'b' },
    { source: 'd', target: 'c' },
    { source: 'b', target: 'end' },
    { source: 'c', target: 'end' },
    { source: 'c', target: 'a' }, // 循環
  ],
};

describe('dagreLayout', () => {
  const result = dagreLayout.layout(input);

  it('同じ入力から同じ結果になる', () => {
    expect(dagreLayout.layout(input)).toEqual(result);
  });

  it('ノード同士が重ならない', () => {
    const rects = input.nodes.map((n) => ({ ...result[n.id], width: n.width, height: n.height }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsOverlap(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it('上から下へ順に並ぶ', () => {
    expect(result.start.y).toBeLessThan(result.a.y);
    expect(result.a.y).toBeLessThan(result.d.y);
    expect(result.d.y).toBeLessThan(result.b.y);
    expect(result.b.y).toBeLessThan(result.end.y);
  });
});

describe('dagreLayout（グループあり）', () => {
  const grouped: LayoutInput = {
    direction: 'TB',
    nodes: [
      { id: 's', width: 176, height: 44, groupId: 'G1' },
      { id: 'p1', width: 176, height: 44, groupId: 'G1' },
      { id: 'd', width: 200, height: 96, groupId: 'G2' },
      { id: 'p2', width: 176, height: 44, groupId: 'G2' },
      { id: 'p3', width: 176, height: 44, groupId: 'G2' },
      { id: 'p4', width: 176, height: 44 },
      { id: 'e', width: 176, height: 44, groupId: 'G3' },
    ],
    edges: [
      { source: 's', target: 'p1' },
      { source: 'p1', target: 'd' },
      { source: 'd', target: 'p2' },
      { source: 'd', target: 'p3' },
      { source: 'p2', target: 'p3' },
      { source: 'p3', target: 'p4' },
      { source: 'p4', target: 'e' },
    ],
  };
  const result = dagreLayout.layout(grouped);
  const members = grouped.nodes.map((n) => ({
    id: n.id,
    groupId: n.groupId,
    rect: { ...result[n.id], width: n.width, height: n.height },
  }));
  const frames = computeFrames([{ id: 'G1' }, { id: 'G2' }, { id: 'G3' }], members);

  it('枠どうし、枠とほかのノードが重ならない', () => {
    const entries = [...frames.entries()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        expect(rectsOverlap(entries[i][1], entries[j][1]), `${entries[i][0]} と ${entries[j][0]}`).toBe(false);
      }
      for (const m of members) {
        if (m.groupId === entries[i][0]) continue;
        expect(rectsOverlap(entries[i][1], m.rect), `${entries[i][0]} と ${m.id}`).toBe(false);
      }
    }
  });
});
