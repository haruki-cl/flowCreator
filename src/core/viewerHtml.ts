import type { FlowDocument } from './model.ts';

export const DATA_SCRIPT_PATTERN = /<script id="flowcreator-data"[^>]*>[\s\S]*?<\/script>/g;
const TITLE_PATTERN = /<title>[\s\S]*?<\/title>/;

/** <script> 内に埋め込んでも </script> や改行文字で脱出されない JSON 文字列 */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ビルド済みのビューアテンプレートにフローを埋め込み、単体で開ける HTML を返す */
export function buildViewerHtml(template: string, doc: FlowDocument): string {
  const matches = template.match(DATA_SCRIPT_PATTERN);
  if (!matches || matches.length !== 1) {
    throw new Error('ビューアのテンプレートにデータ埋め込み位置が見つかりません');
  }
  const dataTag = `<script id="flowcreator-data" type="application/json">${safeJsonForScript(doc)}</script>`;
  // replace に文字列を渡すと $& などが特殊パターンとして解釈されるため、必ず関数で返す
  let html = template.replace(DATA_SCRIPT_PATTERN, () => dataTag);
  if (TITLE_PATTERN.test(html)) {
    html = html.replace(TITLE_PATTERN, () => `<title>${escapeHtml(doc.title)}</title>`);
  }
  return html;
}
