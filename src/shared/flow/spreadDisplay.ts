import type { AppNode } from '../../core/model';
import { DEFAULT_NODE_SIZE } from '../../core/layout';
import { shiftAt, spreadRows, storedY, type SpreadNode, type SpreadRow } from '../../core/spread';

function toSpreadNode(node: AppNode): SpreadNode {
  const fallback = DEFAULT_NODE_SIZE[node.data.kind];
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? fallback.width,
    height: node.measured?.height ?? fallback.height,
  };
}

/** 段ごとの表示上のずれ（exclude のノードは計算から外す） */
export function displayRows(nodes: AppNode[], exclude?: ReadonlySet<string>): SpreadRow[] {
  const used = exclude ? nodes.filter((n) => !exclude.has(n.id)) : nodes;
  return spreadRows(used.map(toSpreadNode)).rows;
}

/**
 * 拡大表示（L2）での位置。伸びたノードの下が詰まらないよう、段ごとに下げる（core/spread.ts）。
 * moving のノード（ドラッグ中など）は段の計算から外し、周りの段のずれに合わせて表示する。
 * こうするとドラッグ中に周りのノードが動かず、ドラッグしているノードはポインタについてくる
 */
export function spreadForDisplay(nodes: AppNode[], moving?: ReadonlySet<string>): AppNode[] {
  const others = moving ? nodes.filter((n) => !moving.has(n.id)) : nodes;
  const { offsets, rows } = spreadRows(others.map(toSpreadNode));
  return nodes.map((n) => {
    const dy = moving?.has(n.id) ? shiftAt(rows, n.position.y) : (offsets.get(n.id) ?? 0);
    return dy === 0 ? n : { ...n, position: { x: n.position.x, y: n.position.y + dy } };
  });
}

/** 拡大表示上の点を、保存位置の座標に戻す */
export function toStoredPoint(nodes: AppNode[], point: { x: number; y: number }, exclude?: ReadonlySet<string>) {
  return { x: point.x, y: storedY(displayRows(nodes, exclude), point.y) };
}
