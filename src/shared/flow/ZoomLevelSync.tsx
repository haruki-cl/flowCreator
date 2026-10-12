import { useEffect } from 'react';
import { useStore } from '@xyflow/react';
import { nextZoomLevel } from '../../core/zoomLevels';
import { useUi } from '../ui/uiStore';

/**
 * ビューポートのズーム値を購読して、表示段階（L0〜L2）だけを uiStore に流す。
 * 見た目の切り替えは CSS（data-zoom-level）で行うので、ズーム中にノードは再描画されない。
 */
export function ZoomLevelSync() {
  const zoom = useStore((s) => s.transform[2]);
  useEffect(() => {
    const ui = useUi.getState();
    const next = nextZoomLevel(ui.zoomLevel, zoom);
    if (next !== ui.zoomLevel) ui.setZoomLevel(next);
  }, [zoom]);
  return null;
}
