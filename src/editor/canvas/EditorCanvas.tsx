import { useCallback, useMemo, useRef, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  NodeToolbar,
  Position,
  ReactFlow,
  useReactFlow,
  type NodeChange,
  type OnConnectEnd,
  type OnSelectionChangeFunc,
} from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { NODE_KINDS, type AppEdge, type AppNode, type NodeKind } from '../../core/model';
import { summaryAllowance } from '../../core/layout';
import { FlowModeProvider, type FlowMode } from '../../shared/flow/FlowModeContext';
import { GroupFrames } from '../../shared/flow/GroupFrames';
import { GroupsProvider } from '../../shared/flow/groupsContext';
import { spreadForDisplay, toStoredPoint } from '../../shared/flow/spreadDisplay';
import { hoverCancel } from '../../shared/flow/hoverIntent';
import { edgeTypes, nodeTypes } from '../../shared/flow/types';
import { ZoomLevelSync } from '../../shared/flow/ZoomLevelSync';
import { useUi, type TargetRef } from '../../shared/ui/uiStore';
import { DEFAULT_NODE_SIZE, useDoc } from '../store/docStore';
import { KIND_DRAG_MIME } from '../toolbar/Toolbar';
import { useShortcuts } from './useShortcuts';

export const FIT_OPTIONS = { padding: 0.2, maxZoom: 1, duration: 250 } as const;

type Props = {
  onFilesDropped: (files: FileList) => void;
};

/** 拡大表示（L2）では表示上の位置を広げているので、画面上の点を保存位置の座標に戻す */
function toStored(point: { x: number; y: number }): { x: number; y: number } {
  if (useUi.getState().zoomLevel !== 2) return point;
  return toStoredPoint(useDoc.getState().nodes, point);
}

export function useCanvasActions() {
  const rf = useReactFlow<AppNode, AppEdge>();

  const fit = useCallback(
    (duration: number = FIT_OPTIONS.duration) => {
      void rf.fitView({ ...FIT_OPTIONS, duration });
    },
    [rf],
  );

  const layout = useCallback(() => {
    // 位置は通常表示の大きさで決めるので、拡大中でも要約が出たときの伸びを常に見込む
    useDoc.getState().applyLayout((node) => summaryAllowance(node.data));
    requestAnimationFrame(() => void rf.fitView(FIT_OPTIONS));
  }, [rf]);

  /** 画面上の点を中心にノードを置いて、見出しの編集を始める。枠の中に置いたらそのグループに入る */
  const addAtScreenPoint = useCallback(
    (kind: NodeKind, point: { x: number; y: number }) => {
      const size = DEFAULT_NODE_SIZE[kind];
      const doc = useDoc.getState();
      const flowPoint = toStored(rf.screenToFlowPosition(point));
      const id = doc.addNode(
        kind,
        { x: Math.round(flowPoint.x - size.width / 2), y: Math.round(flowPoint.y - size.height / 2) },
        { groupId: doc.groupAtPoint(flowPoint) },
      );
      const ui = useUi.getState();
      ui.openPanel(null);
      ui.selectGroup(null);
      ui.setEditingTitle(id);
      return id;
    },
    [rf],
  );

  /** 選択中のノードを枠でまとめ、枠の名前の編集を始める */
  const groupSelection = useCallback(() => {
    const doc = useDoc.getState();
    const ids = doc.nodes.filter((n) => n.selected).map((n) => n.id);
    const groupId = doc.createGroup(ids);
    if (!groupId) return;
    doc.selectOnly(null);
    const ui = useUi.getState();
    ui.openPanel(null);
    ui.selectGroup(groupId);
    ui.setEditingTitle(groupId);
  }, []);

  return { rf, fit, layout, addAtScreenPoint, groupSelection };
}

/** 2 つ以上のノードを選んでいる間だけ、選択範囲の上に「グループにする」を出す */
function GroupSelectionChip({ onGroup }: { onGroup: () => void }) {
  const selectedIds = useDoc(useShallow((s) => s.nodes.filter((n) => n.selected).map((n) => n.id)));
  const dragging = useDoc((s) => s.dragging);
  if (selectedIds.length < 2) return null;
  return (
    <NodeToolbar nodeId={selectedIds} isVisible={!dragging} position={Position.Top} offset={14}>
      <button type="button" className="fc-chip nodrag nopan" data-testid="group-chip" onClick={onGroup}>
        グループにする <span className="fc-kbd">{navigator.platform.includes('Mac') ? '⌘G' : 'Ctrl+G'}</span>
      </button>
    </NodeToolbar>
  );
}

