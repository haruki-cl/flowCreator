import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useUi } from '../ui/uiStore';

const GAP = 8;
const EDGE_MARGIN = 8;

/** ノードとエッジ共通のツールチップ。position: fixed で要素の上（入らなければ下）に出す */
export function TooltipLayer() {
  const hover = useUi((s) => s.hover);
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!hover || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const { rect } = hover;
    let top = rect.top - box.height - GAP;
    if (top < EDGE_MARGIN) top = rect.top + rect.height + GAP;
    let left = rect.left + rect.width / 2 - box.width / 2;
    left = Math.max(EDGE_MARGIN, Math.min(left, window.innerWidth - box.width - EDGE_MARGIN));
    setStyle({ top, left, visibility: 'visible' });
  }, [hover]);

  if (!hover) return null;
  return (
    <div ref={ref} className="fc-tooltip" role="tooltip" data-testid="tooltip" style={style}>
      {hover.text}
    </div>
  );
}
