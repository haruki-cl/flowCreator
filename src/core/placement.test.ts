import { describe, expect, it } from 'vitest';
import { rectsOverlap } from './geometry.ts';
import { OVERLAP_GAP, placeNewNode, resolveOverlap } from './placement.ts';

const from = { x: 0, y: 0, width: 176, height: 44 };
const size = { width: 176, height: 44 };

describe('placeNewNode', () => {
  it('next は真下、branch は右に置く', () => {
    const next = placeNewNode(from, size, 'next', [from]);
    expect(next.x).toBe(0);
    expect(next.y).toBeGreaterThan(44);
    const branch = placeNewNode(from, size, 'branch', [from]);
    expect(branch.x).toBeGreaterThan(176);
    expect(branch.y).toBe(0);
  });

  it('既存ノードと重なる位置を避ける', () => {
    const blocker = { x: 0, y: 108, width: 176, height: 44 };
    const pos = placeNewNode(from, size, 'next', [from, blocker]);
    expect(rectsOverlap({ ...pos, ...size }, blocker)).toBe(false);
  });
});

describe('resolveOverlap', () => {
  const box = (x: number, y: number, width = 176, height = 44) => ({ x, y, width, height });

  it('重なっていなければ動かさない', () => {
    expect(resolveOverlap([box(0, 0)], [box(0, 200)])).toEqual({ dx: 0, dy: 0 });
  });

  it('重なっていたら、一番近い押し出し方向へずらす', () => {
    // 少しだけ下に重ねた → 下へ押し出すのが一番近い
    const r = resolveOverlap([box(10, 30)], [box(0, 0)]);
    expect(r.dx).toBe(0);
    expect(r.dy).toBeGreaterThan(0);
    const moved = box(10 + r.dx, 30 + r.dy);
    expect(rectsOverlap(moved, box(0, 0), OVERLAP_GAP)).toBe(false);
    expect(r.dy).toBeLessThan(60);
  });

  it('押し出した先にも別のノードがあれば、さらに空いている位置を探す', () => {
    const obstacles = [box(0, 0), box(0, 70), box(0, -70)];
    const r = resolveOverlap([box(0, 10)], obstacles);
    const moved = box(r.dx, 10 + r.dy);
    for (const o of obstacles) expect(rectsOverlap(moved, o, OVERLAP_GAP)).toBe(false);
  });

  it('複数のノードは、ひとかたまりのまま同じだけずらす', () => {
    const moving = [box(0, 0), box(0, 80)];
    const obstacles = [box(20, 90)];
    const r = resolveOverlap(moving, obstacles);
    for (const m of moving) {
      expect(rectsOverlap({ ...m, x: m.x + r.dx, y: m.y + r.dy }, obstacles[0], OVERLAP_GAP)).toBe(false);
    }
  });
});
