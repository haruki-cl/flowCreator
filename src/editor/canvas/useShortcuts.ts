import { useEffect } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { AppEdge, AppNode } from '../../core/model';
import { hoverCancel } from '../../shared/flow/hoverIntent';
import { useUi } from '../../shared/ui/uiStore';
import { useDoc } from '../store/docStore';

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

type Actions = {
  rf: ReactFlowInstance<AppNode, AppEdge>;
  layout: () => void;
  fit: () => void;
  groupSelection: () => void;
};

/** キャンバス全体のキーボード操作。入力欄にフォーカスがあるときは何もしない */
export function useShortcuts({ rf, layout, fit, groupSelection }: Actions): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const mod = e.metaKey || e.ctrlKey;
      const doc = useDoc.getState();
      const ui = useUi.getState();

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        ui.showToast('変更は自動で保存されています（⌘O で一覧）');
        return;
      }
      // ⌘J（Mac 以外は Ctrl+Shift+J）: Claude Code のターミナルを開く・閉じる。ターミナルに入力中でも効く
      if (e.key.toLowerCase() === 'j' && ((e.metaKey && !e.shiftKey) || (e.ctrlKey && e.shiftKey))) {
        if (!document.querySelector('meta[name="flowcreator-terminal-token"]')) return;
        e.preventDefault();
        ui.setTerminalOpen(!ui.terminalOpen);
        return;
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        ui.setLibraryOpen(true);
        return;
      }
      if (isEditableTarget(e.target)) return;
      if (ui.helpOpen || ui.libraryOpen) return;

      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (!e.shiftKey) {
          groupSelection();
        } else if (ui.selectedGroupId) {
          // 枠だけを外す（ノードは残す）
          doc.ungroup(ui.selectedGroupId);
          ui.selectGroup(null);
          ui.openPanel(null);
        } else {
          doc.removeFromGroup(doc.nodes.filter((n) => n.selected).map((n) => n.id));
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        hoverCancel();
        ui.openPanel(null);
        ui.selectGroup(null);
        ui.setEditingTitle(null);
        if (e.shiftKey) doc.redo();
        else doc.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        doc.redo();
        return;
      }
      if (mod || e.altKey) return;

      const selectedNodes = doc.nodes.filter((n) => n.selected);
      const selectedEdges = doc.edges.filter((edge) => edge.selected);
      const single = selectedNodes.length === 1 && selectedEdges.length === 0 ? selectedNodes[0] : null;
      const group = ui.selectedGroupId;

      // 枠を選んでいるとき
      if (group && selectedNodes.length === 0 && selectedEdges.length === 0) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          doc.ungroup(group);
          ui.selectGroup(null);
          ui.openPanel(null);
          return;
        }
        if (e.key === 'F2') {
          e.preventDefault();
          ui.openPanel(null);
          ui.setEditingTitle(group);
          return;
        }
        if (e.key === 'i' || e.key === 'I') {
          e.preventDefault();
          ui.openPanel(ui.panelTarget?.id === group ? null : { kind: 'group', id: group });
          return;
        }
      }

      switch (true) {
        case e.key === 'Enter' || e.key === 'Tab': {
          if (!single) return;
          e.preventDefault();
          const id = doc.addFromSelection(e.key === 'Enter' ? 'next' : 'branch');
          if (id) {
            ui.openPanel(null);
            ui.setEditingTitle(id);
          }
          return;
        }
        case e.key === 'F2': {
          if (!single) return;
          e.preventDefault();
          ui.openPanel(null);
          ui.setEditingTitle(single.id);
          return;
        }
        case e.key === 'i' || e.key === 'I': {
          const target = single
            ? { kind: 'node' as const, id: single.id }
            : selectedEdges.length === 1 && selectedNodes.length === 0
              ? { kind: 'edge' as const, id: selectedEdges[0].id }
              : null;
          if (!target) return;
          e.preventDefault();
          ui.openPanel(ui.panelTarget?.id === target.id ? null : target);
          return;
        }
        case e.key === 'Escape': {
          if (ui.panelTarget) {
            ui.openPanel(null);
          } else {
            doc.selectOnly(null);
            ui.selectGroup(null);
          }
          return;
        }
        case e.shiftKey && e.code === 'KeyL': {
          e.preventDefault();
          layout();
          return;
        }
        case e.shiftKey && e.code === 'Digit1': {
          e.preventDefault();
          fit();
          return;
        }
        case e.key === '+' || e.key === '=': {
          e.preventDefault();
          void rf.zoomIn({ duration: 150 });
          return;
        }
        case e.key === '-' || e.key === '_': {
          e.preventDefault();
          void rf.zoomOut({ duration: 150 });
          return;
        }
        case e.key === '?': {
          e.preventDefault();
          ui.setHelpOpen(true);
          return;
        }
      }
    };
    // パネルが開いているときの Esc はパネルを閉じるだけにする。React Flow はフォーカス中のノードで
    // Esc が押されると選択を外すので、それより先（キャプチャ段階）で受け取って止める
    const onEscapeCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || isEditableTarget(e.target)) return;
      const ui = useUi.getState();
      if (ui.helpOpen || ui.libraryOpen || !ui.panelTarget) return;
      e.stopPropagation();
      ui.openPanel(null);
    };
    window.addEventListener('keydown', onEscapeCapture, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onEscapeCapture, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [rf, layout, fit, groupSelection]);
}
