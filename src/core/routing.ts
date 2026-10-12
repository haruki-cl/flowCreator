import { anchor, floatingEdgeParams, rectsOverlap, type Rect, type Side } from './geometry.ts';

export type Point = { x: number; y: number };
export type EdgeRoute = { points: Point[]; label: Point };

/** 線とほかのノードの間に最低限空けるすき間 */
export const ROUTE_MARGIN = 16;
/** 曲がり 1 回を、何 px 分の遠回りとみなすか（曲がりの少ない経路を優先する） */
const BEND_COST = 30;
/** 自然な向き（向かい合う辺）以外から出入りする場合の追加コスト */
const SIDE_COST = 60;
/** 経路探索で考慮する範囲（つなぐ 2 つのノードの外接矩形をこれだけ広げる） */
const SEARCH_PADDING = 240;

const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const DIR: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

function inflate(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, width: r.width + m * 2, height: r.height + m * 2 };
}

function strictlyInside(p: Point, r: Rect): boolean {
  return p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
}

/** 水平・垂直の線分が矩形の内側を通るか */
function segmentHits(a: Point, b: Point, r: Rect): boolean {
  if (a.x === b.x) {
    return a.x > r.x && a.x < r.x + r.width && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.height;
  }
  return a.y > r.y && a.y < r.y + r.height && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.width;
}

export function polylineHits(points: Point[], rects: Rect[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (const r of rects) if (segmentHits(points[i], points[i + 1], r)) return true;
  }
  return false;
}

/** 重複した点と、一直線上の途中の点を取り除く */
export function simplify(points: Point[]): Point[] {
  const deduped = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  return deduped.filter((p, i) => {
    if (i === 0 || i === deduped.length - 1) return true;
    const a = deduped[i - 1];
    const b = deduped[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
  }
  return total;
}

/** 線の長さのちょうど半分の位置（ラベルを置く場所） */
export function pointAtHalf(points: Point[]): Point {
  let rest = polylineLength(points) / 2;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (rest <= len) {
      const t = len === 0 ? 0 : rest / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    rest -= len;
  }
  return points[points.length - 1];
}

/** 向かい合う辺の中点どうしを、真ん中で 1 回折れる線で結ぶ（ほかのノードを考えない基本形） */
export function directRoute(source: Rect, target: Rect): EdgeRoute & { sourceSide: Side; targetSide: Side } {
  const p = floatingEdgeParams(source, target);
  const s = { x: p.sx, y: p.sy };
  const t = { x: p.tx, y: p.ty };
  const vertical = p.sourcePosition === 'top' || p.sourcePosition === 'bottom';
  let points: Point[];
  let label: Point;
  if (vertical) {
    const midY = (s.y + t.y) / 2;
    points = [s, { x: s.x, y: midY }, { x: t.x, y: midY }, t];
    label = { x: (s.x + t.x) / 2, y: midY };
  } else {
    const midX = (s.x + t.x) / 2;
    points = [s, { x: midX, y: s.y }, { x: midX, y: t.y }, t];
    label = { x: midX, y: (s.y + t.y) / 2 };
  }
  return { points: simplify(points), label, sourceSide: p.sourcePosition, targetSide: p.targetPosition };
}

/** 2 分ヒープ（A* の候補を安い順に取り出す） */
class MinHeap<T> {
  private items: Array<{ key: number; value: T }> = [];
  get size(): number {
    return this.items.length;
  }
  push(key: number, value: T): void {
    const items = this.items;
    items.push({ key, value });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].key <= items[i].key) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0].value;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l].key < items[m].key) m = l;
        if (r < items.length && items[r].key < items[m].key) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }
}

/** グループの枠（線が縁に沿って走らないよう避ける）と、その名前（線が通らない） */
export type FrameGeometry = { rect: Rect; label: Rect };

