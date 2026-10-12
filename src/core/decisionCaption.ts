import { floatingEdgeParams, rectsOverlap, type Rect } from './geometry.ts';
import type { NodeKind } from './model.ts';
import { displayWidth, isBlank } from './text.ts';

/**
 * 拡大（L2）で分岐の要約を菱形の横に出す。線が横から出入りしていない側で、ほかのノードと重ならない側を選ぶ
 * （右を優先し、だめなら左）。どちらも使えなければ菱形の中に出す。
 * 画面の CSS（.fc-caption）と同じ寸法で、要約が占める範囲を見積もる（線の経路と枠の計算に使う）。
 */

export const CAPTION = { width: 168, gap: 10, fontSize: 12, lineHeight: 16.8, maxLines: 3 } as const;

export type CaptionSide = 'right' | 'left' | 'inside';
export type CaptionPlacement = { side: CaptionSide; rect: Rect | null };

export function captionRect(node: Rect, summary: string, side: 'right' | 'left'): Rect {
  // displayWidth は半角 1・全角 2。半角 1 文字を 0.55em として、1 行に入る量を見積もる
  const perLine = Math.floor(CAPTION.width / (CAPTION.fontSize * 0.55));
  const lines = Math.min(CAPTION.maxLines, Math.max(1, Math.ceil(displayWidth(summary) / perLine)));
  const height = lines * CAPTION.lineHeight + 4;
  return {
    x: side === 'right' ? node.x + node.width + CAPTION.gap : node.x - CAPTION.gap - CAPTION.width,
    y: node.y + node.height / 2 - height / 2,
    width: CAPTION.width,
    height,
  };
}

export type CaptionNode = { id: string; kind: NodeKind; summary?: string; rect: Rect };

export function placeCaptions(
  nodes: CaptionNode[],
  edges: Array<{ source: string; target: string }>,
): Map<string, CaptionPlacement> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const result = new Map<string, CaptionPlacement>();
  for (const node of nodes) {
    if (node.kind !== 'decision' || isBlank(node.summary)) continue;
    // この分岐の線が、どの辺から出入りするか
    const usedSides = new Set<string>();
    for (const edge of edges) {
      if (edge.source === node.id && byId.has(edge.target)) {
        usedSides.add(floatingEdgeParams(node.rect, byId.get(edge.target)!.rect).sourcePosition);
      } else if (edge.target === node.id && byId.has(edge.source)) {
        usedSides.add(floatingEdgeParams(byId.get(edge.source)!.rect, node.rect).targetPosition);
      }
    }
    let placement: CaptionPlacement = { side: 'inside', rect: null };
    for (const side of ['right', 'left'] as const) {
      if (usedSides.has(side)) continue;
      const rect = captionRect(node.rect, node.summary!, side);
      const blocked = nodes.some((other) => other.id !== node.id && rectsOverlap(rect, other.rect, 12));
      if (!blocked) {
        placement = { side, rect };
        break;
      }
    }
    result.set(node.id, placement);
  }
  return result;
}
