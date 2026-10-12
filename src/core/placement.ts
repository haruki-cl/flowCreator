import { rectsOverlap, type Rect } from './geometry.ts';

export const PLACEMENT_GAP = { x: 64, y: 64 } as const;

export type PlacementMode = 'next' | 'branch';

/**
 * Enter（next: 下）/ Tab（branch: 右）で追加するノードの左上座標。
 * 既存ノードと重なる場合は、next なら右へ、branch なら下へずらす。
 */
export function placeNewNode(
  from: Rect,
  size: { width: number; height: number },
  mode: PlacementMode,
  existing: Rect[],
): { x: number; y: number } {
  let candidate: Rect =
    mode === 'next'
      ? { x: from.x + (from.width - size.width) / 2, y: from.y + from.height + PLACEMENT_GAP.y, ...size }
      : { x: from.x + from.width + PLACEMENT_GAP.x, y: from.y + (from.height - size.height) / 2, ...size };

  for (let i = 0; i < 50; i++) {
    if (!existing.some((rect) => rectsOverlap(candidate, rect, 16))) break;
    candidate =
      mode === 'next'
        ? { ...candidate, x: candidate.x + size.width + PLACEMENT_GAP.x / 2 }
        : { ...candidate, y: candidate.y + size.height + PLACEMENT_GAP.y / 2 };
  }
  return { x: Math.round(candidate.x), y: Math.round(candidate.y) };
}

/** ずらしたあとのノード同士の最低限のすき間（矢印が見える程度） */
export const OVERLAP_GAP = 32;
const MAX_EXPANSIONS = 400;

/**
 * 動かしたノード（複数ならひとかたまり）を、ほかのノードと重ならない一番近い位置へずらすための移動量。
 * 重なっている相手の上下左右へ押し出す候補を、移動距離の短い順に試していく。
 */
export function resolveOverlap(
  moving: Rect[],
  obstacles: Rect[],
  gap: number = OVERLAP_GAP,
): { dx: number; dy: number } {
  const firstHit = (dx: number, dy: number): [Rect, Rect] | null => {
    for (const m of moving) {
      const moved = { ...m, x: m.x + dx, y: m.y + dy };
      for (const o of obstacles) {
        if (rectsOverlap(moved, o, gap)) return [moved, o];
      }
    }
    return null;
  };
  if (moving.length === 0 || !firstHit(0, 0)) return { dx: 0, dy: 0 };

  const queue: Array<{ dx: number; dy: number; cost: number }> = [{ dx: 0, dy: 0, cost: 0 }];
  const seen = new Set<string>(['0,0']);
  for (let i = 0; i < MAX_EXPANSIONS && queue.length > 0; i++) {
    queue.sort((a, b) => a.cost - b.cost);
    const { dx, dy } = queue.shift()!;
    const hit = firstHit(dx, dy);
    if (!hit) return { dx, dy };
    const [m, o] = hit;
    const candidates = [
      { dx: dx + Math.floor(o.x - gap - (m.x + m.width)) - 1, dy },
      { dx: dx + Math.ceil(o.x + o.width + gap - m.x) + 1, dy },
      { dx, dy: dy + Math.floor(o.y - gap - (m.y + m.height)) - 1 },
      { dx, dy: dy + Math.ceil(o.y + o.height + gap - m.y) + 1 },
    ];
    for (const c of candidates) {
      const key = `${c.dx},${c.dy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ ...c, cost: Math.hypot(c.dx, c.dy) });
    }
  }
  // ここまでで見つからないほど密集している場合は、空いている下方向へ逃がす
  const bottom = Math.max(...obstacles.map((o) => o.y + o.height));
  const top = Math.min(...moving.map((m) => m.y));
  return { dx: 0, dy: Math.ceil(bottom + gap - top) + 1 };
}
