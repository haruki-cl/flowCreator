import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { createDocument } from '../core/factory';
import type { FlowDocument } from '../core/model';
import type { ParseResult } from '../core/schema';
import { createSampleDocument } from '../core/sample';
import { TooltipLayer } from '../shared/flow/TooltipLayer';
import { ToastView } from '../shared/ui/Toast';
import { ListIcon, TerminalIcon } from '../shared/ui/icons';
import { useUi, type SaveState } from '../shared/ui/uiStore';
import { EditorCanvas, useCanvasActions } from './canvas/EditorCanvas';
import { ShortcutsDialog } from './help/ShortcutsDialog';
import { exportJson, exportViewerHtml, readFlowFile } from './io/fileIo';
import { copyShareLink } from './io/shareLink';
import { ShareLinkDialog } from './io/ShareLinkDialog';
import { FlowListDialog } from './library/FlowListDialog';
import { DetailPanel } from './panel/DetailPanel';
import { startAutosave } from './persistence/autosave';
import {
  asNewDocument,
  attachAutosave,
  handleExternalChange,
  initSession,
  persist,
  switchDocument,
  takeSharedLink,
} from './persistence/session';
import { useDoc } from './store/docStore';
import { terminalToken } from './terminal/terminalToken';

// ターミナル（xterm.js）は大きいので、開いたときだけ読み込む
const TerminalPanel = lazy(() => import('./terminal/TerminalPanel'));
import { Toolbar } from './toolbar/Toolbar';

/** ターミナル（Claude Code）は開発サーバーで開いたときだけ使える */
const TERMINAL_TOKEN = terminalToken();

const SHARED_OPENED = '共有リンクのフローを開きました（このブラウザに保存されます）';

/** 共有リンクを開けたか知らせる（開けなかったときは、いつものフローのまま） */
function notifyShared(shared: ParseResult): void {
  if (shared.ok) useUi.getState().showToast(SHARED_OPENED);
  else useUi.getState().showToast(`共有リンクを開けませんでした: ${shared.error}`, 'error');
}

const SAVE_LABELS: Record<SaveState, string> = {
  idle: '',
  saving: '保存中…',
  saved: '保存済み',
  error: '保存できませんでした',
};

function TitleBar() {
  const title = useDoc((s) => s.meta.title);
  const renameFlow = useDoc((s) => s.renameFlow);
  const saveState = useUi((s) => s.saveState);
  const terminalOpen = useUi((s) => s.terminalOpen);
  return (
    <div className="fc-topbar is-right">
      <button
        type="button"
        className="fc-icon-button"
        aria-label="保存したフロー（⌘O）"
        title="保存したフロー（⌘O）"
        data-testid="open-library"
        onClick={() => useUi.getState().setLibraryOpen(true)}
      >
        <ListIcon />
      </button>
      <input
        className="fc-flow-title"
        aria-label="フロー名"
        data-testid="flow-title"
        value={title}
        onChange={(e) => renameFlow(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
        }}
      />
      <span className="fc-save-state" data-testid="save-state" data-save-state={saveState}>
        {SAVE_LABELS[saveState]}
      </span>
      {TERMINAL_TOKEN && (
        <button
          type="button"
          className={terminalOpen ? 'fc-icon-button is-active' : 'fc-icon-button'}
          aria-label="Claude Code（⌘J）"
          title="Claude Code（⌘J）"
          data-testid="toggle-terminal"
          onClick={() => useUi.getState().setTerminalOpen(!terminalOpen)}
        >
          <TerminalIcon />
        </button>
      )}
    </div>
  );
}

function EmptyHint() {
  const empty = useDoc((s) => s.nodes.length === 0);
  if (!empty) return null;
  return (
    <div className="fc-empty-hint" data-testid="empty-hint">
      ダブルクリックでノードを追加 ・ <span className="fc-kbd">?</span> で使い方
    </div>
  );
}

