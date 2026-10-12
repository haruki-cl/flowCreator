import { useEffect, useRef, useState } from 'react';
import { limitState, SOFT_LIMITS, displayWidth } from '../../core/text';

type Props = {
  initial: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
};

/** ノード上での見出し編集。Enter / フォーカス外れで確定、Esc で取消（IME 変換中の Enter は無視） */
export function InlineTitleEditor({ initial, onCommit, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // React Flow は寸法を測るまでノードを visibility: hidden で描くため、autoFocus が効かないことがある。
  // フォーカスできるまで数フレーム再試行する
  useEffect(() => {
    let frame = 0;
    let tries = 0;
    const tryFocus = () => {
      const el = inputRef.current;
      if (!el || document.activeElement === el) return;
      el.focus();
      if (document.activeElement !== el && tries++ < 20) frame = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
  }, []);
  const finish = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (commit) onCommit(value.trim());
    else onCancel();
  };
  const state = limitState(value, SOFT_LIMITS.title);
  return (
    <div className="fc-title-editor nodrag nopan">
      <input
        className="fc-title-input"
        aria-label="見出し"
        data-testid="title-input"
        ref={inputRef}
        value={value}
        placeholder="見出し（短く）"
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
      />
      {state !== 'ok' && (
        <span className={`fc-counter is-${state}`}>
          {displayWidth(value)}/{SOFT_LIMITS.title}
        </span>
      )}
    </div>
  );
}
