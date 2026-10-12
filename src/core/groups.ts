import type { FlowGroup } from './model.ts';
import type { Rect } from './geometry.ts';
import { isBlank, textWidthEm } from './text.ts';
import type { ZoomLevel } from './zoomLevels.ts';

/** 枠の余白。上は名前を置くために広めにとる */
export const FRAME_PAD = { side: 20, top: 36, bottom: 20 } as const;
/** 枠の左上から名前までの距離 */
export const LABEL_OFFSET = { x: 10, y: 7 } as const;

/**
 * 枠の名前が占める範囲の見積もり（線が名前の上を通らないようにするため）。
 * 画面の CSS（.fc-frame-label）に合わせ、俯瞰（L0）は文字が大きく、拡大（L2）は要約も横に並ぶ。
 * 「•」は俯瞰では出ず、拡大では説明があるときだけ出る
 */
export function estimateLabelRect(
  frame: Rect,
  group: Pick<FlowGroup, 'title' | 'summary' | 'description'>,
  level: ZoomLevel,
): Rect {
  const fontSize = level === 0 ? 18 : 13;
  const hasSummary = !isBlank(group.summary);
  const hasDescription = !isBlank(group.description);
  let width = 12 + textWidthEm(isBlank(group.title) ? '（無題のグループ）' : group.title) * fontSize;
  const marker = level !== 0 && (level === 2 ? hasDescription : hasSummary || hasDescription);
  if (marker) width += 12;
  if (level === 2 && hasSummary) width += 6 + textWidthEm(group.summary!) * 12;
  return {
    x: frame.x + LABEL_OFFSET.x,
    y: frame.y + LABEL_OFFSET.y,
    // 文字幅の見積もりの誤差を見込んで少しだけ広げる
    width: Math.min(width + 6, frame.width - LABEL_OFFSET.x * 2),
    height: fontSize * 1.4 + 4,
  };
}

export type MemberInfo = { id: string; groupId?: string; rect: Rect };

export function frameRectOf(memberRects: Rect[]): Rect | null {
  if (memberRects.length === 0) return null;
  const minX = Math.min(...memberRects.map((r) => r.x));
  const minY = Math.min(...memberRects.map((r) => r.y));
  const maxX = Math.max(...memberRects.map((r) => r.x + r.width));
  const maxY = Math.max(...memberRects.map((r) => r.y + r.height));
  return {
    x: minX - FRAME_PAD.side,
    y: minY - FRAME_PAD.top,
    width: maxX - minX + FRAME_PAD.side * 2,
    height: maxY - minY + FRAME_PAD.top + FRAME_PAD.bottom,
  };
}

/**
 * 各グループの枠。exclude に入っているノード（ドラッグ中など）は除いて計算する。
 * ただしグループのメンバー全員が exclude に入っているとき（グループごと動かしている）は全員で計算する。
 */
export function computeFrames(
  groups: Pick<FlowGroup, 'id'>[],
  members: MemberInfo[],
  exclude: ReadonlySet<string> = new Set(),
): Map<string, Rect> {
  const frames = new Map<string, Rect>();
  for (const group of groups) {
    const all = members.filter((m) => m.groupId === group.id);
    const staying = all.filter((m) => !exclude.has(m.id));
    const rect = frameRectOf((staying.length > 0 ? staying : all).map((m) => m.rect));
    if (rect) frames.set(group.id, rect);
  }
  return frames;
}

function contains(rect: Rect, point: { x: number; y: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** 点を含む枠のグループ。prefer の枠が含んでいればそれを、重なっていれば小さい枠を優先する */
export function groupAt(point: { x: number; y: number }, frames: Map<string, Rect>, prefer?: string): string | undefined {
  if (prefer !== undefined) {
    const preferred = frames.get(prefer);
    if (preferred && contains(preferred, point)) return prefer;
  }
  let best: { id: string; area: number } | undefined;
  for (const [id, rect] of frames) {
    if (!contains(rect, point)) continue;
    const area = rect.width * rect.height;
    if (!best || area < best.area) best = { id, area };
  }
  return best?.id;
}

/**
 * ドラッグを終えたノードの所属を決め直す。
 * - 枠に入っていないノード: 中心が入っている枠のグループに入る
 * - 枠に入っているノード: 外れない（枠のほうが広がる）。別のグループの枠の中に落としたときだけ、そちらへ移る
 * 枠の大きさはメンバーで決まるので「枠の外に出たら外す」にすると、端のノードを少し動かしただけで外れてしまう。
 * 外すのはパネルやショートカットでの明示的な操作だけにする。
 * グループのメンバー全員を一緒に動かした場合は、そのグループの所属は変えない。
 * 戻り値は所属が変わるノードだけ。
 */
export function reassignAfterDrag(
  groups: Pick<FlowGroup, 'id'>[],
  members: MemberInfo[],
  moved: ReadonlySet<string>,
): Map<string, string> {
  const frames = computeFrames(groups, members, moved);
  const wholeGroupMoved = (groupId: string) =>
    members.filter((m) => m.groupId === groupId).every((m) => moved.has(m.id));
  // メンバー全員が動いたグループの枠は、ほかのノードの移動先としては使わない（一緒に動いているだけなので）
  const targets = new Map([...frames].filter(([id]) => !wholeGroupMoved(id)));
  const changes = new Map<string, string>();
  for (const member of members) {
    if (!moved.has(member.id)) continue;
    if (member.groupId !== undefined && wholeGroupMoved(member.groupId)) continue;
    const next = groupAt(centerOf(member.rect), targets, member.groupId);
    if (next !== undefined && next !== member.groupId) changes.set(member.id, next);
  }
  return changes;
}

/** メンバーが 1 つもいないグループを落とす */
export function pruneGroups<G extends Pick<FlowGroup, 'id'>>(groups: G[], members: Pick<MemberInfo, 'groupId'>[]): G[] {
  const used = new Set(members.map((m) => m.groupId).filter((id) => id !== undefined));
  return groups.every((g) => used.has(g.id)) ? groups : groups.filter((g) => used.has(g.id));
}