function Editor() {
  const { fit, layout, addAtScreenPoint } = useCanvasActions();
  const terminalOpen = useUi((s) => s.terminalOpen);
  const [terminalRequested, setTerminalRequested] = useState(false);
  useEffect(() => {
    if (terminalOpen) setTerminalRequested(true);
  }, [terminalOpen]);
  const fileInput = useRef<HTMLInputElement>(null);

  // 読み込み直後はアニメーションせずに全体を表示する
  const fitAfterOpen = () => requestAnimationFrame(() => fit(0));

  /** 新しいフローとして開く。今のフローは保存されたまま「保存したフロー」に残る */
  const openAsNew = async (doc: FlowDocument) => {
    await switchDocument(doc, 'new');
    fitAfterOpen();
  };

  const importFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const result = await readFlowFile(file);
    if (!result.ok) {
      useUi.getState().showToast(`読み込めませんでした: ${result.error}`, 'error');
      return;
    }
    await openAsNew(await asNewDocument(result.doc));
    useUi.getState().showToast(`「${result.doc.title}」を読み込みました`);
  };

  // 開いている画面のアドレスバーに共有リンクを貼ったとき（# 以降だけが変わるので、ページは読み込み直されない）
  useEffect(() => {
    const onHashChange = async () => {
      const shared = await takeSharedLink();
      if (!shared) return;
      if (shared.ok) {
        await switchDocument(shared.doc, 'new');
        requestAnimationFrame(() => fit(0));
      }
      notifyShared(shared);
    };
    const listener = () => void onHashChange();
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, [fit]);

  const addAtCenter = (kind: Parameters<typeof addAtScreenPoint>[0]) => {
    addAtScreenPoint(kind, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  };

  return (
    <div className="fc-app fc-layout">
      <div className="fc-main">
        <EditorCanvas onFilesDropped={(files) => void importFiles(files)} />
        <Toolbar
          onAdd={addAtCenter}
          onLayout={layout}
          onFit={() => fit()}
          menu={[
            {
              label: '保存したフロー…',
              kbd: '⌘O',
              onSelect: () => useUi.getState().setLibraryOpen(true),
              testId: 'menu-library',
            },
            { label: '新しいフロー', onSelect: () => void openAsNew(createDocument()), testId: 'menu-new' },
            { label: 'サンプルを開く', onSelect: () => void openAsNew(createSampleDocument()), testId: 'menu-sample' },
            'separator',
            {
              label: '共有リンクをコピー',
              testId: 'menu-share-link',
              onSelect: () =>
                void copyShareLink().catch(() => useUi.getState().showToast('共有リンクを作れませんでした', 'error')),
            },
            { label: 'JSON を書き出す', onSelect: exportJson, testId: 'menu-export-json' },
            { label: 'JSON を読み込む…', onSelect: () => fileInput.current?.click(), testId: 'menu-import-json' },
            {
              label: '閲覧用 HTML を書き出す',
              testId: 'menu-export-viewer',
              onSelect: () =>
                void exportViewerHtml().catch(() => useUi.getState().showToast('閲覧用 HTML を作れませんでした', 'error')),
            },
            'separator',
            { label: '使い方とショートカット', kbd: '?', onSelect: () => useUi.getState().setHelpOpen(true) },
          ]}
        />
        <TitleBar />
        <EmptyHint />
        <DetailPanel />
      </div>
      {TERMINAL_TOKEN && terminalRequested && (
        <Suspense fallback={null}>
          <TerminalPanel token={TERMINAL_TOKEN} />
        </Suspense>
      )}
      <TooltipLayer />
      <ToastView />
      <ShortcutsDialog />
      <FlowListDialog onOpened={fitAfterOpen} />
      <ShareLinkDialog />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="import-input"
        onChange={(e) => {
          void importFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initSession()
      .then(({ doc, migrated, shared }) => {
        if (cancelled) return;
        if (doc) useDoc.getState().loadDocument(doc);
        if (migrated > 0) useUi.getState().showToast(`ブラウザ内に保存していた ${migrated} 件のフローをファイルにコピーしました`);
        if (shared) notifyShared(shared);
      })
      .catch((error: unknown) => {
        console.error('[flowCreator] 起動時の読み込みに失敗しました', error);
        useUi.getState().showToast('前回のフローを読み込めませんでした', 'error');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // AI などがフローのファイルを書き換えたら、開いている画面に取り込む（開発サーバーから通知が来る）
  useEffect(() => {
    if (!ready || !import.meta.hot) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChanged = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void handleExternalChange(), 150);
    };
    import.meta.hot.on('flowcreator:flows-changed', onChanged);
    return () => {
      if (timer !== null) clearTimeout(timer);
      import.meta.hot?.off('flowcreator:flows-changed', onChanged);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const autosave = startAutosave(useDoc, persist, (status) => {
      const ui = useUi.getState();
      ui.setSaveState(status);
      if (status === 'error') ui.showToast('保存できませんでした。JSON を書き出してバックアップしてください', 'error');
    });
    attachAutosave(autosave);
    const flush = () => {
      if (document.visibilityState === 'hidden') void autosave.flush();
    };
    document.addEventListener('visibilitychange', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      attachAutosave(null);
      autosave.stop();
    };
  }, [ready]);

  if (!ready) return <div className="fc-app" />;
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
