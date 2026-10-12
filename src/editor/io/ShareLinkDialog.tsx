import { useEffect, useRef } from 'react';
import { LONG_LINK_CHARS } from '../../core/shareLink';
import { useUi } from '../../shared/ui/uiStore';

/** クリップボードにコピーできなかったとき、共有リンクを選択した状態で見せる */
export function ShareLinkDialog() {
  const url = useUi((s) => s.shareLinkUrl);
  const close = () => useUi.getState().setShareLinkUrl(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!url) return;
    ref.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [url]);

  if (!url) return null;
  return (
    <div className="fc-dialog-backdrop" onClick={close}>
      <div className="fc-dialog" role="dialog" aria-modal="true" aria-label="共有リンク" onClick={(e) => e.stopPropagation()}>
        <h2>共有リンク</h2>
        <p className="fc-muted" style={{ marginTop: 0 }}>
          自動でコピーできなかったので、下のリンクをコピーしてください（{url.length.toLocaleString()} 字）。
          {url.length > LONG_LINK_CHARS && ' 長いので、貼り付け先によっては途中で切れることがあります。'}
        </p>
        <textarea ref={ref} className="fc-share-url" readOnly value={url} data-testid="share-url" onFocus={(e) => e.currentTarget.select()} />
        <div className="fc-dialog-actions">
          <button type="button" className="fc-text-button" onClick={close}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
