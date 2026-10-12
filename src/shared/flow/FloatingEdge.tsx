import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import type { AppEdge } from '../../core/model';
import { edgeTooltipText } from '../../core/disclosure';
import { roundedPath } from '../../core/routing';
import { isBlank } from '../../core/text';
import { useEdgeRoute } from './edgeRoutes';
import { useFlowMode } from './FlowModeContext';
import { hoverCancel, hoverEnd, hoverStart } from './hoverIntent';

/**
 * ハンドルに依存せず、ノード同士の位置関係から辺を選んで結ぶエッジ。
 * 途中のノードは避け、ほかの線と同じ所を並んで通らないよう少しずらして引く（経路は edgeRoutes でまとめて計算）。
 */
function FloatingEdgeImpl({ id, markerEnd, style, data, selected }: EdgeProps<AppEdge>) {
  const route = useEdgeRoute(id);
  const { openDetail } = useFlowMode();
  if (!route) return null;

  const path = roundedPath(route.points);
  const { x: labelX, y: labelY } = route.label;

  const label = data?.label?.trim() ?? '';
  const hasDetail = !isBlank(data?.detail);
  const hoverKey = `edge:${id}`;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={18} />
      {(label !== '' || hasDetail) && (
        <EdgeLabelRenderer>
          <div
            className={['fc-edge-label', 'nodrag', 'nopan', label === '' ? 'is-dot-only' : '', selected ? 'is-selected' : '']
              .filter(Boolean)
              .join(' ')}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            data-testid="edge-label"
            data-edge-id={id}
            onPointerEnter={(event) => {
              if (hasDetail) hoverStart(hoverKey, edgeTooltipText(data), event.currentTarget, event);
            }}
            onPointerLeave={() => hoverEnd(hoverKey)}
            onClick={() => {
              hoverCancel();
              openDetail({ kind: 'edge', id });
            }}
          >
            {label !== '' && <span>{label}</span>}
            {hasDetail && <span className="fc-marker-inline" aria-label="詳細あり" />}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FloatingEdge = memo(FloatingEdgeImpl);