/** 枠の名前のまわりに空けるすき間 */
const LABEL_MARGIN = 6;
/** 枠の縁から、この距離の内側（余白）と外側を「縁沿い」とみなす */
const FRAME_BAND = 10;
/** 縁沿いを走る区間は、この倍の長さとして扱う（よほど遠回りでない限り避ける） */
const ALONG_FRAME_FACTOR = 10;
/** 名前を避けて、上辺の中央以外から出入りするときの追加コスト */
const OFFSET_ANCHOR_COST = 12;
/** 枠の余白（core/groups.ts の FRAME_PAD と同じ値）。循環参照を避けるためここに持つ */
const PAD = { side: 20, top: 36, bottom: 20 } as const;

/**
 * 線分が枠の縁に沿って走っているか。縁の外側 FRAME_BAND から、内側の余白（メンバーまで）の範囲を、
 * 縁と平行に通る区間を「縁沿い」とする。縁を垂直に横切るのは問題ない
 */
function alongFrame(a: Point, b: Point, frames: readonly FrameGeometry[]): boolean {
  const horizontal = a.y === b.y;
  for (const { rect: f } of frames) {
    if (horizontal) {
      if (Math.max(a.x, b.x) <= f.x || Math.min(a.x, b.x) >= f.x + f.width) continue;
      const y = a.y;
      if (y >= f.y - FRAME_BAND && y <= f.y + PAD.top - 4) return true;
      if (y >= f.y + f.height - PAD.bottom + 4 && y <= f.y + f.height + FRAME_BAND) return true;
    } else {
      if (Math.max(a.y, b.y) <= f.y || Math.min(a.y, b.y) >= f.y + f.height) continue;
      const x = a.x;
      if (x >= f.x - FRAME_BAND && x <= f.x + PAD.side - 4) return true;
      if (x >= f.x + f.width - PAD.side + 4 && x <= f.x + f.width + FRAME_BAND) return true;
    }
  }
  return false;
}

/** 線の一部が、枠の縁沿いを一定以上の長さ走っているか */
export function runsAlongFrames(points: Point[], frames: readonly FrameGeometry[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 6 && alongFrame(a, b, frames)) return true;
  }
  return false;
}

type Endpoint = { side: Side; anchor: Point; stub: Point; cost: number };

/**
 * 線の出入り口。各辺の中央に加え、四角いノードの上辺の中央に枠の名前がかぶっているときは、
 * 名前を避けた位置も候補にする（グループの先頭のノードへ上から入る線が、名前の下を通らないように）
 */
function endpointsOf(rect: Rect, shape: NodeShape, labels: readonly Rect[], m: number): Endpoint[] {
  const result: Endpoint[] = [];
  for (const side of SIDES) {
    const a = anchor(rect, side);
    const stubOf = (p: Point) => ({ x: p.x + DIR[side].x * m, y: p.y + DIR[side].y * m });
    result.push({ side, anchor: a, stub: stubOf(a), cost: 0 });
    if (side !== 'top' || shape !== 'rect') continue;
    for (const label of labels) {
      // 上辺の中央へ真上から入ると、すぐ上にある名前を縦に横切る場合
      const coversCenter = a.x > label.x && a.x < label.x + label.width && a.y > label.y && a.y - (label.y + label.height) < 60;
      if (!strictlyInside(stubOf(a), label) && !coversCenter) continue;
      // 名前のすぐ右・すぐ左、上辺の右寄り・左寄りの順に、名前にかからない位置を探す
      const candidates = [label.x + label.width + 12, label.x - 12, rect.x + rect.width * 0.82, rect.x + rect.width * 0.18];
      for (const x of candidates) {
        if (x < rect.x + 10 || x > rect.x + rect.width - 10) continue;
        if (x > label.x - 6 && x < label.x + label.width + 6) continue;
        const shifted = { x, y: rect.y };
        if (result.some((e) => e.side === side && Math.abs(e.anchor.x - x) < 1)) continue;
        result.push({ side, anchor: shifted, stub: stubOf(shifted), cost: OFFSET_ANCHOR_COST });
      }
    }
  }
  return result;
}

type RouteOptions = { frames?: readonly FrameGeometry[]; sourceShape?: NodeShape; targetShape?: NodeShape };

