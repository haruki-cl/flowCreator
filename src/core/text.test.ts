import { describe, expect, it } from 'vitest';
import { displayWidth, firstLine, limitState, safeFileName } from './text.ts';

describe('displayWidth', () => {
  it('全角を 2、半角を 1 として数える', () => {
    expect(displayWidth('abc')).toBe(3);
    expect(displayWidth('あいう')).toBe(6);
    expect(displayWidth('経費A')).toBe(5);
    expect(displayWidth('ＡＢ')).toBe(4);
  });
});

describe('limitState', () => {
  it('80% 超で near、上限超で over', () => {
    expect(limitState('a'.repeat(25), 32)).toBe('ok');
    expect(limitState('a'.repeat(26), 32)).toBe('near');
    expect(limitState('a'.repeat(32), 32)).toBe('near');
    expect(limitState('a'.repeat(33), 32)).toBe('over');
    expect(limitState('あ'.repeat(17), 32)).toBe('over');
  });
});

describe('firstLine', () => {
  it('最初の空でない行を返す', () => {
    expect(firstLine('\n  一行目 \n二行目')).toBe('一行目');
    expect(firstLine(undefined)).toBe('');
  });
});

describe('safeFileName', () => {
  it('使えない文字を除く', () => {
    expect(safeFileName('a/b:c?')).toBe('abc');
    expect(safeFileName('  ')).toBe('flow');
  });
});
