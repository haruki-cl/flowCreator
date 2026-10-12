import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { createDocument, createEdge, createGroup, createNode } from '../../core/factory';
import type {
  AppEdge,
  AppNode,
  DocMeta,
  FlowDocument,
  FlowEdgeData,
  FlowGroup,
  FlowNodeData,
  NodeKind,
} from '../../core/model';
import { fromDocument, toAppEdge, toAppNode } from '../../core/serialize';
import { nextDecisionLabel, NO_LABEL, YES_LABEL } from '../../core/edgeLabels';
import { placeNewNode, resolveOverlap, type PlacementMode } from '../../core/placement';
import { dagreLayout, DEFAULT_NODE_SIZE, type LayoutEngine } from '../../core/layout';
import type { Rect } from '../../core/geometry';
import { computeFrames, groupAt, pruneGroups, reassignAfterDrag, type MemberInfo } from '../../core/groups';
import { estimateSize } from '../../core/flowTools';
import { useUi } from '../../shared/ui/uiStore';

export const HISTORY_LIMIT = 100;
/** 同じキーの操作がこの時間内に続いたら 1 件の履歴にまとめる */
export const COALESCE_MS = 1000;

export { DEFAULT_NODE_SIZE };

type Snapshot = { nodes: AppNode[]; edges: AppEdge[]; groups: FlowGroup[] };

