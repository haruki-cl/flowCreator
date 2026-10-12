/**
 * セマンティックズームの段階。
 * L0 俯瞰: 見出し 1 行のみ / L1 標準: 見出し + 「•」 / L2 詳細: 見出し + 要約をインライン表示
 */
export type ZoomLevel = 0 | 1 | 2;

export const ZOOM_THRESHOLDS = { l1: 0.55, l2: 1.25 } as const;

/** 境界付近でズームを微調整したときに段階が行ったり来たりしないための幅 */
export const ZOOM_HYSTERESIS = 0.05;

export function zoomLevelOf(zoom: number): ZoomLevel {
  if (zoom >= ZOOM_THRESHOLDS.l2) return 2;
  if (zoom >= ZOOM_THRESHOLDS.l1) return 1;
  return 0;
}

/** 上がるときは閾値ちょうどで、下がるときは閾値 - ZOOM_HYSTERESIS を下回ったら切り替える */
export function nextZoomLevel(prev: ZoomLevel, zoom: number): ZoomLevel {
  const up = zoomLevelOf(zoom);
  if (up > prev) return up;
  const down = zoomLevelOf(zoom + ZOOM_HYSTERESIS);
  if (down < prev) return down;
  return prev;
}
