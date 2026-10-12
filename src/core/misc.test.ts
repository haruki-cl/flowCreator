import { describe, expect, it } from 'vitest';
import { nextDecisionLabel } from './edgeLabels.ts';
import { floatingEdgeParams } from './geometry.ts';
import { safeUrl } from './links.ts';

describe('nextDecisionLabel', () => {
  it('Yes → No → 空', () => {
    expect(nextDecisionLabel([])).toBe('Yes');
    expect(nextDecisionLabel(['Yes'])).toBe('No');
    expect(nextDecisionLabel(['No'])).toBe('Yes');
    expect(nextDecisionLabel(['Yes', 'No'])).toBe('');
  });
});

describe('safeUrl', () => {
  it('http(s) と mailto だけを許可する', () => {
    expect(safeUrl('https://example.com')).toBe('https://example.com');
    expect(safeUrl('mailto:a@example.com')).toBe('mailto:a@example.com');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl(' JavaScript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('/relative')).toBeNull();
  });
});

describe('floatingEdgeParams', () => {
  const a = { x: 0, y: 0, width: 100, height: 40 };
  it('縦に並んでいれば下辺 → 上辺', () => {
    const p = floatingEdgeParams(a, { x: 0, y: 200, width: 100, height: 40 });
    expect([p.sourcePosition, p.targetPosition]).toEqual(['bottom', 'top']);
    expect([p.sx, p.sy, p.tx, p.ty]).toEqual([50, 40, 50, 200]);
  });
  it('横に並んでいれば右辺 → 左辺', () => {
    const p = floatingEdgeParams(a, { x: 300, y: 20, width: 100, height: 40 });
    expect([p.sourcePosition, p.targetPosition]).toEqual(['right', 'left']);
    const back = floatingEdgeParams({ x: 300, y: 20, width: 100, height: 40 }, a);
    expect([back.sourcePosition, back.targetPosition]).toEqual(['left', 'right']);
  });
  it('斜め下にあれば、横に離れていても下辺 → 上辺', () => {
    const p = floatingEdgeParams({ x: 300, y: 0, width: 100, height: 40 }, { x: 0, y: 120, width: 100, height: 40 });
    expect([p.sourcePosition, p.targetPosition]).toEqual(['bottom', 'top']);
  });
});
