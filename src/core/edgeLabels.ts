export const YES_LABEL = 'Yes';
export const NO_LABEL = 'No';

/** 分岐ノードから線を引いたときの自動ラベル。Yes → No → 空 の順 */
export function nextDecisionLabel(existingLabels: Array<string | undefined>): string {
  const labels = new Set(existingLabels.map((label) => label?.trim()));
  if (!labels.has(YES_LABEL)) return YES_LABEL;
  if (!labels.has(NO_LABEL)) return NO_LABEL;
  return '';
}
