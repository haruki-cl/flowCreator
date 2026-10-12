import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  type NodeChange,
} from '@xyflow/react';
import type { AppEdge, AppNode, FlowDocument, FlowGroup } from '../core/model';
import { fromDocument } from '../core/serialize';
import { EdgeDetailView, GroupDetailView, NodeDetailView } from '../shared/detail/DetailView';
import { FlowModeProvider, type FlowMode } from '../shared/flow/FlowModeContext';
import { UNTITLED } from '../shared/flow/FlowNodeView';
import { GroupFrames } from '../shared/flow/GroupFrames';
import { GroupsProvider } from '../shared/flow/groupsContext';
import { spreadForDisplay } from '../shared/flow/spreadDisplay';
import { hoverCancel } from '../shared/flow/hoverIntent';
import { TooltipLayer } from '../shared/flow/TooltipLayer';
import { edgeTypes, nodeTypes } from '../shared/flow/types';
import { ZoomLevelSync } from '../shared/flow/ZoomLevelSync';
import { CloseIcon } from '../shared/ui/icons';
import { useUi } from '../shared/ui/uiStore';

function ViewerPanel({ nodes, edges, groups }: { nodes: AppNode[]; edges: AppEdge[]; groups: FlowGroup[] }) {
  const target = useUi((s) => s.panelTarget);
  const openPanel = useUi((s) => s.openPanel);
  if (!target) return null;
  const node = target.kind === 'node' ? nodes.find((n) => n.id === target.id) : undefined;
  const edge = target.kind === 'edge' ? edges.find((e) => e.id === target.id) : undefined;
  const group = target.kind === 'group' ? groups.find((g) => g.id === target.id) : undefined;
  if (!node && !edge && !group) return null;
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.data.title || UNTITLED;
  return (
    <aside className="fc-panel" aria-label="詳細パネル" data-testid="detail-panel">
      <div className="fc-panel-header">
        <strong>{node ? '詳細' : group ? 'グループ' : '矢印の詳細'}</strong>
        <span className="fc-spacer" />
        <button
          type="button"
          className="fc-icon-button"
          aria-label="閉じる"
          onClick={() => {
            openPanel(null);
            useUi.getState().selectGroup(null);
          }}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="fc-panel-body">
        {node && <NodeDetailView data={node.data} />}
        {edge && <EdgeDetailView data={edge.data} from={titleOf(edge.source)} to={titleOf(edge.target)} />}
        {group && (
          <GroupDetailView
            group={group}
            memberTitles={nodes.filter((n) => n.data.groupId === group.id).map((n) => n.data.title || UNTITLED)}
          />
        )}
      </div>
    </aside>
  );
}

function Viewer({ doc }: { doc: FlowDocument }) {
  const initial = useMemo(() => fromDocument(doc), [doc]);
  const { edges, groups } = initial;
  // 拡大表示で位置を広げるには計測した大きさが要るので、ノードは自前で持つ（位置は変えない）
  const [nodes, setNodes] = useState<AppNode[]>(initial.nodes);
  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns)), []);
  const zoomLevel = useUi((s) => s.zoomLevel);
  const displayNodes = useMemo(() => (zoomLevel === 2 ? spreadForDisplay(nodes) : nodes), [nodes, zoomLevel]);
  const flowMode = useMemo<FlowMode>(() => ({ mode: 'view', openDetail: (target) => useUi.getState().openPanel(target) }), []);

  useEffect(() => {
    document.title = doc.title;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        useUi.getState().openPanel(null);
        useUi.getState().selectGroup(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc.title]);

  return (
    <FlowModeProvider value={flowMode}>
      <GroupsProvider value={groups}>
        <div className="fc-app">
          <div className="fc-canvas fc-mode-view" data-zoom-level={zoomLevel} data-testid="canvas">
            <ReactFlow<AppNode, AppEdge>
              nodes={displayNodes}
              onNodesChange={onNodesChange}
              defaultEdges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              // ハンドルはすべて source 型なので、Loose でないとエッジの端点が決まらず描画されない
              connectionMode={ConnectionMode.Loose}
              edgesFocusable={false}
              deleteKeyCode={null}
              zoomOnDoubleClick={false}
              onNodeClick={(_, node) => {
                hoverCancel();
                useUi.getState().selectGroup(null);
                useUi.getState().openPanel({ kind: 'node', id: node.id });
              }}
              onEdgeClick={(_, edge) => {
                hoverCancel();
                useUi.getState().selectGroup(null);
                useUi.getState().openPanel({ kind: 'edge', id: edge.id });
              }}
              onPaneClick={() => {
                useUi.getState().openPanel(null);
                useUi.getState().selectGroup(null);
              }}
              onMoveStart={() => useUi.getState().setMoving(true)}
              onMoveEnd={() => useUi.getState().setMoving(false)}
              minZoom={0.2}
              maxZoom={2.5}
              elevateNodesOnSelect={false}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              colorMode="system"
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
              <ZoomLevelSync />
              <GroupFrames
                groups={groups}
                mode="view"
                onSelect={(groupId) => {
                  useUi.getState().selectGroup(groupId);
                  useUi.getState().openPanel({ kind: 'group', id: groupId });
                }}
              />
            </ReactFlow>
          </div>
          <div className="fc-topbar is-left fc-viewer-title">
            <strong data-testid="viewer-title">{doc.title}</strong>
            <span className="fc-muted fc-viewer-hint">ホバーで要約 ・ クリックで詳細 ・ 拡大で表示量が増えます</span>
          </div>
          <ViewerPanel nodes={nodes} edges={edges} groups={groups} />
          <TooltipLayer />
        </div>
      </GroupsProvider>
    </FlowModeProvider>
  );
}

export function ViewerApp({ doc }: { doc: FlowDocument | null }) {
  if (!doc) {
    return <div className="fc-empty-hint">表示するフローがありません</div>;
  }
  return (
    <ReactFlowProvider>
      <Viewer doc={doc} />
    </ReactFlowProvider>
  );
}
