/**
 * 拡大表示（L2）でノードが縦に伸びたとき、下のノードとの間が詰まらないよう表示上の位置を下げる。
 *
 * 保存している位置は通常表示（L1）の大きさが前提なので、要約が出て背が伸びると下のノードに迫る。
 * 上から段ごとに見て、上にある同じ列のノードとの間が GAP より狭ければ、その段から下を丸ごと下げる
 * （段単位で下げるので、横に並んだノードの揃いは崩れない）。保存している位置は変えない。
 */

export const SPREAD_GAP = 32;

export type SpreadNode = { id: string; x: number; y: number; width: number; height: number };
/** 段（同じ y のノードの集まり）と、その段に足す表示上のずれ */
export type SpreadRow = { y: number; shift: number };

const SAME_ROW = 1;

export function spreadRows(nodes: SpreadNode[], gap: number = SPREAD_GAP): { offsets: Map<string, number>; rows: SpreadRow[] } {
  const sorted = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  const offsets = new Map<string, number>();
  const rows: SpreadRow[] = [];
  const placed: SpreadNode[] = [];
  let shift = 0;
  for (let i = 0; i < sorted.length; ) {
    const rowY = sorted[i].y;
    const row: SpreadNode[] = [];
    while (i < sorted.length && sorted[i].y - rowY < SAME_ROW) row.push(sorted[i++]);
    let need = 0;
    for (const n of row) {
      for (const p of placed) {
        const sameColumn = p.x < n.x + n.width && n.x < p.x + p.width;
        if (sameColumn) need = Math.max(need, p.y + p.height + gap - (n.y + shift));
      }
    }
    shift += need;
    rows.push({ y: rowY, shift });
    for (const n of row) {
      offsets.set(n.id, shift);
      placed.push({ ...n, y: n.y + shift });
    }
  }
  return { offsets, rows };
}

/** 保存位置 y のノードに足す表示上のずれ（その位置より上にある最後の段のずれ） */
export function shiftAt(rows: SpreadRow[], y: number): number {
  let shift = 0;
  for (const row of rows) {
    if (row.y - SAME_ROW < y) shift = row.shift;
    else break;
  }
  return shift;
}

/** 表示上の y から保存位置の y に戻す（拡大表示のままドラッグや追加をしたとき） */
export function storedY(rows: SpreadRow[], displayY: number): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const y = displayY - rows[i].shift;
    if (y >= rows[i].y - SAME_ROW) {
      // 段と段の間（下げてできたすき間）に置いた場合は、上の段の範囲に収める
      const next = rows[i + 1];
      return next && y >= next.y - SAME_ROW ? next.y - SAME_ROW - 0.5 : y;
    }
  }
  return displayY;
}
