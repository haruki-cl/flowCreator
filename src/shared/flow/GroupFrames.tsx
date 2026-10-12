import { useMemo, useRef, type PointerEvent } from 'react';
import { EdgeLabelRenderer, useNodes, useReactFlow, ViewportPortal } from '@xyflow/react';
import type { AppNode, FlowGroup } from '../../core/model';
import { groupHasHiddenContent, groupTooltipText } from '../../core/disclosure';
import { computeFrames, LABEL_OFFSET, reassignAfterDrag } from '../../core/groups';
import type { Rect } from '../../core/geometry';
import { isBlank } from '../../core/text';
import { useUi } from '../ui/uiStore';
import { useFrameMembers } from './edgeRoutes';
import { hoverCancel, hoverEnd, hoverStart } from './hoverIntent';
import { InlineTitleEditor } from './InlineTitleEditor';

export const UNTITLED_GROUP = '（無題のグループ）';
/** これ以上動いたらクリックではなくドラッグとみなす（画面上の px） */
const DRAG_THRESHOLD = 3;

type Props = {
  groups: FlowGroup[];
  mode: 'edit' | 'view';
  onSelect: (groupId: string) => void;
  onDragStart?: (groupId: string) => void;
  onDragBy?: (groupId: string, dx: number, dy: number) => void;
  onDragEnd?: (groupId: string) => void;
  onStartRename?: (groupId: string) => void;
  onRename?: (groupId: string, title: string) => void;
};

type Frames = { frames: Map<string, Rect>; dropTarget: string | undefined };

/** 枠はドラッグ中もメンバー全員で計算する（メンバーを動かすと枠が広がる）。ノードが入ろうとしている枠を強調する */
function useFrames(groups: FlowGroup[]): Frames {
  const nodes = useNodes<AppNode>();
  // 拡大時は、菱形の横に出す要約も枠に含める（線の経路計算と同じ範囲）
  const members = useFrameMembers();
  return useMemo(() => {
    const frames = computeFrames(groups, members);
    const dragging = new Set(nodes.filter((n) => n.dragging).map((n) => n.id));
    // ドロップしたら所属が変わるノードがあれば、その移り先の枠
    const dropTarget = dragging.size > 0 ? reassignAfterDrag(groups, members, dragging).values().next().value : undefined;
    return { frames, dropTarget };
  }, [nodes, members, groups]);
}

/**
 * グループの枠。本体はノードと矢印の背面に描き、操作できるのは前面に置いた名前の部分だけ。
 * 枠の位置と大きさはメンバーのノードから毎回計算する。
 */
export function GroupFrames({ groups, mode, onSelect, onDragStart, onDragBy, onDragEnd, onStartRename, onRename }: Props) {
  const { frames, dropTarget } = useFrames(groups);
  const selectedId = useUi((s) => s.selectedGroupId);
  const editingId = useUi((s) => s.editingTitleId);
  const { getZoom } = useReactFlow();
  const drag = useRef<{ id: string; x: number; y: number; dx: number; dy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>, groupId: string) => {
    if (mode !== 'edit' || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: groupId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, moved: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const screenDx = event.clientX - d.x;
    const screenDy = event.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(screenDx, screenDy) < DRAG_THRESHOLD) return;
      d.moved = true;
      hoverCancel();
      onDragStart?.(d.id);
    }
    const zoom = getZoom();
    const dx = screenDx / zoom;
    const dy = screenDy / zoom;
    onDragBy?.(d.id, dx - d.dx, dy - d.dy);
    d.dx = dx;
    d.dy = dy;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (d?.moved) {
      suppressClick.current = true;
      onDragEnd?.(d.id);
    }
  };

  return (
    <>
      {/* 枠の本体はノードと矢印の背面に描く */}
      <ViewportPortal>
        {groups.map((group) => {
          const rect = frames.get(group.id);
          if (!rect) return null;
          const classes = ['fc-frame'];
          if (selectedId === group.id) classes.push('is-selected');
          if (dropTarget === group.id) classes.push('is-drop-target');
          return (
            <div
              key={group.id}
              className={classes.join(' ')}
              style={{ transform: `translate(${rect.x}px, ${rect.y}px)`, width: rect.width, height: rect.height }}
              data-testid="group-frame"
              data-group-id={group.id}
            />
          );
        })}
      </ViewportPortal>
      {/* 名前は矢印より前面のレイヤー（エッジラベルと同じ層）に置く。背面のままだと、
          名前の上を矢印が通ったときに矢印のクリック判定に隠れてつかめなくなる */}
      <EdgeLabelRenderer>
        {groups.map((group) => {
          const rect = frames.get(group.id);
          if (!rect) return null;
          const editing = mode === 'edit' && editingId === group.id && onRename !== undefined;
          const hoverKey = `group:${group.id}`;
          return (
            <div
              key={group.id}
              className={selectedId === group.id ? 'fc-frame-label is-selected nopan nodrag' : 'fc-frame-label nopan nodrag'}
              style={{
                transform: `translate(${rect.x + LABEL_OFFSET.x}px, ${rect.y + LABEL_OFFSET.y}px)`,
                maxWidth: rect.width - LABEL_OFFSET.x * 2,
              }}
              data-testid="group-label"
              data-group-id={group.id}
              data-has-description={!isBlank(group.description)}
              onPointerDown={editing ? undefined : (e) => onPointerDown(e, group.id)}
              onPointerMove={editing ? undefined : onPointerMove}
              onPointerUp={editing ? undefined : onPointerUp}
              onPointerEnter={(event) => {
                if (editing || drag.current) return;
                if (useUi.getState().panelTarget?.id === group.id) return;
                hoverStart(hoverKey, groupTooltipText(group, useUi.getState().zoomLevel), event.currentTarget, event);
              }}
              onPointerLeave={() => hoverEnd(hoverKey)}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                if (editing) return;
                hoverCancel();
                onSelect(group.id);
              }}
              onDoubleClick={() => {
                if (mode === 'edit') onStartRename?.(group.id);
              }}
            >
              {editing ? (
                <InlineTitleEditor
                  initial={group.title}
                  onCommit={(title) => onRename(group.id, title)}
                  onCancel={() => useUi.getState().setEditingTitle(null)}
                />
              ) : (
                <span className={isBlank(group.title) ? 'fc-frame-title is-empty' : 'fc-frame-title'}>
                  {isBlank(group.title) ? UNTITLED_GROUP : group.title}
                </span>
              )}
              {!editing && groupHasHiddenContent(group) && <span className="fc-marker-inline" aria-label="詳細あり" />}
              {!editing && !isBlank(group.summary) && <span className="fc-frame-summary">{group.summary}</span>}
            </div>
          );
        })}
      </EdgeLabelRenderer>
    </>
  );
}
