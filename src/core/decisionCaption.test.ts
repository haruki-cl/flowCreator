import { describe, expect, it } from 'vitest';
import { captionRect, placeCaptions, type CaptionNode } from './decisionCaption.ts';

const decision: CaptionNode = { id: 'd', kind: 'decision', summary: '5 万円以上は部長承認が追加で必要', rect: { x: 0, y: 0, width: 200, height: 96 } };
const at = (id: string, x: number, y: number): CaptionNode => ({ id, kind: 'process', rect: { x, y, width: 176, height: 44 } });

describe('placeCaptions', () => {
  it('線が下へ出るだけなら、右に出す', () => {
    const placement = placeCaptions([decision, at('a', -200, 200), at('b', 200, 200)], [
      { source: 'd', target: 'a' },
      { source: 'd', target: 'b' },
    ]).get('d')!;
    expect(placement.side).toBe('right');
    expect(placement.rect!.x).toBeGreaterThan(200);
  });

  it('右から線が出ていれば左に出す', () => {
    const placement = placeCaptions([decision, at('yes', 400, 26)], [{ source: 'd', target: 'yes' }]).get('d')!;
    expect(placement.side).toBe('left');
    expect(placement.rect!.x + placement.rect!.width).toBeLessThan(0);
  });

  it('両側とも使えなければ菱形の中に出す', () => {
    const placement = placeCaptions([decision, at('l', -400, 26), at('r', 400, 26)], [
      { source: 'd', target: 'l' },
      { source: 'd', target: 'r' },
    ]).get('d')!;
    expect(placement).toEqual({ side: 'inside', rect: null });
  });

  it('横にほかのノードがあってはみ出す側は避ける', () => {
    const placement = placeCaptions([decision, at('near', 230, 30)], []).get('d')!;
    expect(placement.side).toBe('left');
  });

  it('要約のない分岐や、分岐以外のノードは対象外', () => {
    expect(placeCaptions([{ ...decision, summary: '' }, at('p', 0, 200)], []).size).toBe(0);
  });

  it('要約の長さで高さが変わる（3 行まで）', () => {
    const short = captionRect(decision.rect, '短い', 'right');
    const long = captionRect(decision.rect, 'とても長い要約'.repeat(10), 'right');
    expect(short.height).toBeLessThan(long.height);
    expect(long.height).toBeLessThanOrEqual(3 * 16.8 + 4);
  });
});
