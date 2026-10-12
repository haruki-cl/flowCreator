import { z } from 'zod';
import { FORMAT, NODE_KINDS, SCHEMA_VERSION, type FlowDocument } from './model.ts';

const LinkSchema = z.object({ label: z.string(), url: z.string() });

const DetailsSchema = z.object({
  description: z.string().optional(),
  owner: z.string().optional(),
  conditions: z.string().optional(),
  notes: z.string().optional(),
  links: z.array(LinkSchema).optional(),
});

const NodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(NODE_KINDS),
  title: z.string(),
  summary: z.string().optional(),
  details: DetailsSchema.optional(),
  groupId: z.string().min(1).optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
});

const GroupSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
});

const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  detail: z.string().optional(),
});

const DocumentSchema = z
  .object({
    format: z.literal(FORMAT),
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z.string().min(1),
    title: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    settings: z.object({ direction: z.enum(['TB', 'LR']) }).default({ direction: 'TB' }),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
    groups: z.array(GroupSchema),
  })
  .superRefine((doc, ctx) => {
    const groupIds = new Set<string>();
    for (const group of doc.groups) {
      if (groupIds.has(group.id)) ctx.addIssue({ code: 'custom', message: `グループ ID が重複しています: ${group.id}` });
      groupIds.add(group.id);
    }
    const nodeIds = new Set<string>();
    for (const node of doc.nodes) {
      if (nodeIds.has(node.id) || groupIds.has(node.id)) {
        ctx.addIssue({ code: 'custom', message: `ノード ID が重複しています: ${node.id}` });
      }
      nodeIds.add(node.id);
      if (node.groupId !== undefined && !groupIds.has(node.groupId)) {
        ctx.addIssue({ code: 'custom', message: `存在しないグループに属するノードがあります: ${node.id}` });
      }
    }
    const edgeIds = new Set<string>();
    for (const edge of doc.edges) {
      if (edgeIds.has(edge.id)) ctx.addIssue({ code: 'custom', message: `エッジ ID が重複しています: ${edge.id}` });
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        ctx.addIssue({ code: 'custom', message: `存在しないノードを指すエッジがあります: ${edge.id}` });
      }
    }
  });

/** 古い schemaVersion を現行に引き上げる変換。index i は version (i + 1) → (i + 2) */
const MIGRATIONS: Array<(doc: Record<string, unknown>) => Record<string, unknown>> = [
  // v1 → v2: グループ（枠）を追加
  (doc) => ({ ...doc, groups: [] }),
];

export type ParseResult = { ok: true; doc: FlowDocument } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseDocument(input: unknown): ParseResult {
  if (!isRecord(input) || input.format !== FORMAT) {
    return { ok: false, error: 'flowCreator のファイルではありません' };
  }
  const version = input.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'ファイルのバージョン情報が不正です' };
  }
  if (version > SCHEMA_VERSION) {
    return { ok: false, error: 'このファイルは新しいバージョンの flowCreator で作成されています' };
  }
  let migrated: Record<string, unknown> = input;
  for (let v = version; v < SCHEMA_VERSION; v++) {
    migrated = { ...MIGRATIONS[v - 1](migrated), schemaVersion: v + 1 };
  }
  const result = DocumentSchema.safeParse(migrated);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length > 0 ? `（${issue.path.join('.')}）` : '';
    return { ok: false, error: `ファイルの内容が不正です${where}: ${issue.message}` };
  }
  return { ok: true, doc: result.data };
}

export function parseDocumentText(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON として読み込めませんでした' };
  }
  return parseDocument(json);
}
