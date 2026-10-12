/** 表示幅の目安（全角 = 2、半角 = 1）で、見出しを短く保つための soft limit */
export const SOFT_LIMITS = {
  title: 32,
  summary: 100,
  edgeLabel: 12,
} as const;

export type LimitState = 'ok' | 'near' | 'over';

function isWide(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return width;
}

/** 表示したときの幅を em 単位で見積もる（全角 1em、半角は平均 0.56em） */
export function textWidthEm(text: string): number {
  let em = 0;
  for (const ch of text) em += isWide(ch.codePointAt(0) ?? 0) ? 1 : 0.56;
  return em;
}

export function limitState(text: string, limit: number): LimitState {
  const width = displayWidth(text);
  if (width > limit) return 'over';
  if (width > limit * 0.8) return 'near';
  return 'ok';
}

export function firstLine(text: string | undefined): string {
  if (!text) return '';
  return (text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '').trim();
}

export function isBlank(text: string | undefined): boolean {
  return !text || text.trim() === '';
}

/** ファイル名に使えない文字を除いたベース名 */
export function safeFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim();
  return cleaned === '' ? 'flow' : cleaned.slice(0, 80);
}
