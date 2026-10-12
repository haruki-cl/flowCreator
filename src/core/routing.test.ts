import { describe, expect, it } from 'vitest';
import { directRoute, polylineHits, roundedPath, routeEdge, ROUTE_MARGIN, runsAlongFrames, separateOverlaps } from './routing.ts';

const box = (x: number, y: number, width = 176, height = 44) => ({ x, y, width, height });
const inflate = (r: ReturnType<typeof box>, m: number) => ({ x: r.x - m, y: r.y - m, width: r.width + m * 2, height: r.height + m * 2 });

function expectOrthogonal(points: { x: number; y: number }[]) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    expect(a.x === b.x || a.y === b.y).toBe(true);
  }
}

describe('routeEdge', () => {
  it('間に何もなければ、これまでどおり向かい合う辺を真ん中で折れてつなぐ', () => {
    const route = routeEdge(box(0, 0), box(200, 200), [box(600, 600)]);
    expect(route).toEqual({ points: directRoute(box(0, 0), box(200, 200)).points, label: directRoute(box(0, 0), box(200, 200)).label });
    expect(routeEdge(box(0, 0), box(0, 200), []).points).toEqual([
      { x: 88, y: 44 },
      { x: 88, y: 200 },
    ]);
  });

  it('間にノードがあれば、すき間を空けて避ける', () => {
    const source = box(0, 0);
    const target = box(0, 300);
    const middle = box(0, 150);
    const route = routeEdge(source, target, [middle]);
    expectOrthogonal(route.points);
    expect(polylineHits(route.points, [inflate(middle, ROUTE_MARGIN - 1)])).toBe(false);
    // 始点・終点はノードの辺の上
    expect(route.points[0].y === 44 || route.points[0].x === 0 || route.points[0].x === 176).toBe(true);
    const end = route.points[route.points.length - 1];
    expect(end.y === 300 || end.x === 0 || end.x === 176).toBe(true);
    // ラベルもノードに重ならない
    const l = route.label;
    expect(l.x > middle.x && l.x < middle.x + middle.width && l.y > middle.y && l.y < middle.y + middle.height).toBe(false);
  });

  it('いくつものノードの間を抜ける経路も見つける', () => {
    const others = [box(-100, 150), box(150, 150), box(0, 230, 60, 30)];
    const route = routeEdge(box(0, 0), box(0, 400), others);
    expectOrthogonal(route.points);
    expect(polylineHits(route.points, others.map((o) => inflate(o, ROUTE_MARGIN - 1)))).toBe(false);
  });

  it('同じ入力からは同じ経路になる', () => {
    const args = [box(0, 0), box(300, 300), [box(100, 120), box(250, 60)]] as const;
    expect(routeEdge(...args)).toEqual(routeEdge(...args));
  });
});

describe('roundedPath', () => {
  it('角を丸めた SVG パスにする', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 50, y: 50 }])).toBe('M 0 0 L 0 42 Q 0 50 8 50 L 50 50');
  });
});

describe('separateOverlaps', () => {
  const rect = (x: number, y: number, width = 176, height = 44) => ({ rect: { x, y, width, height }, shape: 'rect' as const });
  const diamond = (x: number, y: number) => ({ rect: { x, y, width: 200, height: 96 }, shape: 'diamond' as const });

  function sharedLength(a: { x: number; y: number }[], b: { x: number; y: number }[]): number {
    let total = 0;
    for (let i = 0; i < a.length - 1; i++) {
      for (let j = 0; j < b.length - 1; j++) {
        const [p, q, r, s] = [a[i], a[i + 1], b[j], b[j + 1]];
        if (p.x === q.x && r.x === s.x && p.x === r.x) {
          total += Math.max(0, Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)));
        }
        if (p.y === q.y && r.y === s.y && p.y === r.y) {
          total += Math.max(0, Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)));
        }
      }
    }
    return total;
  }

  it('2 本が合流して同じ辺へ入る区間を離し、来る方向の順に並べる（交差しない）', () => {
    const c = rect(0, 200);
    const fromLeft = [{ x: -62, y: 44 }, { x: -62, y: 122 }, { x: 88, y: 122 }, { x: 88, y: 200 }];
    const fromRight = [{ x: 238, y: 44 }, { x: 238, y: 122 }, { x: 88, y: 122 }, { x: 88, y: 200 }];
    const [l, r] = separateOverlaps([
      { id: 'l', points: fromLeft, source: rect(-150, 0), target: c },
      { id: 'r', points: fromRight, source: rect(150, 0), target: c },
    ]);
    expect(sharedLength(l, r)).toBe(0);
    // 左から来る線は左寄り、右から来る線は右寄りで C の上辺に入る
    expect(l[l.length - 1].x).toBeLessThan(r[r.length - 1].x);
    expect(l[l.length - 1].y).toBe(200);
    expect(r[r.length - 1].y).toBe(200);
  });

  it('重なっていない線は動かさない', () => {
    const a = [{ x: 0, y: 0 }, { x: 0, y: 100 }];
    const b = [{ x: 50, y: 0 }, { x: 50, y: 100 }];
    const [ra, rb] = separateOverlaps([
      { id: 'a', points: a, source: rect(-88, -44), target: rect(-88, 100) },
      { id: 'b', points: b, source: rect(-38, -44), target: rect(-38, 100) },
    ]);
    expect(ra).toEqual(a);
    expect(rb).toEqual(b);
  });

  it('菱形の頂点から分かれる線は、ずらした先でも菱形の外枠に接する', () => {
    const d = diamond(0, 0); // 下の頂点は (100, 96)
    const toLeft = [{ x: 100, y: 96 }, { x: 100, y: 150 }, { x: -50, y: 150 }, { x: -50, y: 200 }];
    const toRight = [{ x: 100, y: 96 }, { x: 100, y: 150 }, { x: 250, y: 150 }, { x: 250, y: 200 }];
    const [l, r] = separateOverlaps([
      { id: 'l', points: toLeft, source: d, target: rect(-138, 200) },
      { id: 'r', points: toRight, source: d, target: rect(162, 200) },
    ]);
    expect(sharedLength(l, r)).toBe(0);
    for (const start of [l[0], r[0]]) {
      // |x - cx| / a + |y - cy| / b = 1（外枠の上）
      expect(Math.abs(start.x - 100) / 100 + Math.abs(start.y - 48) / 48).toBeCloseTo(1, 5);
    }
    expect(l[0].x).toBeLessThan(r[0].x);
  });
});

