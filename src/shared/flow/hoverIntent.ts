import { useUi } from '../ui/uiStore';

/** 最初のツールチップを出すまでの待ち時間（マウスが通り過ぎただけで出るちらつきを防ぐ） */
export const HOVER_DELAY_MS = 200;
/** ツールチップが消えてからこの時間内に別の要素へ移ったら、待たずに出す */
export const WARM_WINDOW_MS = 500;

let timer: ReturnType<typeof setTimeout> | null = null;
let lastHiddenAt = Number.NEGATIVE_INFINITY;

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * ホバー開始。ポインタのボタンが押されている間（ドラッグ・パン中）や、
 * パン・ズーム中は出さない。
 */
export function hoverStart(key: string, text: string, element: Element, event?: { buttons: number }): void {
  clearTimer();
  if (text === '') return;
  if (event && event.buttons !== 0) return;
  const show = () => {
    timer = null;
    const ui = useUi.getState();
    if (ui.moving) return;
    if (!element.isConnected) return;
    const r = element.getBoundingClientRect();
    ui.setHover({ key, text, rect: { top: r.top, left: r.left, width: r.width, height: r.height } });
  };
  const warm = useUi.getState().hover !== null || Date.now() - lastHiddenAt < WARM_WINDOW_MS;
  if (warm) show();
  else timer = setTimeout(show, HOVER_DELAY_MS);
}

export function hoverEnd(key: string): void {
  clearTimer();
  const ui = useUi.getState();
  if (ui.hover?.key === key) {
    ui.setHover(null);
    lastHiddenAt = Date.now();
  }
}

/** ドラッグ開始やクリックなど、ツールチップを確実に消したいとき */
export function hoverCancel(): void {
  clearTimer();
  const ui = useUi.getState();
  if (ui.hover !== null) {
    ui.setHover(null);
    lastHiddenAt = Date.now();
  }
}