/**
 * ほかのノードを避ける経路を探す。ノードと枠の辺（すき間を足した位置）を通る縦横の線を格子にして、
 * 長さ + 曲がりの回数が最小になる経路を A* で探す。出入りする辺は自然な向き以外も候補にする。
 * 枠の名前は通らず、枠の縁沿いは大きく遠回り扱いにする。
 */
function searchRoute(
  source: Rect,
  target: Rect,
  others: readonly Rect[],
  preferred: { source: Side; target: Side },
  options: RouteOptions,
): Point[] | null {
  const m = ROUTE_MARGIN;
  const bounds = {
    x: Math.min(source.x, target.x) - SEARCH_PADDING,
    y: Math.min(source.y, target.y) - SEARCH_PADDING,
    width: Math.max(source.x + source.width, target.x + target.width) - Math.min(source.x, target.x) + SEARCH_PADDING * 2,
    height: Math.max(source.y + source.height, target.y + target.height) - Math.min(source.y, target.y) + SEARCH_PADDING * 2,
  };
  const frames = (options.frames ?? []).filter((f) => rectsOverlap(f.rect, bounds));
  const labels = frames.map((f) => inflate(f.label, LABEL_MARGIN));
  const blockers = [...[source, target, ...others.filter((r) => rectsOverlap(r, bounds))].map((r) => inflate(r, m)), ...labels];

  const starts = endpointsOf(source, options.sourceShape ?? 'rect', labels, m);
  const goals = endpointsOf(target, options.targetShape ?? 'rect', labels, m);

  const xsRaw = [bounds.x, bounds.x + bounds.width];
  const ysRaw = [bounds.y, bounds.y + bounds.height];
  for (const r of blockers) {
    xsRaw.push(r.x, r.x + r.width);
    ysRaw.push(r.y, r.y + r.height);
  }
  // 枠の外側に、縁からすき間を空けた通り道を用意する
  for (const { rect: f } of frames) {
    xsRaw.push(f.x - m, f.x + f.width + m);
    ysRaw.push(f.y - m, f.y + f.height + m);
  }
  for (const p of [...starts, ...goals]) {
    xsRaw.push(p.stub.x);
    ysRaw.push(p.stub.y);
  }
  // 障害物の間の真ん中も通れるようにする（すき間の中央を通る、見た目の良い経路のため）。
  // 座標は丸めない（出入り口の座標と格子がずれると、最後の区間がわずかに斜めになって線が歪む）
  const withMidpoints = (values: number[]) => {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    const result = [...sorted];
    for (let i = 0; i < sorted.length - 1; i++) result.push((sorted[i] + sorted[i + 1]) / 2);
    return [...new Set(result)].sort((a, b) => a - b);
  };
  const xs = withMidpoints(xsRaw);
  const ys = withMidpoints(ysRaw);
  const xi = new Map(xs.map((x, i) => [x, i]));
  const yi = new Map(ys.map((y, i) => [y, i]));
  const blocked = (p: Point) => blockers.some((r) => strictlyInside(p, r));

  // 状態: 格子点 + 進んでいる向き（0..3）。向きを持つのは曲がりの回数を数えるため
  const W = xs.length;
  const H = ys.length;
  const stateId = (ix: number, iy: number, d: number) => (iy * W + ix) * 4 + d;
  const dirs = [DIR.top, DIR.right, DIR.bottom, DIR.left];
  const best = new Map<number, number>();
  const prev = new Map<number, number>();
  const startOf = new Map<number, Endpoint>();
  const heap = new MinHeap<{ id: number; ix: number; iy: number; d: number; g: number }>();

  const goalByPoint = new Map<number, Endpoint[]>();
  for (const goal of goals) {
    const gx = xi.get(goal.stub.x);
    const gy = yi.get(goal.stub.y);
    if (gx === undefined || gy === undefined || blocked(goal.stub)) continue;
    const key = gy * W + gx;
    goalByPoint.set(key, [...(goalByPoint.get(key) ?? []), goal]);
  }
  if (goalByPoint.size === 0) return null;
  const heuristic = (ix: number, iy: number) =>
    Math.min(...goals.map((g) => Math.abs(xs[ix] - g.stub.x) + Math.abs(ys[iy] - g.stub.y)));

  for (const start of starts) {
    const sx = xi.get(start.stub.x);
    const sy = yi.get(start.stub.y);
    if (sx === undefined || sy === undefined || blocked(start.stub)) continue;
    const d = SIDES.indexOf(start.side);
    const g = (start.side === preferred.source ? 0 : SIDE_COST) + start.cost;
    const id = stateId(sx, sy, d);
    if (g < (best.get(id) ?? Infinity)) {
      best.set(id, g);
      startOf.set(id, start);
      heap.push(g + heuristic(sx, sy), { id, ix: sx, iy: sy, d, g });
    }
  }

  let found: { id: number; goal: Endpoint } | null = null;
  let foundCost = Infinity;
  let expansions = 0;
  while (heap.size > 0 && expansions < 30000) {
    const cur = heap.pop()!;
    expansions++;
    if (cur.g > (best.get(cur.id) ?? Infinity)) continue;
    if (cur.g >= foundCost) break;
    const arrivals = goalByPoint.get(cur.iy * W + cur.ix);
    if (arrivals) {
      for (const goal of arrivals) {
        // ゴールでは、ノードへ向かって（辺の外向きと逆向きに）入るのが自然。違う向きなら曲がり 1 回分
        const inward = (SIDES.indexOf(goal.side) + 2) % 4;
        const cost = cur.g + (cur.d === inward ? 0 : BEND_COST) + (goal.side === preferred.target ? 0 : SIDE_COST) + goal.cost;
        if (cost < foundCost) {
          foundCost = cost;
          found = { id: cur.id, goal };
        }
      }
    }
    for (let d = 0; d < 4; d++) {
      if ((d + 2) % 4 === cur.d) continue; // 折り返しはしない
      const nx = cur.ix + dirs[d].x;
      const ny = cur.iy + dirs[d].y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const from = { x: xs[cur.ix], y: ys[cur.iy] };
      const to = { x: xs[nx], y: ys[ny] };
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      if (blocked(to) || blocked(mid)) continue;
      const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
      const factor = frames.length > 0 && alongFrame(from, to, frames) ? ALONG_FRAME_FACTOR : 1;
      const g = cur.g + length * factor + (d === cur.d ? 0 : BEND_COST);
      const id = stateId(nx, ny, d);
      if (g >= (best.get(id) ?? Infinity)) continue;
      best.set(id, g);
      prev.set(id, cur.id);
      heap.push(g + heuristic(nx, ny), { id, ix: nx, iy: ny, d, g });
    }
  }
  if (!found) return null;

  const path: Point[] = [];
  let id: number | undefined = found.id;
  let start: Endpoint | undefined;
  while (id !== undefined) {
    const cell = id >> 2;
    path.push({ x: xs[cell % W], y: ys[Math.floor(cell / W)] });
    const parent = prev.get(id);
    if (parent === undefined) start = startOf.get(id);
    id = parent;
  }
  path.reverse();
  if (!start) return null;
  return simplify([start.anchor, ...path, found.goal.anchor]);
}

