import type { FlowDocument } from '../core/model';
import { createSampleDocument } from '../core/sample';

function isFlowDocument(value: unknown): value is FlowDocument {
  if (typeof value !== 'object' || value === null) return false;
  const doc = value as Partial<FlowDocument>;
  return doc.format === 'flowcreator' && Array.isArray(doc.nodes) && Array.isArray(doc.edges);
}

/** 書き出し時に埋め込まれた JSON を読む。開発時（未埋め込み）はサンプルを表示する */
export function loadEmbedded(): FlowDocument | null {
  const text = document.getElementById('flowcreator-data')?.textContent ?? 'null';
  try {
    const value: unknown = JSON.parse(text);
    if (isFlowDocument(value)) return value;
  } catch {
    return null;
  }
  return import.meta.env.DEV ? createSampleDocument() : null;
}
