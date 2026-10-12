import { nanoid } from 'nanoid';
import {
  FORMAT,
  SCHEMA_VERSION,
  type FlowDocument,
  type FlowEdge,
  type FlowGroup,
  type FlowNode,
  type NodeKind,
} from './model.ts';

export const newId = (): string => nanoid(10);

export const DEFAULT_TITLES: Record<NodeKind, string> = {
  start: '開始',
  process: '',
  decision: '',
  end: '終了',
};

export function createNode(kind: NodeKind, position: { x: number; y: number }, title?: string): FlowNode {
  return { id: newId(), kind, title: title ?? DEFAULT_TITLES[kind], position };
}

export function createEdge(source: string, target: string, label?: string): FlowEdge {
  const edge: FlowEdge = { id: newId(), source, target };
  if (label) edge.label = label;
  return edge;
}

export function createGroup(title = 'グループ'): FlowGroup {
  return { id: newId(), title };
}

export function createDocument(title = '無題のフロー', now = new Date()): FlowDocument {
  const iso = now.toISOString();
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    title,
    createdAt: iso,
    updatedAt: iso,
    settings: { direction: 'TB' },
    nodes: [],
    edges: [],
    groups: [],
  };
}
