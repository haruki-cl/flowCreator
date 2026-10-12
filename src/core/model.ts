import type { Edge, Node } from '@xyflow/react';

export const FORMAT = 'flowcreator' as const;
export const SCHEMA_VERSION = 2 as const;

export const NODE_KINDS = ['start', 'process', 'decision', 'end'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  start: '開始',
  process: '処理',
  decision: '分岐',
  end: '終了',
};

/** url は http(s) / mailto のみリンクとして描画する（links.ts の safeUrl を参照） */
export type FlowLink = { label: string; url: string };

/** 詳細パネルでのみ表示する情報。既定では画面に出さない */
export type NodeDetails = {
  description?: string;
  owner?: string;
  conditions?: string;
  notes?: string;
  links?: FlowLink[];
};

export const DETAIL_FIELDS = ['owner', 'conditions', 'notes', 'links'] as const;
export type OptionalDetailField = (typeof DETAIL_FIELDS)[number];

export const DETAIL_FIELD_LABELS: Record<keyof NodeDetails, string> = {
  description: '説明',
  owner: '担当',
  conditions: '条件・前提',
  notes: 'メモ',
  links: 'リンク',
};

export type FlowNode = {
  id: string;
  kind: NodeKind;
  /** 常に表示する見出し */
  title: string;
  /** ホバー時のツールチップ / 拡大時にインライン表示する要約 */
  summary?: string;
  details?: NodeDetails;
  /** 所属するグループ（枠）。1 つのノードが属せるのは 1 グループまで */
  groupId?: string;
  position: { x: number; y: number };
};

/** ノードをまとめる枠。枠の位置と大きさはメンバーのノードから自動で決まる */
export type FlowGroup = {
  id: string;
  /** 枠の左上に常に表示する名前 */
  title: string;
  summary?: string;
  description?: string;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  /** 常に表示する短いラベル（Yes / No など） */
  label?: string;
  /** 既定では非表示。ホバーで 1 行目、パネルで全文 */
  detail?: string;
};

export type Direction = 'TB' | 'LR';

export type FlowDocument = {
  format: typeof FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  settings: { direction: Direction };
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups: FlowGroup[];
};

export type DocMeta = Omit<FlowDocument, 'format' | 'schemaVersion' | 'nodes' | 'edges' | 'groups'>;

// React Flow 上での表現。RF の type は 1 種類だけにし、形状は data.kind で切り替える
export type FlowNodeData = {
  kind: NodeKind;
  title: string;
  summary?: string;
  details?: NodeDetails;
  groupId?: string;
};
export type AppNode = Node<FlowNodeData, 'flow'>;

export type FlowEdgeData = {
  label?: string;
  detail?: string;
};
export type AppEdge = Edge<FlowEdgeData, 'flow'>;
