import type { FlowEdgeData, FlowGroup, FlowNodeData, NodeDetails } from './model.ts';
import type { ZoomLevel } from './zoomLevels.ts';
import { firstLine, isBlank } from './text.ts';

export function hasDetails(details: NodeDetails | undefined): boolean {
  if (!details) return false;
  return (
    !isBlank(details.description) ||
    !isBlank(details.owner) ||
    !isBlank(details.conditions) ||
    !isBlank(details.notes) ||
    (details.links ?? []).some((link) => !isBlank(link.url) || !isBlank(link.label))
  );
}

/** 今の表示段階で、画面に出ていない情報があるか（「•」マーカーの表示条件） */
export function hasHiddenContent(data: Pick<FlowNodeData, 'summary' | 'details'>, level: ZoomLevel): boolean {
  if (level === 0) return false;
  if (level === 2) return hasDetails(data.details);
  return !isBlank(data.summary) || hasDetails(data.details);
}

export const DETAILS_ONLY_HINT = '詳細あり（クリックで表示）';

/** ホバー時に出す 1〜2 行。要約 → 説明の 1 行目 → 詳細ありの案内 の順 */
export function nodeTooltipText(data: Pick<FlowNodeData, 'summary' | 'details'>, level: ZoomLevel): string {
  const summary = data.summary?.trim() ?? '';
  // L2 では要約がインラインで見えているので、要約をツールチップで繰り返さない
  if (summary !== '' && level !== 2) return summary;
  if (summary !== '' && level === 2) return '';
  const description = firstLine(data.details?.description);
  if (description !== '') return description;
  return hasDetails(data.details) ? DETAILS_ONLY_HINT : '';
}

export function edgeTooltipText(data: FlowEdgeData | undefined): string {
  return firstLine(data?.detail);
}

export function groupHasHiddenContent(group: Pick<FlowGroup, 'summary' | 'description'>): boolean {
  return !isBlank(group.summary) || !isBlank(group.description);
}

/** 枠の名前にホバーしたときの 1〜2 行。L2 では要約が名前の横に出ているので説明の 1 行目を出す */
export function groupTooltipText(group: Pick<FlowGroup, 'summary' | 'description'>, level: ZoomLevel): string {
  const summary = group.summary?.trim() ?? '';
  if (summary !== '' && level !== 2) return summary;
  return firstLine(group.description);
}
