import { memo, useEffect, type PointerEvent } from 'react';
import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
import type { AppNode } from '../../core/model';
import { hasDetails, nodeTooltipText } from '../../core/disclosure';
import { isBlank } from '../../core/text';
import { useUi } from '../ui/uiStore';
import { useCaptionSide } from './edgeRoutes';
import { useFlowMode } from './FlowModeContext';
import { hoverCancel, hoverEnd, hoverStart } from './hoverIntent';
import { InlineTitleEditor } from './InlineTitleEditor';

const HANDLES = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
] as const;

export const UNTITLED = '（無題）';

function FlowNodeViewImpl({ id, data, selected, dragging }: NodeProps<AppNode>) {
  const { mode, commitTitle } = useFlowMode();
  const editing = useUi((s) => s.editingTitleId === id);
  const connecting = useConnection((s) => s.inProgress);
  const hasSummary = !isBlank(data.summary);
  const hasDet = hasDetails(data.details);
  const hoverKey = `node:${id}`;
  const isEditing = editing && mode === 'edit' && commitTitle !== undefined;
  // 分岐の要約は、拡大時に菱形の横（線のない側）に出す。両側とも使えないときだけ菱形の中
  const captionSide = useCaptionSide(id);
  const outsideCaption = data.kind === 'decision' && hasSummary && captionSide !== 'inside';

  useEffect(() => {
    if (dragging || isEditing) hoverCancel();
  }, [dragging, isEditing]);
  useEffect(() => () => hoverEnd(hoverKey), [hoverKey]);

  const onPointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging || connecting || isEditing) return;
    const ui = useUi.getState();
    if (ui.panelTarget?.kind === 'node' && ui.panelTarget.id === id) return;
    hoverStart(hoverKey, nodeTooltipText(data, ui.zoomLevel), event.currentTarget, event);
  };

  const title = data.title.trim();
  const classes = ['fc-node', `kind-${data.kind}`];
  if (selected) classes.push('is-selected');
  if (connecting) classes.push('is-connecting');

  return (
    <div
      className={classes.join(' ')}
      data-testid="flow-node"
      data-node-id={id}
      data-kind={data.kind}
      data-has-summary={hasSummary}
      data-has-details={hasDet}
      data-caption={data.kind === 'decision' && hasSummary ? captionSide : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={() => hoverEnd(hoverKey)}
    >
      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          className="fc-handle"
          isConnectable={mode === 'edit'}
        />
      ))}
      <div className="fc-shape">
        {data.kind === 'decision' && (
          <svg className="fc-diamond" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points="50,1 99,50 50,99 1,50" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <div className="fc-content">
          {isEditing ? (
            <InlineTitleEditor
              initial={data.title}
              onCommit={(value) => commitTitle(id, value)}
              onCancel={() => useUi.getState().setEditingTitle(null)}
            />
          ) : (
            <div className={title === '' ? 'fc-title is-empty' : 'fc-title'}>{title === '' ? UNTITLED : title}</div>
          )}
          {hasSummary && !outsideCaption && <div className="fc-summary">{data.summary}</div>}
        </div>
      </div>
      {outsideCaption && (
        <div className={`fc-summary fc-caption is-${captionSide}`} data-testid="decision-caption">
          {data.summary}
        </div>
      )}
      {(hasSummary || hasDet) && <span className="fc-marker" data-testid="detail-marker" aria-label="詳細あり" />}
    </div>
  );
}

export const FlowNodeView = memo(FlowNodeViewImpl);