function isPane(target: EventTarget | null): boolean {
  return target instanceof Element && target.classList.contains('react-flow__pane');
}

export function EditorCanvas({ onFilesDropped }: Props) {
  const nodes = useDoc((s) => s.nodes);
  const edges = useDoc((s) => s.edges);
  const onNodesChange = useDoc((s) => s.onNodesChange);
  const onEdgesChange = useDoc((s) => s.onEdgesChange);
  const onConnect = useDoc((s) => s.onConnect);
  const groups = useDoc((s) => s.groups);
  const zoomLevel = useUi((s) => s.zoomLevel);
  const { rf, fit, layout, addAtScreenPoint, groupSelection } = useCanvasActions();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 拡大表示（L2）では、伸びたノードの下が詰まらないよう表示上の位置を広げる（保存位置は変えない）
  const movingRef = useRef<ReadonlySet<string> | null>(null);
  const displayNodes = useMemo(
    () => (zoomLevel === 2 ? spreadForDisplay(nodes, movingRef.current ?? undefined) : nodes),
    [nodes, zoomLevel],
  );
  /** 拡大表示でのドラッグや矢印キーの移動は、表示上の位置で届くので保存位置に戻してから渡す */
  const handleNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      const moves = changes.filter((c) => c.type === 'position' && c.position);
      if (useUi.getState().zoomLevel !== 2 || moves.length === 0) {
        movingRef.current = null;
        onNodesChange(changes);
        return;
      }
      const moving = new Set(moves.map((c) => (c as { id: string }).id));
      const current = useDoc.getState().nodes;
      const converted = changes.map((c) =>
        c.type === 'position' && c.position ? { ...c, position: toStoredPoint(current, c.position, moving) } : c,
      );
      movingRef.current = moves.some((c) => c.type === 'position' && c.dragging) ? moving : null;
      onNodesChange(converted);
    },
    [onNodesChange],
  );

  useShortcuts({ rf, layout, fit, groupSelection });

  const flowMode = useMemo<FlowMode>(
    () => ({
      mode: 'edit',
      openDetail: (target: TargetRef) => {
        useDoc.getState().selectOnly(target.kind === 'group' ? null : { kind: target.kind, id: target.id });
        useUi.getState().selectGroup(target.kind === 'group' ? target.id : null);
        useUi.getState().openPanel(target);
      },
      commitTitle: (id, title) => {
        const doc = useDoc.getState();
        const node = doc.nodes.find((n) => n.id === id);
        if (node && node.data.title !== title) doc.updateNodeData(id, { title }, `title:${id}`);
        useUi.getState().setEditingTitle(null);
      },
    }),
    [],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      if (state.isValid || !state.fromNode) return;
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      const hit = document.elementFromPoint(point.clientX, point.clientY);
      // ノード本体の上で離したら、そのノードにつなぐ
      const nodeEl = hit?.closest('.react-flow__node');
      if (nodeEl) {
        const targetId = nodeEl.getAttribute('data-id');
        if (targetId) useDoc.getState().connect(state.fromNode.id, targetId);
        return;
      }
      // 何もない所で離したら、そこに新しいノードを作ってつなぐ
      if (!isPane(hit)) return;
      const size = DEFAULT_NODE_SIZE.process;
      const flowPoint = toStored(rf.screenToFlowPosition({ x: point.clientX, y: point.clientY }));
      const doc = useDoc.getState();
      const id = doc.addConnectedNode(
        state.fromNode.id,
        { x: Math.round(flowPoint.x - size.width / 2), y: Math.round(flowPoint.y - size.height / 2) },
        doc.groupAtPoint(flowPoint),
      );
      useUi.getState().openPanel(null);
      useUi.getState().setEditingTitle(id);
    },
    [rf],
  );

  const onSelectionChange: OnSelectionChangeFunc<AppNode, AppEdge> = useCallback(({ nodes: selNodes, edges: selEdges }) => {
    const ui = useUi.getState();
    const selected = [...selNodes.map((n) => n.id), ...selEdges.map((e) => e.id)];
    // ノードや矢印を選んだら枠の選択は外す
    if (selected.length > 0 && ui.selectedGroupId !== null) ui.selectGroup(null);
    const target = ui.panelTarget;
    if (!target) return;
    if (target.kind === 'group') {
      if (selected.length > 0) ui.openPanel(null);
      return;
    }
    // パネルは 1 要素を選んでいるときだけ
    if (selected.length !== 1 || selected[0] !== target.id) ui.openPanel(null);
  }, []);

  const onDoubleClick = (e: ReactMouseEvent) => {
    if (!isPane(e.target)) return;
    addAtScreenPoint('process', { x: e.clientX, y: e.clientY });
  };

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(KIND_DRAG_MIME) || e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (e: DragEvent) => {
    const kind = e.dataTransfer.getData(KIND_DRAG_MIME);
    if (kind && (NODE_KINDS as readonly string[]).includes(kind)) {
      e.preventDefault();
      addAtScreenPoint(kind as NodeKind, { x: e.clientX, y: e.clientY });
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      e.preventDefault();
      onFilesDropped(e.dataTransfer.files);
    }
  };

  return (
    <FlowModeProvider value={flowMode}>
      <GroupsProvider value={groups}>
        <div
          ref={wrapperRef}
          className="fc-canvas fc-mode-edit"
          data-zoom-level={zoomLevel}
          data-testid="canvas"
          onDoubleClick={onDoubleClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow<AppNode, AppEdge>
            nodes={displayNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            isValidConnection={(c) => c.source !== c.target}
            onNodeClick={(e, node) => {
              hoverCancel();
              if (e.shiftKey || e.metaKey || e.ctrlKey) return;
              useUi.getState().openPanel({ kind: 'node', id: node.id });
            }}
            onEdgeClick={(e, edge) => {
              hoverCancel();
              if (e.shiftKey || e.metaKey || e.ctrlKey) return;
              useUi.getState().openPanel({ kind: 'edge', id: edge.id });
            }}
            onNodeDoubleClick={(_, node) => {
              useUi.getState().openPanel(null);
              useUi.getState().setEditingTitle(node.id);
            }}
            onPaneClick={() => {
              useUi.getState().openPanel(null);
              useUi.getState().selectGroup(null);
            }}
            onSelectionChange={onSelectionChange}
            onBeforeDelete={async () => {
              useDoc.getState().checkpoint();
              return true;
            }}
            onNodeDragStart={() => hoverCancel()}
            onMoveStart={() => useUi.getState().setMoving(true)}
            onMoveEnd={() => useUi.getState().setMoving(false)}
            connectionMode={ConnectionMode.Loose}
            connectionLineType={ConnectionLineType.SmoothStep}
            zoomOnDoubleClick={false}
            deleteKeyCode={['Backspace', 'Delete']}
            // 他の作図ツールと同じく Shift+クリックでも選択に追加できるようにする（既定は ⌘ / Ctrl のみ）
            multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
            minZoom={0.2}
            maxZoom={2.5}
            // 選択したノードを前面に出すと、枠（背面）との重なり順が崩れるので出さない
            elevateNodesOnSelect={false}
            fitView
            fitViewOptions={{ padding: FIT_OPTIONS.padding, maxZoom: FIT_OPTIONS.maxZoom }}
            colorMode="system"
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
            <ZoomLevelSync />
            <GroupFrames
              groups={groups}
              mode="edit"
              onSelect={(groupId) => {
                useDoc.getState().selectOnly(null);
                const ui = useUi.getState();
                ui.selectGroup(groupId);
                ui.openPanel({ kind: 'group', id: groupId });
              }}
              onDragStart={(groupId) => {
                useDoc.getState().checkpoint();
                useDoc.getState().selectOnly(null);
                useUi.getState().selectGroup(groupId);
              }}
              onDragBy={(groupId, dx, dy) => useDoc.getState().moveGroupBy(groupId, dx, dy)}
              onDragEnd={(groupId) => useDoc.getState().settleGroup(groupId)}
              onStartRename={(groupId) => {
                useUi.getState().openPanel(null);
                useUi.getState().setEditingTitle(groupId);
              }}
              onRename={(groupId, title) => {
                const doc = useDoc.getState();
                if (doc.groups.find((g) => g.id === groupId)?.title !== title) doc.updateGroup(groupId, { title }, `title:${groupId}`);
                useUi.getState().setEditingTitle(null);
              }}
            />
            <GroupSelectionChip onGroup={groupSelection} />
          </ReactFlow>
        </div>
      </GroupsProvider>
    </FlowModeProvider>
  );
}
