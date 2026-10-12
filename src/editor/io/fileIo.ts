import type { FlowDocument } from '../../core/model';
import { parseDocumentText, type ParseResult } from '../../core/schema';
import { toDocument } from '../../core/serialize';
import { safeFileName } from '../../core/text';
import { buildViewerHtml } from '../../core/viewerHtml';
import { useDoc } from '../store/docStore';

export function downloadText(fileName: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function currentDocument(): FlowDocument {
  const { meta, nodes, edges, groups } = useDoc.getState();
  return toDocument({ ...meta, updatedAt: new Date().toISOString() }, nodes, edges, groups);
}

export function exportJson(): void {
  const doc = currentDocument();
  downloadText(`${safeFileName(doc.title)}.flow.json`, `${JSON.stringify(doc, null, 2)}\n`, 'application/json');
}

export async function readFlowFile(file: File): Promise<ParseResult> {
  return parseDocumentText(await file.text());
}

/** ビルド済みのビューアテンプレートは書き出し時にだけ読み込む（エディタ本体を軽く保つ） */
export async function exportViewerHtml(): Promise<void> {
  const { default: template } = await import('../../../build/viewer-template/viewer.html?raw');
  const doc = currentDocument();
  downloadText(`${safeFileName(doc.title)}.html`, buildViewerHtml(template, doc), 'text/html');
}
