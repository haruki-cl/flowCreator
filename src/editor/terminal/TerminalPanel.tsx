import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { fileNameFor } from '../../core/fileName';
import { CloseIcon } from '../../shared/ui/icons';
import { useUi } from '../../shared/ui/uiStore';
import { flushPending, getRepository } from '../persistence/session';
import { useDoc } from '../store/docStore';

const WIDTH_KEY = 'flowcreator:terminal-width';
const MIN_WIDTH = 320;

type Status = 'connecting' | 'running' | 'exited' | 'disconnected';

const STATUS_LABELS: Record<Status, string> = {
  connecting: '接続中…',
  running: '',
  exited: '終了しました',
  disconnected: '接続が切れました',
};

function savedWidth(): number | null {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN_WIDTH ? value : null;
  } catch {
    return null;
  }
}

/**
 * エディタの右に出す Claude Code（CLI）のターミナル。初めて開いたときに接続し、閉じても裏でつながったままにする
 * （開き直すとそのまま続きから使える）。
 */
export default function TerminalPanel({ token }: { token: string }) {
  const open = useUi((s) => s.terminalOpen);
  const setOpen = useUi((s) => s.setTerminalOpen);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<Status>('connecting');
  const [width, setWidth] = useState<number | null>(savedWidth);
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cwdRef = useRef<string>('');

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  const sendSize = () => {
    const term = termRef.current;
    const ws = wsRef.current;
    if (!term || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ t: 'r', c: term.cols, r: term.rows }));
  };

  const connect = () => {
    const term = termRef.current;
    if (!term) return;
    setStatus('connecting');
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/terminal?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;
    ws.onopen = () => {
      setStatus('running');
      sendSize();
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { t: string; d?: string; cwd?: string; code?: number };
      if (message.t === 'hello') {
        cwdRef.current = message.cwd ?? '';
        term.reset();
      }
      if (message.t === 'o' && message.d) term.write(message.d);
      if (message.t === 'exit') setStatus('exited');
    };
    ws.onclose = () => {
      if (wsRef.current === ws) setStatus((s) => (s === 'exited' ? s : 'disconnected'));
    };
  };

  // 初めて開いたときにターミナルを作って接続する
  useEffect(() => {
    if (!mounted || !hostRef.current) return;
    const term = new Terminal({
      fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Hiragino Sans", "Noto Sans JP", monospace',
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: '#1d1f23', foreground: '#e6e8eb', cursor: '#e6e8eb', selectionBackground: '#3a4250' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fit;
    fit.fit();
    term.onData((data) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d: data }));
    });
    const observer = new ResizeObserver(() => {
      if (hostRef.current?.offsetParent === null) return; // 閉じている間は測らない
      fit.fit();
      sendSize();
    });
    observer.observe(hostRef.current);
    connect();
    // 開いてすぐ入力できるよう、入力先をターミナルに移す
    requestAnimationFrame(() => term.focus());
    return () => {
      observer.disconnect();
      wsRef.current?.close();
      wsRef.current = null;
      term.dispose();
      termRef.current = null;
    };
  }, [mounted, token]);

  useEffect(() => {
    if (!open || !termRef.current) return;
    requestAnimationFrame(() => {
      fitRef.current?.fit();
      sendSize();
      termRef.current?.focus();
    });
  }, [open]);

  if (!mounted) return null;

  const restart = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      termRef.current?.reset();
      ws.send(JSON.stringify({ t: 'restart' }));
      setStatus('running');
    } else {
      connect();
    }
    termRef.current?.focus();
  };

  /** 表示中のフローのファイルを、Claude Code の入力欄に @ 付きで入れる */
  const insertCurrentFlow = async () => {
    const repo = getRepository();
    if (repo.kind !== 'files') {
      useUi.getState().showToast('ファイルに保存しているときだけ使えます（npm run dev で起動してください）', 'error');
      return;
    }
    await flushPending();
    const full = `${repo.location}/${fileNameFor(useDoc.getState().meta)}`;
    const cwd = cwdRef.current;
    const relative = cwd !== '' && full.startsWith(`${cwd}/`) ? full.slice(cwd.length + 1) : full;
    const text = /\s/.test(relative) ? `"${relative}" ` : `@${relative} `;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d: text }));
    termRef.current?.focus();
  };

  const onResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = event.currentTarget.parentElement!.getBoundingClientRect().width;
    const move = (e: globalThis.PointerEvent) => {
      const next = Math.min(window.innerWidth * 0.75, Math.max(MIN_WIDTH, startWidth + (startX - e.clientX)));
      setWidth(Math.round(next));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setWidth((w) => {
        try {
          if (w !== null) localStorage.setItem(WIDTH_KEY, String(w));
        } catch {
          // 保存できなくても使える
        }
        return w;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <aside
      className={open ? 'fc-terminal' : 'fc-terminal is-hidden'}
      style={width !== null ? { width } : undefined}
      aria-label="Claude Code"
      data-testid="terminal-panel"
      data-status={status}
    >
      <div className="fc-terminal-resize" onPointerDown={onResizeStart} aria-hidden="true" />
      <div className="fc-terminal-header">
        <strong>Claude Code</strong>
        {STATUS_LABELS[status] !== '' && <span className="fc-terminal-status">{STATUS_LABELS[status]}</span>}
        <span className="fc-spacer" />
        <button
          type="button"
          className="fc-terminal-button"
          onClick={() => void insertCurrentFlow()}
          title="表示中のフローのファイルを入力欄に入れる"
          data-testid="terminal-insert-flow"
        >
          @ このフロー
        </button>
        {(status === 'exited' || status === 'disconnected') && (
          <button type="button" className="fc-terminal-button" onClick={restart} data-testid="terminal-restart">
            {status === 'exited' ? 'もう一度起動' : '再接続'}
          </button>
        )}
        <button type="button" className="fc-terminal-icon" aria-label="閉じる（⌘J）" title="閉じる（⌘J）" onClick={() => setOpen(false)}>
          <CloseIcon />
        </button>
      </div>
      <div className="fc-terminal-body" ref={hostRef} data-testid="terminal-body" />
    </aside>
  );
}
