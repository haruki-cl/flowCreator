import { describe, expect, it } from 'vitest';
import { computeFrames, FRAME_PAD, frameRectOf, groupAt, pruneGroups, reassignAfterDrag, type MemberInfo } from './groups.ts';

const rect = (x: number, y: number) => ({ x, y, width: 100, height: 40 });

const members: MemberInfo[] = [
  { id: 'a1', groupId: 'A', rect: rect(0, 0) },
  { id: 'a2', groupId: 'A', rect: rect(0, 100) },
  { id: 'b1', groupId: 'B', rect: rect(400, 0) },
  { id: 'free', rect: rect(200, 400) },
];
const groups = [{ id: 'A' }, { id: 'B' }, { id: 'empty' }];

describe('frameRectOf', () => {
  it('メンバーの外接矩形に余白を足す（上は名前の分だけ広い）', () => {
    expect(frameRectOf([rect(0, 0), rect(0, 100)])).toEqual({
      x: -FRAME_PAD.side,
      y: -FRAME_PAD.top,
      width: 100 + FRAME_PAD.side * 2,
      height: 140 + FRAME_PAD.top + FRAME_PAD.bottom,
    });
    expect(frameRectOf([])).toBeNull();
  });
});

describe('computeFrames', () => {
  it('メンバーのいないグループには枠を作らない', () => {
    const frames = computeFrames(groups, members);
    expect([...frames.keys()]).toEqual(['A', 'B']);
  });
  it('ドラッグ中のメンバーは除いて計算する。全員ドラッグ中なら全員で計算する', () => {
    const withoutA2 = computeFrames(groups, members, new Set(['a2']));
    expect(withoutA2.get('A')!.height).toBe(40 + FRAME_PAD.top + FRAME_PAD.bottom);
    const wholeA = computeFrames(groups, members, new Set(['a1', 'a2']));
    expect(wholeA.get('A')!.height).toBe(140 + FRAME_PAD.top + FRAME_PAD.bottom);
  });
});

describe('groupAt', () => {
  it('点を含む枠を返す。重なっていれば小さい枠、prefer が含めば prefer', () => {
    const frames = new Map([
      ['big', { x: 0, y: 0, width: 500, height: 500 }],
      ['small', { x: 100, y: 100, width: 100, height: 100 }],
    ]);
    expect(groupAt({ x: 150, y: 150 }, frames)).toBe('small');
    expect(groupAt({ x: 150, y: 150 }, frames, 'big')).toBe('big');
    expect(groupAt({ x: 400, y: 400 }, frames)).toBe('big');
    expect(groupAt({ x: 900, y: 900 }, frames)).toBeUndefined();
  });
});

describe('reassignAfterDrag', () => {
  it('枠のノードは、枠の外へ出しても外れない（端のノードを少し動かした場合も含む）', () => {
    const far = members.map((m) => (m.id === 'a2' ? { ...m, rect: rect(600, 600) } : m));
    expect(reassignAfterDrag(groups, far, new Set(['a2'])).size).toBe(0);
    // a2 は枠の下端を決めているノード。少し下げると、a2 を除いた枠の外に中心が出るが外れない
    const nudged = members.map((m) => (m.id === 'a2' ? { ...m, rect: rect(-30, 140) } : m));
    expect(reassignAfterDrag(groups, nudged, new Set(['a2'])).size).toBe(0);
  });

  it('枠に入っていないノードを枠の中へ入れたら入り、別グループの枠へ入れたら移る', () => {
    const intoB = members.map((m) => (m.id === 'free' ? { ...m, rect: rect(400, 10) } : m));
    expect(reassignAfterDrag(groups, intoB, new Set(['free']))).toEqual(new Map([['free', 'B']]));
    const a2ToB = members.map((m) => (m.id === 'a2' ? { ...m, rect: rect(400, 10) } : m));
    expect(reassignAfterDrag(groups, a2ToB, new Set(['a2']))).toEqual(new Map([['a2', 'B']]));
  });

  it('枠の中で動かしただけなら変わらない', () => {
    const moved = members.map((m) => (m.id === 'a2' ? { ...m, rect: rect(10, 20) } : m));
    expect(reassignAfterDrag(groups, moved, new Set(['a2'])).size).toBe(0);
  });

  it('メンバー全員を一緒に動かしたら所属は変えず、ほかのノードもその枠には入らない', () => {
    // A を右へ 900 動かし、free は動いた A の枠の中に落とす
    const moved = members.map((m) =>
      m.groupId === 'A' ? { ...m, rect: rect(m.rect.x + 900, m.rect.y) } : m.id === 'free' ? { ...m, rect: rect(900, 50) } : m,
    );
    const ids = new Set(['a1', 'a2', 'free']);
    expect(reassignAfterDrag(groups, moved, ids).size).toBe(0);
  });
});

describe('pruneGroups', () => {
  it('メンバーのいないグループを落とす', () => {
    expect(pruneGroups(groups, members).map((g) => g.id)).toEqual(['A', 'B']);
    const all = [{ id: 'A' }];
    expect(pruneGroups(all, members)).toBe(all);
  });
});
