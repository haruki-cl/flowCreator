import { DEFAULT_NODE_SIZE, dagreLayout, summaryAllowance } from './layout.ts';
import { NODE_KIND_LABELS, type FlowDocument, type FlowNode } from './model.ts';
import { rectsOverlap, type Rect } from './geometry.ts';
import { displayWidth, firstLine, SOFT_LIMITS } from './text.ts';

// AI やコマンドラインからフローの JSON を扱うときの道具（画面のない環境でも動く）

/** 画面で計測できないので、見出しの長さから大きさを見積もる（2 行になりそうなら高くする） */
export function estimateSize(node: Pick<FlowNode, 'kind' | 'title'>): { width: number; height: number } {
  const base = DEFAULT_NODE_SIZE[node.kind];
  const twoLines = displayWidth(node.title) > (node.kind === 'decision' ? 14 : 22);
  return { width: base.width, height: twoLines ? base.height + 20 : base.height };
}

/** 画面の「自動整列」と同じ並べ方で座標を付け直す（拡大で要約が出たときの伸びも見込む） */
export function layoutDocument(doc: FlowDocument, now = new Date()): FlowDocument {
  const result = dagreLayout.layout({
    direction: doc.settings.direction,
    nodes: doc.nodes.map((n) => {
      const size = estimateSize(n);
      return { id: n.id, width: size.width, height: size.height + summaryAllowance(n), groupId: n.groupId };
    }),
    edges: doc.edges.map((e) => ({ source: e.source, target: e.target })),
  });
  return {
    ...doc,
    updatedAt: now.toISOString(),
    nodes: doc.nodes.map((n) => (result[n.id] ? { ...n, position: result[n.id] } : n)),
  };
}

/**
 * 形式としては正しいが、このアプリの考え方（見出しは短く、説明は要約・詳細へ）から外れている点や、
 * 見た目の問題（ノードの重なり、つながっていないノード）を挙げる
 */
export function lintDocument(doc: FlowDocument): string[] {
  const warnings: string[] = [];
  for (const n of doc.nodes) {
    if (n.title.trim() === '') warnings.push(`ノード ${n.id}: 見出しが空です`);
    if (displayWidth(n.title) > SOFT_LIMITS.title) {
      warnings.push(`ノード ${n.id}「${n.title}」: 見出しが長すぎます（全角 ${SOFT_LIMITS.title / 2} 字まで。説明は summary / details へ）`);
    }
    if (n.summary && displayWidth(n.summary) > SOFT_LIMITS.summary) {
      warnings.push(`ノード ${n.id}: 要約が長すぎます（全角 ${SOFT_LIMITS.summary / 2} 字まで。長い説明は details.description へ）`);
    }
  }
  for (const e of doc.edges) {
    if (e.label && displayWidth(e.label) > SOFT_LIMITS.edgeLabel) {
      warnings.push(`線 ${e.id}: ラベルが長すぎます（全角 ${SOFT_LIMITS.edgeLabel / 2} 字まで。説明は detail へ）`);
    }
  }
  const connected = new Set(doc.edges.flatMap((e) => [e.source, e.target]));
  if (doc.nodes.length > 1) {
    for (const n of doc.nodes) if (!connected.has(n.id)) warnings.push(`ノード ${n.id}「${n.title}」: どの線ともつながっていません`);
  }
  const rects: Array<{ node: FlowNode; rect: Rect }> = doc.nodes.map((n) => ({ node: n, rect: { ...n.position, ...estimateSize(n) } }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i].rect, rects[j].rect)) {
        warnings.push(`ノード ${rects[i].node.id} と ${rects[j].node.id} が重なっています（layout で整列してください）`);
      }
    }
  }
  const used = new Set(doc.nodes.map((n) => n.groupId));
  for (const g of doc.groups) if (!used.has(g.id)) warnings.push(`グループ ${g.id}「${g.title}」: メンバーがいません`);
  return warnings;
}

/** 構造を短く書き出す（AI が全体を把握するため。JSON をそのまま読むより短い） */
export function outlineDocument(doc: FlowDocument): string {
  const lines: string[] = [`${doc.title}  [id: ${doc.id}]  ノード ${doc.nodes.length} / 線 ${doc.edges.length} / グループ ${doc.groups.length}`];
  if (doc.groups.length > 0) {
    lines.push('', 'グループ:');
    for (const g of doc.groups) lines.push(`  ${g.id}「${g.title}」${g.summary ? `  要約: ${g.summary}` : ''}`);
  }
  lines.push('', 'ノード:');
  for (const n of doc.nodes) {
    const extras: string[] = [];
    if (n.summary) extras.push(`要約: ${n.summary}`);
    const details = Object.entries(n.details ?? {})
      .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== ''))
      .map(([k]) => k);
    if (details.length > 0) extras.push(`詳細: ${details.join(', ')}`);
    if (n.groupId) extras.push(`グループ: ${n.groupId}`);
    lines.push(`  ${n.id}  [${NODE_KIND_LABELS[n.kind]}] ${n.title}${extras.length ? `  （${extras.join(' / ')}）` : ''}`);
  }
  lines.push('', '線:');
  for (const e of doc.edges) {
    const detail = e.detail ? `  詳細: ${firstLine(e.detail)}` : '';
    lines.push(`  ${e.id}  ${e.source} → ${e.target}${e.label ? `  「${e.label}」` : ''}${detail}`);
  }
  return lines.join('\n');
}
