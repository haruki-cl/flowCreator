import type { FlowDocument } from './model.ts';
import { safeFileName } from './text.ts';

export const FLOW_FILE_SUFFIX = '.flow.json';

/** フローのファイル名。人が見て分かるようフロー名 + ID にする（同じ名前のフローがあっても衝突しない） */
export function fileNameFor(doc: Pick<FlowDocument, 'id' | 'title'>): string {
  return `${safeFileName(doc.title)}__${doc.id}${FLOW_FILE_SUFFIX}`;
}
