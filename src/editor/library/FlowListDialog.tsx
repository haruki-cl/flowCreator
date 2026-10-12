import { useCallback, useEffect, useState } from 'react';
import { createDocument } from '../../core/factory';
import { TrashIcon } from '../../shared/ui/icons';
import { useUi } from '../../shared/ui/uiStore';
import type { FlowSummary } from '../persistence/repository';
import { flushPending, getRepository, onFlowsChanged, switchDocument } from '../persistence/session';
import { useDoc } from '../store/docStore';

const dateFormat = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

/** ブラウザに保存してあるフローの一覧。ここから開く・新しく作る・削除する */
export function FlowListDialog({ onOpened }: { onOpened: () => void }) {
  const open = useUi((s) => s.libraryOpen);
  const setOpen = useUi((s) => s.setLibraryOpen);
  const currentId = useDoc((s) => s.meta.id);
  const [flows, setFlows] = useState<FlowSummary[] | null>(null);

  const refresh = useCallback(async () => {
    // 編集中の変更を保存してから一覧を作る（名前や更新日時を最新にするため）
    await flushPending();
    setFlows(await getRepository().list());
  }, []);

  useEffect(() => {
    if (!open) {
      setFlows(null);
      return;
    }
    void refresh();
    const unsubscribe = onFlowsChanged(() => void refresh());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      unsubscribe();
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, refresh, setOpen]);

  if (!open) return null;
  const repository = getRepository();

  const openFlow = async (id: string) => {
    if (id === currentId) {
      setOpen(false);
      return;
    }
    const doc = await getRepository().load(id);
    if (!doc) {
      useUi.getState().showToast('このフローは読み込めませんでした', 'error');
      return;
    }
    await switchDocument(doc, 'saved');
    setOpen(false);
    onOpened();
  };

  const createNew = async () => {
    await switchDocument(createDocument(), 'new');
    setOpen(false);
    onOpened();
  };

  const remove = async (flow: FlowSummary) => {
    if (!window.confirm(`「${flow.title}」を削除します。元に戻せません。よろしいですか？`)) return;
    await getRepository().remove(flow.id);
    await refresh();
  };

  return (
    <div className="fc-dialog-backdrop" onClick={() => setOpen(false)}>
      <div
        className="fc-dialog fc-library"
        role="dialog"
        aria-modal="true"
        aria-label="保存したフロー"
        data-testid="library"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fc-library-header">
          <h2>保存したフロー</h2>
          <button type="button" className="fc-text-button is-primary" onClick={() => void createNew()} data-testid="library-new">
            + 新しいフロー
          </button>
        </div>
        <p className="fc-muted fc-library-note" data-testid="library-location">
          {repository.kind === 'files' ? (
            <>
              自動で JSON ファイルとして保存しています: <code className="fc-path">{repository.location}</code>
            </>
          ) : (
            <>このブラウザの中に自動で保存しています（npm run dev で起動すると flows/ フォルダに保存されます）。</>
          )}
        </p>
        {flows === null ? (
          <p className="fc-muted">読み込み中…</p>
        ) : flows.length === 0 ? (
          <p className="fc-muted">保存したフローはまだありません</p>
        ) : (
          <ul className="fc-library-list">
            {flows.map((flow) => {
              const current = flow.id === currentId;
              return (
                <li key={flow.id} className={current ? 'is-current' : undefined} data-testid="library-item">
                  <button type="button" className="fc-library-open" onClick={() => void openFlow(flow.id)}>
                    <span className="fc-library-title">{flow.title.trim() === '' ? '（無題のフロー）' : flow.title}</span>
                    <span className="fc-library-meta">
                      {current && <span className="fc-library-badge">編集中</span>}
                      ノード {flow.nodeCount} ・ {formatDate(flow.updatedAt)}
                    </span>
                  </button>
                  {!current && (
                    <button
                      type="button"
                      className="fc-icon-button"
                      aria-label={`「${flow.title}」を削除`}
                      title="削除"
                      onClick={() => void remove(flow)}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="fc-dialog-actions">
          <button type="button" className="fc-text-button" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
