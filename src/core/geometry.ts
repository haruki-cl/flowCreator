export type Rect = { x: number; y: number; width: number; height: number };
export type Side = 'top' | 'right' | 'bottom' | 'left';

export type FloatingEdgeParams = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePosition: Side;
  targetPosition: Side;
};

function center(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function anchor(rect: Rect, side: Side): { x: number; y: number } {
  const c = center(rect);
  switch (side) {
    case 'top':
      return { x: c.x, y: rect.y };
    case 'bottom':
      return { x: c.x, y: rect.y + rect.height };
    case 'left':
      return { x: rect.x, y: c.y };
    case 'right':
      return { x: rect.x + rect.width, y: c.y };
  }
}

/**
 * ハンドルを保存しない「フローティングエッジ」の端点。
 * ノード中心同士の位置関係から、向かい合う辺の中点を結ぶ。
 */
export function floatingEdgeParams(source: Rect, target: Rect): FloatingEdgeParams {
  const s = center(source);
  const t = center(target);
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  // 上から下へ流れるフローが基本なので、横に並んでいる（縦方向の範囲が重なる）ときだけ横向きにつなぐ
  const sideBySide = source.y < target.y + target.height && target.y < source.y + source.height;
  const horizontal = sideBySide && dx !== 0;
  let sourcePosition: Side;
  let targetPosition: Side;
  if (horizontal) {
    sourcePosition = dx > 0 ? 'right' : 'left';
    targetPosition = dx > 0 ? 'left' : 'right';
  } else {
    sourcePosition = dy > 0 ? 'bottom' : 'top';
    targetPosition = dy > 0 ? 'top' : 'bottom';
  }
  const sp = anchor(source, sourcePosition);
  const tp = anchor(target, targetPosition);
  return { sx: sp.x, sy: sp.y, tx: tp.x, ty: tp.y, sourcePosition, targetPosition };
}

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width + margin > b.x &&
    a.y < b.y + b.height + margin &&
    a.y + a.height + margin > b.y
  );
}