/**
 * 線の経路。基本形がほかのノード（すき間を含む）・枠の名前にかからず、枠の縁沿いも走らなければ基本形をそのまま使い、
 * そうでないときだけ避ける経路を探す。
 */
export function routeEdge(source: Rect, target: Rect, others: readonly Rect[], options: RouteOptions = {}): EdgeRoute {
  const direct = directRoute(source, target);
  const frames = options.frames ?? [];
  const blockers = [
    ...others.map((r) => inflate(r, ROUTE_MARGIN)),
    ...frames.map((f) => inflate(f.label, LABEL_MARGIN)),
  ];
  if (!polylineHits(direct.points, blockers) && !runsAlongFrames(direct.points, frames)) {
    return { points: direct.points, label: direct.label };
  }
  const routed = searchRoute(source, target, others, { source: direct.sourceSide, target: direct.targetSide }, options);
  if (!routed) return { points: direct.points, label: direct.label };
  return { points: routed, label: pointAtHalf(routed) };
}

/** 折れ線を、角を丸めた SVG パスにする */
export function roundedPath(points: Point[], radius = 8): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const p = points[i];
    const b = points[i + 1];
    const inLen = Math.abs(p.x - a.x) + Math.abs(p.y - a.y);
    const outLen = Math.abs(b.x - p.x) + Math.abs(b.y - p.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const inDir = { x: Math.sign(p.x - a.x), y: Math.sign(p.y - a.y) };
    const outDir = { x: Math.sign(b.x - p.x), y: Math.sign(b.y - p.y) };
    d += ` L ${p.x - inDir.x * r} ${p.y - inDir.y * r} Q ${p.x} ${p.y} ${p.x + outDir.x * r} ${p.y + outDir.y * r}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

// ───────── 線どうしの重なりをなくす（同じ位置を並んで通る区間を、平行にずらす） ─────────

/** 並んだ線の間隔 */
export const EDGE_SPACING = 12;

export type NodeShape = 'rect' | 'diamond';
export type NodeGeometry = { rect: Rect; shape: NodeShape };
export type RouteInput = { id: string; points: Point[]; source: NodeGeometry; target: NodeGeometry };

type Segment = {
  route: number;
  index: number;
  vertical: boolean;
  coord: number;
  min: number;
  max: number;
};

/** 菱形の外枠のうち、縦線 x（または横線 y）と交わる点。side は線が出入りする頂点の側 */
function onDiamond(rect: Rect, side: Side, along: number): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const a = rect.width / 2;
  const b = rect.height / 2;
  if (side === 'top' || side === 'bottom') {
    const dy = b * Math.max(0, 1 - Math.abs(along - cx) / a);
    return { x: along, y: side === 'top' ? cy - dy : cy + dy };
  }
  const dx = a * Math.max(0, 1 - Math.abs(along - cy) / b);
  return { x: side === 'left' ? cx - dx : cx + dx, y: along };
}

/** 端点がノードのどの辺にあるか（線の向きから判断する） */
function sideOf(end: Point, next: Point): Side {
  if (end.x === next.x) return next.y > end.y ? 'bottom' : 'top';
  return next.x > end.x ? 'right' : 'left';
}

/** 菱形では、線をつなぐ位置を頂点の近くに留める（辺の中間にある「•」や、頂点から離れた位置につながって見えるのを防ぐ） */
const DIAMOND_SLIDE_LIMIT = 24;

/** 端点をずらしてよい範囲（ノードの辺からはみ出さない・角丸にかからない） */
function slideLimit(node: NodeGeometry, side: Side): number {
  const length = side === 'top' || side === 'bottom' ? node.rect.width : node.rect.height;
  const limit = node.shape === 'diamond' ? Math.min(DIAMOND_SLIDE_LIMIT, length / 2 - 24) : length / 2 - 14;
  return Math.max(0, limit);
}

/**
 * 別々の線が同じ位置を並んで通っている区間を見つけて、EDGE_SPACING ずつ離す。
 * 端の区間をずらすときは、ノードの辺の上で接続位置をずらす（菱形は外枠の上に乗せ直す）。
 * 並べる順は、線がどちらから来て・どちらへ行くかで決め、ずらしたことで線どうしが交差しにくくする。
 */
export function separateOverlaps(routes: RouteInput[]): Point[][] {
  const result = routes.map((r) => r.points.map((p) => ({ ...p })));

  for (const vertical of [true, false]) {
    const segments: Segment[] = [];
    result.forEach((points, route) => {
      for (let index = 0; index < points.length - 1; index++) {
        const a = points[index];
        const b = points[index + 1];
        if (vertical ? a.x !== b.x : a.y !== b.y) continue;
        const coord = vertical ? a.x : a.y;
        const [p, q] = vertical ? [a.y, b.y] : [a.x, b.x];
        if (p === q) continue;
        segments.push({ route, index, vertical, coord: Math.round(coord * 2) / 2, min: Math.min(p, q), max: Math.max(p, q) });
      }
    });

    // 同じ座標の線分を、範囲が重なるかたまりに分ける
    const byCoord = new Map<number, Segment[]>();
    for (const s of segments) byCoord.set(s.coord, [...(byCoord.get(s.coord) ?? []), s]);
    const clusters: Segment[][] = [];
    for (const list of byCoord.values()) {
      list.sort((a, b) => a.min - b.min || a.route - b.route);
      let current: Segment[] = [];
      let reach = -Infinity;
      for (const s of list) {
        if (current.length > 0 && s.min < reach - 1) {
          current.push(s);
          reach = Math.max(reach, s.max);
        } else {
          if (current.length > 1) clusters.push(current);
          current = [s];
          reach = s.max;
        }
      }
      if (current.length > 1) clusters.push(current);
    }

    for (const cluster of clusters) {
      if (new Set(cluster.map((s) => s.route)).size < 2) continue;
      // 前後の区間がどちら側へ伸びているかで並べる（左・上から来る線を左・上に置く）
      const keyOf = (s: Segment) => {
        const points = result[s.route];
        const sides: number[] = [];
        const before = points[s.index - 1];
        const after = points[s.index + 2];
        if (before) sides.push((vertical ? before.x : before.y) - s.coord);
        if (after) sides.push((vertical ? after.x : after.y) - s.coord);
        return sides.length === 0 ? 0 : sides.reduce((x, y) => x + y, 0) / sides.length;
      };
      const ordered = [...cluster].sort((a, b) => keyOf(a) - keyOf(b) || routes[a.route].id.localeCompare(routes[b.route].id));
      ordered.forEach((s, rank) => {
        let offset = (rank - (ordered.length - 1) / 2) * EDGE_SPACING;
        const points = result[s.route];
        const isFirst = s.index === 0;
        const isLast = s.index + 1 === points.length - 1;
        // 端の区間は、ノードの辺の範囲内でしかずらせない
        if (isFirst) {
          const limit = slideLimit(routes[s.route].source, sideOf(points[0], points[1]));
          offset = Math.max(-limit, Math.min(limit, offset));
        }
        if (isLast) {
          const n = points.length - 1;
          const limit = slideLimit(routes[s.route].target, sideOf(points[n], points[n - 1]));
          offset = Math.max(-limit, Math.min(limit, offset));
        }
        if (offset === 0) return;
        for (const i of [s.index, s.index + 1]) {
          if (vertical) points[i].x += offset;
          else points[i].y += offset;
        }
        // 菱形の頂点から出入りする線は、ずらした先でも外枠に接するようにする
        if (isFirst && routes[s.route].source.shape === 'diamond') {
          const side = sideOf(points[0], points[1]);
          points[0] = onDiamond(routes[s.route].source.rect, side, vertical ? points[0].x : points[0].y);
        }
        if (isLast && routes[s.route].target.shape === 'diamond') {
          const n = points.length - 1;
          const side = sideOf(points[n], points[n - 1]);
          points[n] = onDiamond(routes[s.route].target.rect, side, vertical ? points[n].x : points[n].y);
        }
      });
    }
  }
  return result.map(simplify);
}

/** すべての線の経路を決める（ノードを避ける → 線どうしの重なりを離す） */
export function routeAll(
  nodes: Map<string, NodeGeometry>,
  edges: Array<{ id: string; source: string; target: string }>,
  frames: readonly FrameGeometry[] = [],
  /** ノード以外に線が通らない範囲（拡大時に菱形の横に出す要約など） */
  obstacles: readonly Rect[] = [],
): Map<string, EdgeRoute> {
  const all = [...nodes.entries()];
  const inputs: RouteInput[] = [];
  for (const edge of edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) continue;
    const others = [...all.filter(([id]) => id !== edge.source && id !== edge.target).map(([, n]) => n.rect), ...obstacles];
    const route = routeEdge(source.rect, target.rect, others, { frames, sourceShape: source.shape, targetShape: target.shape });
    inputs.push({ id: edge.id, points: route.points, source, target });
  }
  const separated = separateOverlaps(inputs);
  return new Map(inputs.map((input, i) => [input.id, { points: separated[i], label: pointAtHalf(separated[i]) }]));
}
