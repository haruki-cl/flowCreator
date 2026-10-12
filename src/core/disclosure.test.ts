import { describe, expect, it } from 'vitest';
import {
  DETAILS_ONLY_HINT,
  edgeTooltipText,
  groupHasHiddenContent,
  groupTooltipText,
  hasDetails,
  hasHiddenContent,
  nodeTooltipText,
} from './disclosure.ts';

describe('hasDetails', () => {
  it('空文字や空リンクは詳細とみなさない', () => {
    expect(hasDetails(undefined)).toBe(false);
    expect(hasDetails({ owner: '  ', links: [{ label: '', url: '' }] })).toBe(false);
    expect(hasDetails({ owner: '経理' })).toBe(true);
  });
});

describe('hasHiddenContent', () => {
  const summaryOnly = { summary: '要約' };
  const both = { summary: '要約', details: { notes: 'メモ' } };
  it('L0 は常に false（マーカーを出さない）', () => {
    expect(hasHiddenContent(both, 0)).toBe(false);
  });
  it('L1 は要約か詳細があれば true', () => {
    expect(hasHiddenContent(summaryOnly, 1)).toBe(true);
    expect(hasHiddenContent({}, 1)).toBe(false);
  });
  it('L2 は要約がインラインで見えるので詳細があるときだけ true', () => {
    expect(hasHiddenContent(summaryOnly, 2)).toBe(false);
    expect(hasHiddenContent(both, 2)).toBe(true);
  });
});

describe('nodeTooltipText', () => {
  it('要約 → 説明の 1 行目 → 案内文 の順にフォールバックする', () => {
    expect(nodeTooltipText({ summary: '要約' }, 1)).toBe('要約');
    expect(nodeTooltipText({ details: { description: '\n説明1\n説明2' } }, 1)).toBe('説明1');
    expect(nodeTooltipText({ details: { owner: '経理' } }, 1)).toBe(DETAILS_ONLY_HINT);
    expect(nodeTooltipText({}, 1)).toBe('');
  });
  it('L2 では要約を繰り返さない', () => {
    expect(nodeTooltipText({ summary: '要約', details: { description: '説明' } }, 2)).toBe('');
    expect(nodeTooltipText({ details: { description: '説明' } }, 2)).toBe('説明');
  });
  it('エッジは detail の 1 行目', () => {
    expect(edgeTooltipText({ detail: '一行目\n二行目' })).toBe('一行目');
    expect(edgeTooltipText(undefined)).toBe('');
  });
});

describe('groupTooltipText', () => {
  it('要約 → 説明の 1 行目。L2 では要約を繰り返さない', () => {
    expect(groupTooltipText({ summary: '要約', description: '説明\n2行目' }, 1)).toBe('要約');
    expect(groupTooltipText({ summary: '要約', description: '説明\n2行目' }, 2)).toBe('説明');
    expect(groupTooltipText({}, 1)).toBe('');
    expect(groupHasHiddenContent({ description: ' ' })).toBe(false);
    expect(groupHasHiddenContent({ summary: 'a' })).toBe(true);
  });
});
