import {
  FORMAT,
  SCHEMA_VERSION,
  type AppEdge,
  type AppNode,
  type DocMeta,
  type FlowDocument,
  type FlowEdge,
  type FlowGroup,
  type FlowLink,
  type FlowNode,
  type NodeDetails,
} from './model.ts';
import type { MarkerType } from '@xyflow/react';
import { isBlank } from './text.ts';

export const EDGE_MARKER_COLOR = '#8a8f98';
// core は React Flow の実行時コードに依存させないため、enum 値（MarkerType.ArrowClosed）を文字列で持つ
const ARROW_CLOSED = 'arrowclosed' as unknown as MarkerType;

function trimmedOrUndefined(text: string | undefined): string | undefined {
  return isBlank(text) ? undefined : text;
}

/** 空の項目を落とす。中身が何もなければ undefined */
export function cleanDetails(details: NodeDetails | undefined): NodeDetails | undefined {
  if (!details) return undefined;
  const cleaned: NodeDetails = {};
  for (const key of ['description', 'owner', 'conditions', 'notes'] as const) {
    const value = trimmedOrUndefined(details[key]);
    if (value !== undefined) cleaned[key] = value;
  }
  const links: FlowLink[] = (details.links ?? []).filter((link) => !isBlank(link.url) || !isBlank(link.label));
  if (links.length > 0) cleaned.links = links.map((link) => ({ label: link.label, url: link.url }));
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function toFlowNode(node: AppNode): FlowNode {
  const result: FlowNode = {
    id: node.id,
    kind: node.data.kind,
    title: node.data.title,
    position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
  };
  const summary = trimmedOrUndefined(node.data.summary);
  if (summary !== undefined) result.summary = summary;
  const details = cleanDetails(node.data.details);
  if (details !== undefined) result.details = details;
  if (node.data.groupId) result.groupId = node.data.groupId;
  return result;
}

export function toFlowGroup(group: FlowGroup): FlowGroup {
  const result: FlowGroup = { id: group.id, title: group.title };
  const summary = trimmedOrUndefined(group.summary);
  if (summary !== undefined) result.summary = summary;
  const description = trimmedOrUndefined(group.description);
  if (description !== undefined) result.description = description;
  return result;
}

export function toFlowEdge(edge: AppEdge): FlowEdge {
  const result: FlowEdge = { id: edge.id, source: edge.source, target: edge.target };
  const label = trimmedOrUndefined(edge.data?.label);
  if (label !== undefined) result.label = label;
  const detail = trimmedOrUndefined(edge.data?.detail);
  if (detail !== undefined) result.detail = detail;
  return result;
}

/** React Flow 固有のフィールド（selected, measured, dragging など）を落として保存用の形にする */
export function toDocument(meta: DocMeta, nodes: AppNode[], edges: AppEdge[], groups: FlowGroup[]): FlowDocument {
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id: meta.id,
    title: meta.title,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    settings: { direction: meta.settings.direction },
    nodes: nodes.map(toFlowNode),
    edges: edges.map(toFlowEdge),
    groups: groups.map(toFlowGroup),
  };
}

export function toAppNode(node: FlowNode): AppNode {
  const data: AppNode['data'] = { kind: node.kind, title: node.title };
  if (node.summary !== undefined) data.summary = node.summary;
  if (node.details !== undefined) data.details = node.details;
  if (node.groupId !== undefined) data.groupId = node.groupId;
  return { id: node.id, type: 'flow', position: { ...node.position }, data };
}

export function toAppEdge(edge: FlowEdge): AppEdge {
  const data: NonNullable<AppEdge['data']> = {};
  if (edge.label !== undefined) data.label = edge.label;
  if (edge.detail !== undefined) data.detail = edge.detail;
  return {
    id: edge.id,
    type: 'flow',
    source: edge.source,
    target: edge.target,
    markerEnd: { type: ARROW_CLOSED, color: EDGE_MARKER_COLOR },
    data,
  };
}

export function fromDocument(doc: FlowDocument): { meta: DocMeta; nodes: AppNode[]; edges: AppEdge[]; groups: FlowGroup[] } {
  return {
    meta: {
      id: doc.id,
      title: doc.title,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      settings: { direction: doc.settings.direction },
    },
    nodes: doc.nodes.map(toAppNode),
    edges: doc.edges.map(toAppEdge),
    groups: (doc.groups ?? []).map((g) => ({ ...g })),
  };
}
