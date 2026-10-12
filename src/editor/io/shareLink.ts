import { encodeSharePayload, LONG_LINK_CHARS, shareUrl } from '../../core/shareLink';
import { useUi } from '../../shared/ui/uiStore';
import { flushPending } from '../persistence/session';
import { currentDocument } from './fileIo';

/** 共有リンクの宛先。受け取った人が開ける公開版を指す（開発サーバーで作ったリンクも同じ） */
export const PUBLIC_URL: string = import.meta.env.VITE_PUBLIC_URL || 'https://haruki-cl.github.io/flowCreator/';

async function buildShareUrl(): Promise<string> {
  await flushPending();
  return shareUrl(PUBLIC_URL, await encodeSharePayload(currentDocument()));
}

/**
 * クリップボードに書く。Safari はクリックの処理の中で書き込みを始めないと拒否するので、
 * リンクを作り終えるのを待たずに、中身を Promise のまま渡して書き込みを始める
 */
function writeClipboard(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = text.then((t) => new Blob([t], { type: 'text/plain' }));
    return navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
  }
  return text.then((t) => navigator.clipboard.writeText(t));
}

/** 今のフローを共有リンクにしてクリップボードにコピーする。コピーできなければダイアログで見せる（クリックの処理から直接呼ぶ） */
export async function copyShareLink(): Promise<void> {
  const url = buildShareUrl();
  let copied: Promise<boolean>;
  try {
    copied = writeClipboard(url).then(
      () => true,
      () => false,
    );
  } catch {
    copied = Promise.resolve(false);
  }
  const [link, ok] = await Promise.all([url, copied]);
  const ui = useUi.getState();
  if (!ok) {
    ui.setShareLinkUrl(link);
    return;
  }
  const length = link.length.toLocaleString();
  if (link.length > LONG_LINK_CHARS) {
    ui.showToast(
      `共有リンクをコピーしました（${length} 字）。長いので、貼り付け先によっては途中で切れることがあります。JSON や閲覧用 HTML での共有も検討してください`,
      'warning',
    );
  } else {
    ui.showToast(`共有リンクをコピーしました（${length} 字）`);
  }
}
