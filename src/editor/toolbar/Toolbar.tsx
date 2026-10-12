import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NODE_KIND_LABELS, NODE_KINDS, type NodeKind } from '../../core/model';
import { FitIcon, LayoutIcon, MoreIcon, PlusIcon } from '../../shared/ui/icons';

export const KIND_DRAG_MIME = 'application/x-flowcreator-kind';

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export type ToolbarProps = {
  onAdd: (kind: NodeKind) => void;
  onLayout: () => void;
  onFit: () => void;
  menu: Array<{ label: string; onSelect: () => void; kbd?: string; testId?: string } | 'separator'>;
};

/** 常時表示するのはこの 4 ボタンだけ */
export function Toolbar({ onAdd, onLayout, onFit, menu }: ToolbarProps) {
  const add = usePopover();
  const more = usePopover();

  return (
    <div className="fc-topbar is-left" data-testid="toolbar">
      <div className="fc-add-wrap" ref={add.ref}>
        <ToolButton label="ノードを追加" active={add.open} onClick={() => add.setOpen(!add.open)} testId="tool-add">
          <PlusIcon />
        </ToolButton>
        {add.open && (
          <div className="fc-popover" role="menu">
            {NODE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="menuitem"
                className="fc-menu-item fc-drag-kind"
                draggable
                data-testid={`add-${kind}`}
                onDragStart={(e) => {
                  e.dataTransfer.setData(KIND_DRAG_MIME, kind);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onDragEnd={() => add.setOpen(false)}
                onClick={() => {
                  onAdd(kind);
                  add.setOpen(false);
                }}
              >
                <span className={`fc-kind-icon kind-${kind}`} />
                {NODE_KIND_LABELS[kind]}
              </button>
            ))}
            <div className="fc-menu-hint">クリックで中央に追加・ドラッグで配置</div>
          </div>
        )}
      </div>
      <ToolButton label="自動整列 (Shift+L)" onClick={onLayout} testId="tool-layout">
        <LayoutIcon />
      </ToolButton>
      <ToolButton label="全体を表示 (Shift+1)" onClick={onFit} testId="tool-fit">
        <FitIcon />
      </ToolButton>
      <div className="fc-add-wrap" ref={more.ref}>
        <ToolButton label="その他" active={more.open} onClick={() => more.setOpen(!more.open)} testId="tool-more">
          <MoreIcon />
        </ToolButton>
        {more.open && (
          <div className="fc-popover" role="menu">
            {menu.map((item, index) =>
              item === 'separator' ? (
                <div key={`sep-${index}`} className="fc-menu-sep" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className="fc-menu-item"
                  data-testid={item.testId}
                  onClick={() => {
                    more.setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.label}
                  {item.kbd && <span className="fc-kbd">{item.kbd}</span>}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  active,
  testId,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`fc-icon-button ${active ? 'is-active' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      data-testid={testId}
      data-toolbar-button=""
    >
      {children}
    </button>
  );
}
