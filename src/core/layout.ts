import dagre from '@dagrejs/dagre';
import type { Direction, NodeKind } from './model.ts';

/**
 * 拡大（L2）で要約がノード内に出たときに伸びる高さの見込み。自動整列はこの分の間を空けておく
 * （拡大したときに下のノードと詰まらないように）
 */
export function summaryAllowance(node: { kind: NodeKind; summary?: string }): number {
  if (!node.summary || node.summary.trim() === '') return 0;
  // 分岐の要約は菱形の横に出すので、縦には伸びない
  return node.kind === 'decision' ? 0 : 56;
}

/** 画面で計測する前のノードの大きさ（新規作成時や、画面のない CLI での整列に使う） */
export const DEFAULT_NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  start: { width: 176, height: 44 },
  process: { width: 176, height: 44 },
  decision: { width: 200, height: 96 },
  end: { width: 176, height: 44 },
};

export type LayoutNode = { id: string; width: number; height: number; groupId?: string };
export type LayoutEdge = { source: string; target: string };
export type LayoutInput = { nodes: LayoutNode[]; edges: LayoutEdge[]; direction: Direction };
/** ノード左上の座標 */
export type LayoutResult = Record<string, { x: number; y: number }>;

export interface LayoutEngine {
  layout(input: LayoutInput): LayoutResult;
}

export const LAYOUT_SPACING = { ranksep: 72, nodesep: 48 } as const;
/**
 * グループがあるときの段の間隔。dagre の compound レイアウトはクラスタの境界にも段を使うため、
 * 通常より小さい値でも枠どうし・枠とほかのノードは重ならない（72 以上だと縦に間延びする）
 */
const GROUPED_RANKSEP = 48;

export const dagreLayout: LayoutEngine = {
  layout({ nodes, edges, direction }) {
    const grouped = nodes.some((n) => n.groupId !== undefined);
    // グループは dagre の compound（クラスタ）として渡し、メンバーがまとまって並ぶようにする
    const graph = new dagre.graphlib.Graph({ multigraph: true, compound: grouped });
    graph.setGraph({
      rankdir: direction,
      ranksep: grouped ? GROUPED_RANKSEP : LAYOUT_SPACING.ranksep,
      nodesep: LAYOUT_SPACING.nodesep,
      marginx: 0,
      marginy: 0,
    });
    graph.setDefaultEdgeLabel(() => ({}));
    for (const node of nodes) {
      graph.setNode(node.id, { width: node.width, height: node.height });
    }
    if (grouped) {
      for (const node of nodes) {
        if (node.groupId === undefined) continue;
        const clusterId = `cluster:${node.groupId}`;
        if (!graph.hasNode(clusterId)) graph.setNode(clusterId, {});
        graph.setParent(node.id, clusterId);
      }
    }
    const ids = new Set(nodes.map((n) => n.id));
    edges.forEach((edge, index) => {
      if (ids.has(edge.source) && ids.has(edge.target)) {
        graph.setEdge(edge.source, edge.target, {}, `e${index}`);
      }
    });
    dagre.layout(graph);
    const result: LayoutResult = {};
    for (const node of nodes) {
      const laid = graph.node(node.id) as { x: number; y: number };
      // dagre は中心座標を返すので左上に直す
      result[node.id] = { x: Math.round(laid.x - node.width / 2), y: Math.round(laid.y - node.height / 2) };
    }
    return result;
  },
};
