import { describe, expect, it } from 'vitest';
import { shiftAt, SPREAD_GAP, spreadRows, storedY } from './spread.ts';

const node = (id: string, x: number, y: number, height = 44) => ({ id, x, y, width: 176, height });

describe('spreadRows', () => {
  it('上のノードが伸びて詰まったら、その段から下を GAP 空くまで下げる', () => {
    // a は拡大で 100px に伸びた。b は a の 20px 下にあった
    const { offsets } = spreadRows([node('a', 0, 0, 100), node('b', 0, 120), node('c', 0, 300)]);
    expect(offsets.get('a')).toBe(0);
    expect(offsets.get('b')).toBe(100 + SPREAD_GAP - 120);
    // c は b に押されて同じだけ下がる（間隔はそのまま）
    expect(offsets.get('c')).toBe(offsets.get('b'));
  });

  it('十分に離れていれば動かさない', () => {
    const { offsets } = spreadRows([node('a', 0, 0, 100), node('b', 0, 200)]);
    expect(offsets.get('b')).toBe(0);
  });

  it('同じ段のノードはそろって下がり、別の列のノードとの揃いを保つ', () => {
    const { offsets } = spreadRows([node('a', 0, 0, 120), node('b', 0, 100), node('side', 400, 100)]);
    expect(offsets.get('b')).toBe(offsets.get('side'));
    expect(offsets.get('b')).toBeGreaterThan(0);
  });

  it('別の列のノードが伸びても、その列だけの理由では下げない', () => {
    const { offsets } = spreadRows([node('tall', 400, 0, 300), node('b', 0, 100)]);
    expect(offsets.get('b')).toBe(0);
  });
});

describe('shiftAt / storedY', () => {
  const { rows } = spreadRows([node('a', 0, 0, 100), node('b', 0, 120), node('c', 0, 300)]);

  it('表示位置と保存位置を行き来できる', () => {
    for (const y of [0, 50, 120, 200, 300, 400]) {
      const display = y + shiftAt(rows, y);
      expect(storedY(rows, display)).toBeCloseTo(y);
    }
  });

  it('下げてできたすき間に置いた位置は、上の段の範囲に戻す', () => {
    const gapDisplay = 120 + 5; // b の段は 12px 下がっているので、表示 120〜132 はすき間
    const y = storedY(rows, gapDisplay);
    expect(y).toBeLessThan(120);
  });
});
