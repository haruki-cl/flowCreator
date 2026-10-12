import { useStore } from '@xyflow/react';
import type { AppEdge, AppNode, FlowGroup } from '../../core/model';
import { placeCaptions, type CaptionPlacement, type CaptionSide } from '../../core/decisionCaption';
import { computeFrames, estimateLabelRect, type MemberInfo } from '../../core/groups';
import type { Rect } from '../../core/geometry';
import { routeAll, type EdgeRoute, type FrameGeometry, type NodeGeometry } from '../../core/routing';
import type { ZoomLevel } from '../../core/zoomLevels';
import { useUi } from '../ui/uiStore';
import { useGroups } from './groupsContext';

/**
 * 線の経路・分岐の要約の位置・枠は互いに関係するので、ノードと線とグループと拡大段階が同じ間は 1 回だけまとめて計算し、
 * 各部品はその結果を使う。
 * - 分岐の要約（拡大時に菱形の横に出す）は、線の障害物になり、枠にも含める
 * - 枠の名前は線が通らず、枠の縁沿いも走らない
 */
export type FlowExtras = {
  captions: Map<string, CaptionPlacement>;
  routes: Map<string, EdgeRoute>;
  /** 枠の計算に使うメンバーの範囲（拡大時は分岐の要約を含める） */
  members: MemberInfo[];
};

const cache = new WeakMap<object, WeakMap<object, WeakMap<object, Map<ZoomLevel, FlowExtras>>>>();

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

function compute(nodes: AppNode[], edges: AppEdge[], groups: FlowGroup[], level: ZoomLevel): FlowExtras {
  const geometry = new Map<string, NodeGeometry>();
  for (const n of nodes) {
    const width = n.measured?.width ?? 0;
    if (width <= 0) continue;
    geometry.set(n.id, {
      rect: { x: n.position.x, y: n.position.y, width, height: n.measured?.height ?? 0 },
      shape: n.data.kind === 'decision' ? 'diamond' : 'rect',
    });
  }
  const measured = nodes.filter((n) => geometry.has(n.id));
  const captions =
    level === 2
      ? placeCaptions(
          measured.map((n) => ({ id: n.id, kind: n.data.kind, summary: n.data.summary, rect: geometry.get(n.id)!.rect })),
          edges,
        )
      : new Map<string, CaptionPlacement>();
  const captionRects = [...captions.values()].map((c) => c.rect).filter((r): r is Rect => r !== null);

  const members: MemberInfo[] = measured.map((n) => {
    const rect = geometry.get(n.id)!.rect;
    const caption = captions.get(n.id)?.rect;
    return { id: n.id, groupId: n.data.groupId, rect: caption ? union(rect, caption) : rect };
  });
  const frames: FrameGeometry[] = [];
  for (const [id, rect] of computeFrames(groups, members)) {
    const group = groups.find((g) => g.id === id)!;
    frames.push({ rect, label: estimateLabelRect(rect, group, level) });
  }
  return { captions, members, routes: routeAll(geometry, edges, frames, captionRects) };
}

function useExtras(): FlowExtras {
  const nodes = useStore((s) => s.nodes) as AppNode[];
  const edges = useStore((s) => s.edges) as AppEdge[];
  const groups = useGroups();
  const level = useUi((s) => s.zoomLevel);
  return extrasFor(nodes, edges, groups, level);
}

function extrasFor(nodes: AppNode[], edges: AppEdge[], groups: FlowGroup[], level: ZoomLevel): FlowExtras {
  let byEdges = cache.get(nodes);
  if (!byEdges) cache.set(nodes, (byEdges = new WeakMap()));
  let byGroups = byEdges.get(edges);
  if (!byGroups) byEdges.set(edges, (byGroups = new WeakMap()));
  let byLevel = byGroups.get(groups);
  if (!byLevel) byGroups.set(groups, (byLevel = new Map()));
  let extras = byLevel.get(level);
  if (!extras) {
    extras = compute(nodes, edges, groups, level);
    byLevel.set(level, extras);
  }
  return extras;
}

export function useEdgeRoute(edgeId: string): EdgeRoute | undefined {
  return useExtras().routes.get(edgeId);
}

/** 枠の計算に使うメンバーの範囲 */
export function useFrameMembers(): MemberInfo[] {
  return useExtras().members;
}

/** 分岐の要約を菱形のどちら側に出すか（文字列だけを返すので、変わったときだけ描き直す） */
export function useCaptionSide(nodeId: string): CaptionSide {
  const groups = useGroups();
  const level = useUi((s) => s.zoomLevel);
  return useStore((s) => {
    if (level !== 2) return 'inside';
    return extrasFor(s.nodes as AppNode[], s.edges as AppEdge[], groups, level).captions.get(nodeId)?.side ?? 'inside';
  });
}
