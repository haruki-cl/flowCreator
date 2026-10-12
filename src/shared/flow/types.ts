import type { EdgeTypes, NodeTypes } from '@xyflow/react';
import { FloatingEdge } from './FloatingEdge';
import { FlowNodeView } from './FlowNodeView';

// コンポーネント外で定義して参照を固定する（毎回作ると React Flow が警告する）
export const nodeTypes: NodeTypes = { flow: FlowNodeView };
export const edgeTypes: EdgeTypes = { flow: FloatingEdge };
