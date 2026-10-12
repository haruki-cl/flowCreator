import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../core/factory';
import { createSampleDocument } from '../../core/sample';
import { COALESCE_MS, useDoc } from './docStore';

const state = () => useDoc.getState();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-12T00:00:00Z'));
  state().loadDocument(createDocument());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('addFromSelection', () => {
  it('選択ノードの下に追加し、つないで、新しいノードを選択する', () => {
    const a = state().addNode('process', { x: 0, y: 0 }, { title: 'A' });
    const b = state().addFromSelection('next')!;
    expect(b).toBeTruthy();
    const nodeB = state().nodes.find((n) => n.id === b)!;
    expect(nodeB.position.y).toBeGreaterThan(0);
    expect(nodeB.selected).toBe(true);
    expect(state().nodes.find((n) => n.id === a)!.selected).toBe(false);
    expect(state().edges).toHaveLength(1);
    expect(state().edges[0]).toMatchObject({ source: a, target: b });
  });

  it('選択が 1 つでなければ何もしない', () => {
    state().addNode('process', { x: 0, y: 0 });
    state().selectOnly(null);
    expect(state().addFromSelection('next')).toBeNull();
  });

  it('分岐からは Enter で Yes、Tab で No、使い切ったら空', () => {
    state().addNode('decision', { x: 0, y: 0 }, { title: 'D' });
    const d = state().nodes[0].id;
    state().addFromSelection('branch');
    state().selectOnly({ kind: 'node', id: d });
    state().addFromSelection('next');
    state().selectOnly({ kind: 'node', id: d });
    state().addFromSelection('next');
    expect(state().edges.map((e) => e.data?.label)).toEqual(['No', 'Yes', undefined]);
  });
});

describe('connect', () => {
  it('分岐から線を引くと Yes → No の順にラベルが付く。自己ループと重複は作らない', () => {
    const d = state().addNode('decision', { x: 0, y: 0 });
    const x = state().addNode('process', { x: 0, y: 200 });
    const y = state().addNode('process', { x: 300, y: 200 });
    expect(state().connect(d, x)).toBeTruthy();
    expect(state().connect(d, y)).toBeTruthy();
    expect(state().connect(d, y)).toBeNull();
    expect(state().connect(x, x)).toBeNull();
    expect(state().edges.map((e) => e.data?.label)).toEqual(['Yes', 'No']);
  });
});

describe('removeElements', () => {
  it('ノードを消すと、つながっている線も消える', () => {
    state().loadDocument(createSampleDocument());
    state().removeElements({ nodes: ['d1'] });
    expect(state().nodes.find((n) => n.id === 'd1')).toBeUndefined();
    expect(state().edges.some((e) => e.source === 'd1' || e.target === 'd1')).toBe(false);
    state().undo();
    expect(state().nodes.find((n) => n.id === 'd1')).toBeDefined();
    expect(state().edges).toHaveLength(7);
  });
});