describe('枠を避ける', () => {
  // 枠: メンバー (0,200)-(176,244) と (0,320)-(176,364) を囲む。名前は左上に幅 140 ほど
  const m1 = { x: 0, y: 200, width: 176, height: 44 };
  const m2 = { x: 0, y: 320, width: 176, height: 44 };
  const frame = { x: -20, y: 164, width: 216, height: 220 };
  const label = { x: -10, y: 171, width: 140, height: 22 };
  const frames = [{ rect: frame, label }];
  const crossesLabel = (points: { x: number; y: number }[]) => polylineHits(points, [label]);

  it('上から枠の先頭のノードへ入る線は、枠の名前を横切らずに上辺へ入る', () => {
    const source = { x: 300, y: 0, width: 176, height: 44 };
    const route = routeEdge(source, m1, [m2], { frames });
    expect(crossesLabel(route.points)).toBe(false);
    const end = route.points[route.points.length - 1];
    expect(end.y).toBe(m1.y); // 上辺に入る
    expect(end.x).toBeGreaterThan(label.x + label.width); // 名前を避けた位置
  });

  it('枠の向こう側へ回り込む線は、枠の縁に沿って走らない', () => {
    const above = { x: 0, y: 40, width: 176, height: 44 };
    const below = { x: 0, y: 480, width: 176, height: 44 };
    const route = routeEdge(above, below, [m1, m2], { frames });
    expect(polylineHits(route.points, [m1, m2].map((r) => ({ x: r.x - 15, y: r.y - 15, width: r.width + 30, height: r.height + 30 })))).toBe(false);
    expect(runsAlongFrames(route.points, frames)).toBe(false);
    expect(crossesLabel(route.points)).toBe(false);
  });

  it('枠の縁を垂直に横切るだけなら、まっすぐな線のまま', () => {
    const outside = { x: 0, y: 0, width: 176, height: 44 };
    const route = routeEdge(outside, m1, [], { frames: [{ rect: frame, label: { ...label, width: 40 } }] });
    expect(route.points).toEqual([
      { x: 88, y: 44 },
      { x: 88, y: 200 },
    ]);
  });
});

describe('経路の形', () => {
  it('ノードの大きさや座標が小数でも、避けた経路はすべて縦か横の線分になる（斜めの歪みが出ない）', () => {
    const source = { x: 320.3, y: 0.7, width: 176, height: 44.6 };
    const m1 = { x: 0, y: 200.2, width: 176, height: 64.8 };
    const frames = [{ rect: { x: -20, y: 164.2, width: 216, height: 120.8 }, label: { x: -10, y: 171.2, width: 137.3, height: 22.2 } }];
    const route = routeEdge(source, m1, [], { frames });
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i];
      const b = route.points[i + 1];
      expect(a.x === b.x || a.y === b.y, `${JSON.stringify(a)} → ${JSON.stringify(b)}`).toBe(true);
    }
  });

  it('名前が長くて上辺の中央の近くに入れないときも、名前にかからない位置から上辺に入る', () => {
    const m1 = { x: 0, y: 200, width: 176, height: 44 };
    // 名前（要約付き）が上辺の 8 割近くまでかかっている
    const frames = [{ rect: { x: -20, y: 164, width: 216, height: 100 }, label: { x: -10, y: 171, width: 150, height: 22 } }];
    const route = routeEdge({ x: 0, y: 0, width: 176, height: 44 }, m1, [], { frames });
    const end = route.points[route.points.length - 1];
    expect(end.y).toBe(m1.y);
    expect(polylineHits(route.points, [frames[0].label])).toBe(false);
  });
});
