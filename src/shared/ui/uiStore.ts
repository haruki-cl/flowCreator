import { create } from 'zustand';
import type { ZoomLevel } from '../../core/zoomLevels';

export type TargetRef = { kind: 'node' | 'edge' | 'group'; id: string };

export type HoverState = {
  key: string;
  text: string;
  rect: { top: number; left: number; width: number; height: number };
};

export type Toast = { id: number; message: string; tone: 'info' | 'warning' | 'error' };
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** 画面の一時的な状態。保存も Undo 履歴の記録もしない */
type UiState = {
  hover: HoverState | null;
  panelTarget: TargetRef | null;
  /** 選択中のグループ（枠）。React Flow の選択とは別に持つ */
  selectedGroupId: string | null;
  editingTitleId: string | null;
  zoomLevel: ZoomLevel;
  /** パン・ズーム中（ツールチップを抑止する） */
  moving: boolean;
  toast: Toast | null;
  saveState: SaveState;
  helpOpen: boolean;
  libraryOpen: boolean;
  terminalOpen: boolean;
  /** クリップボードにコピーできなかった共有リンク（ダイアログで見せて手で選んでもらう） */
  shareLinkUrl: string | null;
  setHover: (hover: HoverState | null) => void;
  openPanel: (target: TargetRef | null) => void;
  selectGroup: (id: string | null) => void;
  setEditingTitle: (id: string | null) => void;
  setZoomLevel: (level: ZoomLevel) => void;
  setMoving: (moving: boolean) => void;
  showToast: (message: string, tone?: Toast['tone']) => void;
  clearToast: () => void;
  setSaveState: (state: SaveState) => void;
  setHelpOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
  setTerminalOpen: (open: boolean) => void;
  setShareLinkUrl: (url: string | null) => void;
};

let toastSeq = 0;

export const useUi = create<UiState>()((set) => ({
  hover: null,
  panelTarget: null,
  selectedGroupId: null,
  editingTitleId: null,
  zoomLevel: 1,
  moving: false,
  toast: null,
  saveState: 'idle',
  helpOpen: false,
  libraryOpen: false,
  terminalOpen: false,
  shareLinkUrl: null,
  setHover: (hover) => set({ hover }),
  openPanel: (panelTarget) => set({ panelTarget, hover: null }),
  selectGroup: (selectedGroupId) => set({ selectedGroupId }),
  setEditingTitle: (editingTitleId) => set({ editingTitleId, hover: null }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),
  setMoving: (moving) => set(moving ? { moving, hover: null } : { moving }),
  showToast: (message, tone = 'info') => set({ toast: { id: ++toastSeq, message, tone } }),
  clearToast: () => set({ toast: null }),
  setSaveState: (saveState) => set({ saveState }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen, hover: null }),
  setTerminalOpen: (terminalOpen) => set({ terminalOpen, hover: null }),
  setShareLinkUrl: (shareLinkUrl) => set({ shareLinkUrl }),
}));