export type DocState = {
  meta: DocMeta;
  nodes: AppNode[];
  edges: AppEdge[];
  groups: FlowGroup[];
  past: Snapshot[];
  future: Snapshot[];
  /** 直前の checkpoint のキーと時刻（連続入力をまとめるため） */
  lastKey: string | null;
  lastAt: number;
  /** ドラッグ中に 1 回だけ checkpoint を取るためのフラグ */
  dragging: boolean;

  onNodesChange: (changes: NodeChange<AppNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<AppEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  connect: (source: string, target: string) => string | null;
  addNode: (kind: NodeKind, position: { x: number; y: number }, options?: { title?: string; groupId?: string }) => string;
  addFromSelection: (mode: PlacementMode) => string | null;
  addConnectedNode: (sourceId: string, position: { x: number; y: number }, groupId?: string) => string;
  updateNodeData: (id: string, patch: Partial<FlowNodeData>, historyKey?: string) => void;
  updateEdgeData: (id: string, patch: Partial<FlowEdgeData>, historyKey?: string) => void;
  setKind: (id: string, kind: NodeKind) => void;
  /** 選んだノードを新しいグループ（枠）にまとめる。ほかのグループに属していたノードは移る */
  createGroup: (nodeIds: string[]) => string | null;
  /** 枠だけを消す（ノードは残す） */
  ungroup: (groupId: string) => void;
  removeFromGroup: (nodeIds: string[]) => void;
  updateGroup: (id: string, patch: Partial<Omit<FlowGroup, 'id'>>, historyKey?: string) => void;
  /** 枠ごと動かす（呼び出し側がドラッグ開始時に checkpoint を取る） */
  moveGroupBy: (groupId: string, dx: number, dy: number) => void;
  /** 枠のドラッグを終えたとき、メンバーがほかのノードと重なっていたらまとめてずらす */
  settleGroup: (groupId: string) => void;
  /** 点を含む枠のグループ（ノードを置く位置からの所属判定） */
  groupAtPoint: (point: { x: number; y: number }) => string | undefined;
  removeElements: (ids: { nodes?: string[]; edges?: string[] }) => void;
  applyLayout: (estimateExtraHeight?: (node: AppNode) => number, engine?: LayoutEngine) => void;
  selectOnly: (target: { kind: 'node' | 'edge'; id: string } | null) => void;
  renameFlow: (title: string) => void;
  /** 文書を丸ごと差し替える（履歴もリセット） */
  loadDocument: (doc: FlowDocument) => void;
  /** AI など外部でファイルが書き換えられたとき、その内容を取り込む（⌘Z で取り込む前に戻せる） */
  applyExternal: (doc: FlowDocument) => void;
  checkpoint: (key?: string) => void;
  undo: () => boolean;
  redo: () => boolean;
};

function initialState(doc: FlowDocument) {
  const { meta, nodes, edges, groups } = fromDocument(doc);
  return {
    meta,
    nodes,
    edges,
    groups,
    past: [] as Snapshot[],
    future: [] as Snapshot[],
    lastKey: null,
    lastAt: 0,
    dragging: false,
  };
}

/**
 * 通常表示（L1）で測ったノードの大きさ。保存している位置は通常表示の大きさが前提なので、
 * 重なり回避・追加位置・グループの判定は、拡大して背が伸びている間もこの大きさで計算する
 */
const baseSizes = new Map<string, { width: number; height: number }>();

function recordBaseSizes(changes: NodeChange<AppNode>[]): void {
  const level = useUi.getState().zoomLevel;
  for (const c of changes) {
    if (c.type !== 'dimensions' || !c.dimensions) continue;
    // 俯瞰（L0）の大きさは、通常表示の大きさがまだ分からないときだけ代わりに使う
    if (level === 1 || (level === 0 && !baseSizes.has(c.id))) baseSizes.set(c.id, { ...c.dimensions });
  }
}

function sizeOf(node: AppNode): { width: number; height: number } {
  const base = baseSizes.get(node.id);
  if (base) return base;
  // 拡大中に作ったノードなど、通常表示の大きさをまだ測っていないときは見出しから見積もる
  if (useUi.getState().zoomLevel === 2) return estimateSize(node.data);
  const fallback = DEFAULT_NODE_SIZE[node.data.kind];
  return { width: node.measured?.width ?? fallback.width, height: node.measured?.height ?? fallback.height };
}

function rectOf(node: AppNode): Rect {
  return { ...node.position, ...sizeOf(node) };
}

export function membersOf(nodes: AppNode[]): MemberInfo[] {
  return nodes.map((n) => ({ id: n.id, groupId: n.data.groupId, rect: rectOf(n) }));
}

function setGroupId(node: AppNode, groupId: string | undefined): AppNode {
  if (node.data.groupId === groupId) return node;
  const { groupId: _old, ...data } = node.data;
  return { ...node, data: groupId === undefined ? data : { ...data, groupId } };
}

/** ノードの所属が変わったあとに、メンバーのいなくなったグループを消す */
function withPrunedGroups(nodes: AppNode[], groups: FlowGroup[]): { nodes: AppNode[]; groups: FlowGroup[] } {
  return { nodes, groups: pruneGroups(groups, nodes.map((n) => ({ groupId: n.data.groupId }))) };
}

/** ids のノードがほかのノードと重なっていたら、重ならない一番近い位置へひとかたまりでずらす */
function withoutOverlap(nodes: AppNode[], ids: ReadonlySet<string>): AppNode[] {
  const { dx, dy } = resolveOverlap(
    nodes.filter((n) => ids.has(n.id)).map(rectOf),
    nodes.filter((n) => !ids.has(n.id)).map(rectOf),
  );
  if (dx === 0 && dy === 0) return nodes;
  return nodes.map((n) => (ids.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n));
}

/** 履歴から復元するときは選択状態を持ち越さない */
function normalize(snapshot: Snapshot): Snapshot {
  return {
    nodes: snapshot.nodes.map((n) => (n.selected || n.dragging ? { ...n, selected: false, dragging: false } : n)),
    edges: snapshot.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    groups: snapshot.groups,
  };
}

function labelForNewEdge(state: DocState, source: string): string | undefined {
  const sourceNode = state.nodes.find((n) => n.id === source);
  if (sourceNode?.data.kind !== 'decision') return undefined;
  const existing = state.edges.filter((e) => e.source === source).map((e) => e.data?.label);
  const label = nextDecisionLabel(existing);
  return label === '' ? undefined : label;
}

function deselectAll<T extends { selected?: boolean }>(items: T[]): T[] {
  return items.map((item) => (item.selected ? { ...item, selected: false } : item));
}

export const useDoc = create<DocState>()((set, get) => ({
  ...initialState(createDocument()),

  checkpoint: (key) => {
    const state = get();
    const now = Date.now();
    if (key !== undefined && key === state.lastKey && now - state.lastAt < COALESCE_MS) {
      set({ lastAt: now });
      return;
    }
    const past = [...state.past, { nodes: state.nodes, edges: state.edges, groups: state.groups }];
    if (past.length > HISTORY_LIMIT) past.shift();
    set({ past, future: [], lastKey: key ?? null, lastAt: now });
  },

  undo: () => {
    const { past, future, nodes, edges, groups } = get();
    const previous = past[past.length - 1];
    if (!previous) return false;
    set({ ...normalize(previous), past: past.slice(0, -1), future: [...future, { nodes, edges, groups }], lastKey: null });
    return true;
  },

  redo: () => {
    const { past, future, nodes, edges, groups } = get();
    const next = future[future.length - 1];
    if (!next) return false;
    set({ ...normalize(next), past: [...past, { nodes, edges, groups }], future: future.slice(0, -1), lastKey: null });
    return true;
  },

  onNodesChange: (changes) => {
    const state = get();
    const positionChanges = changes.filter((c) => c.type === 'position');
    let dragEnded = false;
    if (positionChanges.length > 0) {
      const isDragging = positionChanges.some((c) => c.type === 'position' && c.dragging);
      if (isDragging && !state.dragging) {
        get().checkpoint();
        set({ dragging: true });
      } else if (!isDragging && state.dragging) {
        set({ dragging: false });
        dragEnded = true;
      } else if (!isDragging && !state.dragging && positionChanges.some((c) => c.type === 'position' && c.position)) {
        // 矢印キーでの移動。連続入力は 1 件にまとめる
        get().checkpoint('keymove');
      }
    }
    recordBaseSizes(changes);
    let nodes = applyNodeChanges(changes, get().nodes);
    let groups = get().groups;
    if (dragEnded) {
      const moved = new Set(positionChanges.map((c) => c.id));
      // 所属は離した位置（ユーザーの意図）で決める
      const reassigned = reassignAfterDrag(groups, membersOf(nodes), moved);
      if (reassigned.size > 0) {
        nodes = nodes.map((n) => (reassigned.has(n.id) ? setGroupId(n, reassigned.get(n.id)) : n));
        ({ nodes, groups } = withPrunedGroups(nodes, groups));
      }
      // ほかのノードの上に落としていたら近くの空いている位置へずらす（ドラッグと同じ Undo 1 回分）
      nodes = withoutOverlap(nodes, moved);
    }
    if (changes.some((c) => c.type === 'remove')) ({ nodes, groups } = withPrunedGroups(nodes, groups));
    set({ nodes, groups });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    get().connect(connection.source, connection.target);
  },

  connect: (source, target) => {
    const state = get();
    if (source === target) return null;
    if (state.edges.some((e) => e.source === source && e.target === target)) return null;
    state.checkpoint();
    const edge = toAppEdge(createEdge(source, target, labelForNewEdge(state, source)));
    set({ edges: addEdge(edge, get().edges) });
    return edge.id;
  },

  addNode: (kind, position, options) => {
    get().checkpoint();
    const node = setGroupId({ ...toAppNode(createNode(kind, position, options?.title)), selected: true }, options?.groupId);
    set({ nodes: withoutOverlap([...deselectAll(get().nodes), node], new Set([node.id])), edges: deselectAll(get().edges) });
    return node.id;
  },

  addConnectedNode: (sourceId, position, groupId) => {
    const state = get();
    state.checkpoint();
    const label = labelForNewEdge(state, sourceId);
    const node = setGroupId({ ...toAppNode(createNode('process', position)), selected: true }, groupId);
    const edge = toAppEdge(createEdge(sourceId, node.id, label));
    set({
      nodes: withoutOverlap([...deselectAll(state.nodes), node], new Set([node.id])),
      edges: [...deselectAll(state.edges), edge],
    });
    return node.id;
  },

  addFromSelection: (mode) => {
    const state = get();
    const selected = state.nodes.filter((n) => n.selected);
    if (selected.length !== 1) return null;
    const from = selected[0];
    const kind: NodeKind = 'process';
    const size = DEFAULT_NODE_SIZE[kind];
    const position = placeNewNode(rectOf(from), size, mode, state.nodes.map(rectOf));
    let label: string | undefined;
    if (from.data.kind === 'decision') {
      const used = new Set(state.edges.filter((e) => e.source === from.id).map((e) => e.data?.label?.trim()));
      const preferred = mode === 'next' ? YES_LABEL : NO_LABEL;
      label = used.has(preferred) ? labelForNewEdge(state, from.id) : preferred;
    }
    state.checkpoint();
    // Enter / Tab で続けて書くときは、元のノードと同じグループに入れる（枠が広がる）
    const node = setGroupId({ ...toAppNode(createNode(kind, position)), selected: true }, from.data.groupId);
    const edge = toAppEdge(createEdge(from.id, node.id, label));
    set({ nodes: [...deselectAll(state.nodes), node], edges: [...deselectAll(state.edges), edge] });
    return node.id;
  },

  updateNodeData: (id, patch, historyKey) => {
    get().checkpoint(historyKey ?? `node:${id}:${Object.keys(patch).join(',')}`);
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) });
  },

  updateEdgeData: (id, patch, historyKey) => {
    get().checkpoint(historyKey ?? `edge:${id}:${Object.keys(patch).join(',')}`);
    set({ edges: get().edges.map((e) => (e.id === id ? { ...e, data: { ...e.data, ...patch } } : e)) });
  },

  setKind: (id, kind) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node || node.data.kind === kind) return;
    get().checkpoint();
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, kind } } : n)) });
  },

  createGroup: (nodeIds) => {
    const ids = new Set(nodeIds);
    const state = get();
    if (!state.nodes.some((n) => ids.has(n.id))) return null;
    state.checkpoint();
    const group = createGroup();
    const nodes = state.nodes.map((n) => (ids.has(n.id) ? setGroupId(n, group.id) : n));
    set(withPrunedGroups(nodes, [...state.groups, group]));
    return group.id;
  },

  ungroup: (groupId) => {
    const state = get();
    if (!state.groups.some((g) => g.id === groupId)) return;
    state.checkpoint();
    set({
      groups: state.groups.filter((g) => g.id !== groupId),
      nodes: state.nodes.map((n) => (n.data.groupId === groupId ? setGroupId(n, undefined) : n)),
    });
  },

  removeFromGroup: (nodeIds) => {
    const ids = new Set(nodeIds);
    const state = get();
    if (!state.nodes.some((n) => ids.has(n.id) && n.data.groupId !== undefined)) return;
    state.checkpoint();
    const nodes = state.nodes.map((n) => (ids.has(n.id) ? setGroupId(n, undefined) : n));
    set(withPrunedGroups(nodes, state.groups));
  },

  updateGroup: (id, patch, historyKey) => {
    get().checkpoint(historyKey ?? `group:${id}:${Object.keys(patch).join(',')}`);
    set({ groups: get().groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  },

  moveGroupBy: (groupId, dx, dy) => {
    if (dx === 0 && dy === 0) return;
    set({
      nodes: get().nodes.map((n) =>
        n.data.groupId === groupId ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n,
      ),
    });
  },

  settleGroup: (groupId) => {
    const nodes = get().nodes;
    const members = new Set(nodes.filter((n) => n.data.groupId === groupId).map((n) => n.id));
    const settled = withoutOverlap(nodes, members);
    if (settled !== nodes) set({ nodes: settled });
  },

  groupAtPoint: (point) => {
    const state = get();
    return groupAt(point, computeFrames(state.groups, membersOf(state.nodes)));
  },

  removeElements: ({ nodes = [], edges = [] }) => {
    if (nodes.length === 0 && edges.length === 0) return;
    get().checkpoint();
    const nodeIds = new Set(nodes);
    const edgeIds = new Set(edges);
    set({
      ...withPrunedGroups(
        get().nodes.filter((n) => !nodeIds.has(n.id)),
        get().groups,
      ),
      edges: get().edges.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target)),
    });
  },

  applyLayout: (estimateExtraHeight, engine = dagreLayout) => {
    const state = get();
    if (state.nodes.length === 0) return;
    const result = engine.layout({
      direction: state.meta.settings.direction,
      nodes: state.nodes.map((n) => {
        const size = sizeOf(n);
        return {
          id: n.id,
          width: size.width,
          height: size.height + (estimateExtraHeight?.(n) ?? 0),
          groupId: n.data.groupId,
        };
      }),
      edges: state.edges.map((e) => ({ source: e.source, target: e.target })),
    });
    state.checkpoint();
    set({ nodes: get().nodes.map((n) => (result[n.id] ? { ...n, position: result[n.id] } : n)) });
  },

  selectOnly: (target) => {
    set({
      nodes: get().nodes.map((n) => {
        const selected = target?.kind === 'node' && target.id === n.id;
        return n.selected === selected ? n : { ...n, selected };
      }),
      edges: get().edges.map((e) => {
        const selected = target?.kind === 'edge' && target.id === e.id;
        return e.selected === selected ? e : { ...e, selected };
      }),
    });
  },

  renameFlow: (title) => {
    set({ meta: { ...get().meta, title } });
  },

  loadDocument: (doc) => {
    baseSizes.clear();
    set(initialState(doc));
  },

  applyExternal: (doc) => {
    const state = get();
    state.checkpoint();
    const next = fromDocument(doc);
    const previous = new Map(state.nodes.map((n) => [n.id, n]));
    set({
      meta: next.meta,
      // 計測済みの大きさと選択状態は引き継ぐ（同じノードが消えたり点滅したりしないように）
      nodes: next.nodes.map((n) => {
        const before = previous.get(n.id);
        return before ? { ...n, measured: before.measured, selected: before.selected } : n;
      }),
      edges: next.edges,
      groups: next.groups,
    });
  },
}));