describe('history', () => {
  it('同じ項目への連続入力は 1 件にまとまり、間が空くと別になる', () => {
    const id = state().addNode('process', { x: 0, y: 0 });
    const base = state().past.length;
    state().updateNodeData(id, { summary: 'a' });
    vi.advanceTimersByTime(300);
    state().updateNodeData(id, { summary: 'ab' });
    vi.advanceTimersByTime(300);
    state().updateNodeData(id, { summary: 'abc' });
    expect(state().past.length).toBe(base + 1);
    vi.advanceTimersByTime(COALESCE_MS + 1);
    state().updateNodeData(id, { summary: 'abcd' });
    expect(state().past.length).toBe(base + 2);
    state().undo();
    expect(state().nodes[0].data.summary).toBe('abc');
    state().undo();
    expect(state().nodes[0].data.summary).toBeUndefined();
  });

  it('ドラッグ 1 回は履歴 1 件', () => {
    const id = state().addNode('process', { x: 0, y: 0 });
    const base = state().past.length;
    for (let i = 1; i <= 5; i++) {
      state().onNodesChange([{ type: 'position', id, position: { x: i * 10, y: 0 }, dragging: true }]);
    }
    state().onNodesChange([{ type: 'position', id, position: { x: 50, y: 0 }, dragging: false }]);
    expect(state().past.length).toBe(base + 1);
    state().undo();
    expect(state().nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('undo → redo → 新しい操作で future が消える', () => {
    state().addNode('process', { x: 0, y: 0 });
    state().addNode('process', { x: 0, y: 100 });
    state().undo();
    expect(state().nodes).toHaveLength(1);
    state().redo();
    expect(state().nodes).toHaveLength(2);
    state().undo();
    state().addNode('end', { x: 0, y: 200 });
    expect(state().future).toHaveLength(0);
    expect(state().redo()).toBe(false);
  });

  it('復元したノードは選択状態を持ち越さない', () => {
    state().addNode('process', { x: 0, y: 0 });
    state().addNode('process', { x: 0, y: 100 });
    state().undo();
    expect(state().nodes.every((n) => !n.selected)).toBe(true);
  });
});

describe('applyLayout', () => {
  it('整列は Undo で元の位置に戻せる', () => {
    state().loadDocument(createSampleDocument());
    const before = state().nodes.map((n) => n.position);
    state().applyLayout();
    expect(state().nodes.map((n) => n.position)).not.toEqual(before);
    state().undo();
    expect(state().nodes.map((n) => n.position)).toEqual(before);
  });
});

describe('groups', () => {
  const groupOf = (id: string) => state().nodes.find((n) => n.id === id)!.data.groupId;

  it('createGroup でまとめ、ungroup で枠だけ消える（ノードは残る）', () => {
    const a = state().addNode('process', { x: 0, y: 0 });
    const b = state().addNode('process', { x: 0, y: 100 });
    const g = state().createGroup([a, b])!;
    expect(state().groups.map((x) => x.id)).toEqual([g]);
    expect([groupOf(a), groupOf(b)]).toEqual([g, g]);
    state().ungroup(g);
    expect(state().groups).toEqual([]);
    expect(state().nodes).toHaveLength(2);
    expect(groupOf(a)).toBeUndefined();
    state().undo();
    expect(groupOf(a)).toBe(g);
  });

  it('別グループへ移してメンバーがいなくなったグループは消える', () => {
    const a = state().addNode('process', { x: 0, y: 0 });
    const g1 = state().createGroup([a])!;
    const g2 = state().createGroup([a])!;
    expect(state().groups.map((x) => x.id)).toEqual([g2]);
    expect(g1).not.toBe(g2);
  });

  it('メンバーを全部消すとグループも消える', () => {
    const a = state().addNode('process', { x: 0, y: 0 });
    state().createGroup([a]);
    state().removeElements({ nodes: [a] });
    expect(state().groups).toEqual([]);
  });

  it('Enter で追加したノードは元のノードと同じグループに入る', () => {
    const a = state().addNode('process', { x: 0, y: 0 });
    const g = state().createGroup([a])!;
    state().selectOnly({ kind: 'node', id: a });
    const b = state().addFromSelection('next')!;
    expect(groupOf(b)).toBe(g);
  });

  it('ドラッグで枠の外へ出しても外れず、枠の外のノードを枠の中へ入れると入る', () => {
    const a = state().addNode('process', { x: 0, y: 0 });
    const b = state().addNode('process', { x: 0, y: 100 });
    const free = state().addNode('process', { x: 600, y: 600 });
    const g = state().createGroup([a, b])!;
    const drag = (id: string, x: number, y: number) => {
      state().onNodesChange([{ type: 'position', id, position: { x, y }, dragging: true }]);
      state().onNodesChange([{ type: 'position', id, position: { x, y }, dragging: false }]);
    };
    drag(b, 600, 300);
    expect(groupOf(b)).toBe(g);
    drag(free, 300, 150);
    expect(groupOf(free)).toBe(g);
    // 1 回のドラッグは 1 回の Undo で戻る（所属も戻る）
    state().undo();
    expect(groupOf(free)).toBeUndefined();
    expect(state().nodes.find((n) => n.id === free)!.position).toEqual({ x: 600, y: 600 });
  });

  it('moveGroupBy でメンバー全員が動き、groupAtPoint は枠の中の点で判定する', () => {
    const a = state().addNode('process', { x: 0, y: 0 });
    const g = state().createGroup([a])!;
    expect(state().groupAtPoint({ x: 50, y: 20 })).toBe(g);
    state().moveGroupBy(g, 100, 50);
    expect(state().nodes[0].position).toEqual({ x: 100, y: 50 });
    expect(state().groupAtPoint({ x: 50, y: 20 })).toBeUndefined();
  });
});

describe('重なりの回避', () => {
  const rect = (id: string) => {
    const n = state().nodes.find((x) => x.id === id)!;
    return { ...n.position, width: 176, height: 44 };
  };
  const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it('ほかのノードの上に落とすと近くの空いた位置へずれ、Undo 1 回でドラッグ前に戻る', () => {
    const a = state().addNode('process', { x: 0, y: 0 });
    const b = state().addNode('process', { x: 0, y: 300 });
    state().onNodesChange([{ type: 'position', id: b, position: { x: 10, y: 20 }, dragging: true }]);
    state().onNodesChange([{ type: 'position', id: b, position: { x: 10, y: 20 }, dragging: false }]);
    expect(overlaps(rect(a), rect(b))).toBe(false);
    expect(Math.hypot(rect(b).x - 10, rect(b).y - 20)).toBeLessThan(80);
    state().undo();
    expect(state().nodes.find((n) => n.id === b)!.position).toEqual({ x: 0, y: 300 });
  });

  it('既存ノードの上に新しいノードを置いてもずれる', () => {
    const a = state().addNode('process', { x: 0, y: 0 });
    const b = state().addNode('process', { x: 20, y: 10 });
    expect(overlaps(rect(a), rect(b))).toBe(false);
  });

  it('枠ごと動かしてほかのノードに重なったら、メンバーをまとめてずらす', () => {
    const a = state().addNode('process', { x: 0, y: 0 });
    const b = state().addNode('process', { x: 0, y: 100 });
    const other = state().addNode('process', { x: 400, y: 120 });
    const g = state().createGroup([a, b])!;
    state().moveGroupBy(g, 400, 0);
    state().settleGroup(g);
    expect(overlaps(rect(a), rect(other))).toBe(false);
    expect(overlaps(rect(b), rect(other))).toBe(false);
    expect(rect(b).y - rect(a).y).toBe(100); // メンバー同士の位置関係は保つ
  });
});

describe('applyExternal', () => {
  it('外部の変更を取り込み、計測済みの大きさを引き継ぐ。Undo で取り込む前に戻る', () => {
    state().loadDocument(createSampleDocument());
    state().onNodesChange([{ type: 'dimensions', id: 'p1', dimensions: { width: 176, height: 44 } }]);
    const doc = createSampleDocument();
    const changed = { ...doc, id: state().meta.id, nodes: doc.nodes.map((n) => (n.id === 'p1' ? { ...n, title: 'AI が変更' } : n)) };
    state().applyExternal(changed);
    const p1 = state().nodes.find((n) => n.id === 'p1')!;
    expect(p1.data.title).toBe('AI が変更');
    expect(p1.measured).toEqual({ width: 176, height: 44 });
    state().undo();
    expect(state().nodes.find((n) => n.id === 'p1')!.data.title).toBe('経費申請を提出');
  });
});
