import { useEffect } from 'react';
import { useUi } from './uiStore';

export const TOAST_MS = 2000;

/** 通常のお知らせは 2 秒で消える。エラーは閉じるまで残す */
export function ToastView() {
  const toast = useUi((s) => s.toast);
  const clearToast = useUi((s) => s.clearToast);

  useEffect(() => {
    if (!toast || toast.tone === 'error') return;
    const timer = setTimeout(clearToast, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;
  return (
    <div className={`fc-toast ${toast.tone === 'error' ? 'is-error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'} data-testid="toast">
      <span>{toast.message}</span>
      <button type="button" aria-label="閉じる" onClick={clearToast}>
        ✕
      </button>
    </div>
  );
}
