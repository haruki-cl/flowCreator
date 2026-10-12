import { createContext, useContext } from 'react';
import type { TargetRef } from '../ui/uiStore';

export type FlowMode = {
  mode: 'edit' | 'view';
  /** ラベルや「•」など、React Flow のクリック判定の外にある要素から詳細を開く */
  openDetail: (target: TargetRef) => void;
  /** インライン編集の確定（edit モードのみ） */
  commitTitle?: (id: string, title: string) => void;
};

const FlowModeContext = createContext<FlowMode>({ mode: 'view', openDetail: () => {} });

export const FlowModeProvider = FlowModeContext.Provider;

export function useFlowMode(): FlowMode {
  return useContext(FlowModeContext);
}
