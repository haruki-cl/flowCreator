import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  DETAIL_FIELD_LABELS,
  DETAIL_FIELDS,
  NODE_KIND_LABELS,
  NODE_KINDS,
  type AppEdge,
  type AppNode,
  type FlowGroup,
  type FlowLink,
  type NodeDetails,
  type OptionalDetailField,
} from '../../core/model';
import { displayWidth, isBlank, limitState, SOFT_LIMITS } from '../../core/text';
import { UNTITLED } from '../../shared/flow/FlowNodeView';
import { UNTITLED_GROUP } from '../../shared/flow/GroupFrames';
import { CloseIcon, TrashIcon } from '../../shared/ui/icons';
import { useUi } from '../../shared/ui/uiStore';
import { useDoc } from '../store/docStore';

function Counter({ text, limit }: { text: string; limit: number }) {
  const state = limitState(text, limit);
  if (state === 'ok') return null;
  return (
    <span className={`fc-field-counter is-${state}`} title="短いほど図が読みやすくなります">
      {displayWidth(text)}/{limit}
    </span>
  );
}

function Field({ label, hint, counter, children }: { label: string; hint?: string; counter?: ReactNode; children: ReactNode }) {
  return (
    <label className="fc-field">
      <span className="fc-field-label">
        {label}
        {hint && <span className="fc-field-hint">{hint}</span>}
        {counter}
      </span>
      {children}
    </label>
  );
}

function LinksEditor({ links, onChange }: { links: FlowLink[]; onChange: (links: FlowLink[]) => void }) {
  const rows = links.length > 0 ? links : [{ label: '', url: '' }];
  const update = (index: number, patch: Partial<FlowLink>) =>
    onChange(rows.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  return (
    <div className="fc-links-editor">
      {rows.map((link, index) => (
        <div className="fc-link-row" key={index}>
          <input placeholder="表示名" aria-label="リンクの表示名" value={link.label} onChange={(e) => update(index, { label: e.target.value })} />
          <input placeholder="https://…" aria-label="リンクの URL" value={link.url} onChange={(e) => update(index, { url: e.target.value })} />
          <button
            type="button"
            className="fc-icon-button"
            aria-label="このリンクを削除"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
      <button type="button" className="fc-text-button is-quiet" onClick={() => onChange([...rows, { label: '', url: '' }])}>
        + リンクを追加
      </button>
    </div>
  );
}

function isFilled(details: NodeDetails | undefined, field: OptionalDetailField): boolean {
  if (field === 'links') return (details?.links ?? []).some((l) => !isBlank(l.url) || !isBlank(l.label));
  return !isBlank(details?.[field]);
}

/** ノードが枠に入っているときだけ、所属と「外す」を出す */
function GroupMembership({ node }: { node: AppNode }) {
  const group = useDoc((s) => s.groups.find((g) => g.id === node.data.groupId));
  const removeFromGroup = useDoc((s) => s.removeFromGroup);
  if (!group) return null;
  return (
    <div className="fc-membership" data-testid="panel-membership">
      <span className="fc-muted">グループ: {isBlank(group.title) ? UNTITLED_GROUP : group.title}</span>
      <button type="button" className="fc-text-button is-quiet" onClick={() => removeFromGroup([node.id])}>
        外す
      </button>
    </div>
  );
}

function GroupFields({ group }: { group: FlowGroup }) {
  const updateGroup = useDoc((s) => s.updateGroup);
  const memberCount = useDoc((s) => s.nodes.filter((n) => n.data.groupId === group.id).length);
  return (
    <>
      <p className="fc-muted" style={{ marginTop: 0 }}>
        {memberCount} 個のノードをまとめています。枠の名前をドラッグすると全体を動かせます。
      </p>
      <Field label="名前" hint="常に表示" counter={<Counter text={group.title} limit={SOFT_LIMITS.title} />}>
        <input
          data-testid="panel-group-title"
          value={group.title}
          placeholder={UNTITLED_GROUP}
          onChange={(e) => updateGroup(group.id, { title: e.target.value })}
        />
      </Field>
      <Field label="要約" hint="ホバー・拡大時に表示" counter={<Counter text={group.summary ?? ''} limit={SOFT_LIMITS.summary} />}>
        <textarea
          data-testid="panel-group-summary"
          rows={2}
          value={group.summary ?? ''}
          onChange={(e) => updateGroup(group.id, { summary: e.target.value })}
        />
      </Field>
      <Field label="説明" hint="クリック時のみ表示">
        <textarea
          data-testid="panel-group-description"
          rows={4}
          value={group.description ?? ''}
          onChange={(e) => updateGroup(group.id, { description: e.target.value })}
        />
      </Field>
    </>
  );
}

function NodeFields({ node }: { node: AppNode }) {
  const updateNodeData = useDoc((s) => s.updateNodeData);
  const setKind = useDoc((s) => s.setKind);
  const { data } = node;
  const details = data.details ?? {};
  // 値のある項目と、このパネルで「追加」した項目だけを表示する
  const [revealed, setRevealed] = useState<Set<OptionalDetailField>>(new Set());
  const [adding, setAdding] = useState(false);
  const visible = DETAIL_FIELDS.filter((f) => isFilled(details, f) || revealed.has(f));
  const hidden = DETAIL_FIELDS.filter((f) => !visible.includes(f));

  const setDetail = <K extends keyof NodeDetails>(field: K, value: NodeDetails[K]) =>
    updateNodeData(node.id, { details: { ...details, [field]: value } }, `node:${node.id}:details.${field}`);

  return (
    <>
      <div className="fc-kind-switch" role="radiogroup" aria-label="種類">
        {NODE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={data.kind === kind}
            className={`fc-kind-option ${data.kind === kind ? 'is-active' : ''}`}
            onClick={() => setKind(node.id, kind)}
          >
            <span className={`fc-kind-icon kind-${kind}`} />
            {NODE_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <Field label="見出し" hint="常に表示" counter={<Counter text={data.title} limit={SOFT_LIMITS.title} />}>
        <input
          data-testid="panel-title"
          value={data.title}
          placeholder={UNTITLED}
          onChange={(e) => updateNodeData(node.id, { title: e.target.value })}
        />
      </Field>

      <Field label="要約" hint="ホバー・拡大時に表示" counter={<Counter text={data.summary ?? ''} limit={SOFT_LIMITS.summary} />}>
        <textarea
          data-testid="panel-summary"
          rows={2}
          value={data.summary ?? ''}
          placeholder="1〜2 行で"
          onChange={(e) => updateNodeData(node.id, { summary: e.target.value })}
        />
      </Field>

      <Field label={DETAIL_FIELD_LABELS.description} hint="クリック時のみ表示">
        <textarea
          data-testid="panel-description"
          rows={4}
          value={details.description ?? ''}
          onChange={(e) => setDetail('description', e.target.value)}
        />
      </Field>

      {visible.map((field) =>
        field === 'links' ? (
          <div className="fc-field" key={field}>
            <span className="fc-field-label">{DETAIL_FIELD_LABELS.links}</span>
            <LinksEditor links={details.links ?? []} onChange={(links) => setDetail('links', links)} />
          </div>
        ) : (
          <Field label={DETAIL_FIELD_LABELS[field]} key={field}>
            {field === 'owner' ? (
              <input data-testid={`panel-${field}`} value={details[field] ?? ''} onChange={(e) => setDetail(field, e.target.value)} />
            ) : (
              <textarea data-testid={`panel-${field}`} rows={2} value={details[field] ?? ''} onChange={(e) => setDetail(field, e.target.value)} />
            )}
          </Field>
        ),
      )}

      {hidden.length > 0 && (
        <div className="fc-field-adder">
          {adding ? (
            <div className="fc-field-adder-options">
              {hidden.map((field) => (
                <button
                  key={field}
                  type="button"
                  className="fc-text-button"
                  onClick={() => {
                    setRevealed(new Set([...revealed, field]));
                    setAdding(false);
                  }}
                >
                  {DETAIL_FIELD_LABELS[field]}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" className="fc-text-button is-quiet" onClick={() => setAdding(true)} data-testid="add-field">
              + 項目を追加
            </button>
          )}
        </div>
      )}
      <GroupMembership node={node} />
    </>
  );
}

function EdgeFields({ edge }: { edge: AppEdge }) {
  const updateEdgeData = useDoc((s) => s.updateEdgeData);
  const nodes = useDoc((s) => s.nodes);
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.data.title || UNTITLED;
  return (
    <>
      <p className="fc-muted" style={{ marginTop: 0 }}>
        {titleOf(edge.source)} → {titleOf(edge.target)}
      </p>
      <Field label="ラベル" hint="常に表示" counter={<Counter text={edge.data?.label ?? ''} limit={SOFT_LIMITS.edgeLabel} />}>
        <input
          data-testid="panel-edge-label"
          value={edge.data?.label ?? ''}
          placeholder="例: Yes / No"
          onChange={(e) => updateEdgeData(edge.id, { label: e.target.value })}
        />
      </Field>
      <Field label="詳細" hint="ホバーで 1 行目、クリックで全文">
        <textarea
          data-testid="panel-edge-detail"
          rows={4}
          value={edge.data?.detail ?? ''}
          onChange={(e) => updateEdgeData(edge.id, { detail: e.target.value })}
        />
      </Field>
    </>
  );
}

/** 選択した 1 要素の詳細を編集するパネル。選択していないときは出さない */
export function DetailPanel() {
  const target = useUi((s) => s.panelTarget);
  const openPanel = useUi((s) => s.openPanel);
  const node = useDoc((s) => (target?.kind === 'node' ? s.nodes.find((n) => n.id === target.id) : undefined));
  const edge = useDoc((s) => (target?.kind === 'edge' ? s.edges.find((e) => e.id === target.id) : undefined));
  const group = useDoc((s) => (target?.kind === 'group' ? s.groups.find((g) => g.id === target.id) : undefined));
  const removeElements = useDoc((s) => s.removeElements);
  const ungroup = useDoc((s) => s.ungroup);
  const missing = target !== null && !node && !edge && !group;

  useEffect(() => {
    if (missing) openPanel(null);
  }, [missing, openPanel]);

  if (!target || missing) return null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
      e.stopPropagation();
      openPanel(null);
    }
  };

  return (
    <aside className="fc-panel" aria-label="詳細パネル" data-testid="detail-panel" onKeyDown={onKeyDown}>
      <div className="fc-panel-header">
        <strong>{node ? '詳細' : group ? 'グループ' : '矢印の詳細'}</strong>
        <span className="fc-spacer" />
        <button
          type="button"
          className="fc-icon-button"
          aria-label={group ? '枠を削除（ノードは残ります）' : '削除'}
          title={group ? '枠を削除（ノードは残ります）' : '削除'}
          data-testid="panel-delete"
          onClick={() => {
            if (group) {
              ungroup(group.id);
              useUi.getState().selectGroup(null);
            } else {
              removeElements(node ? { nodes: [node.id] } : { edges: [target.id] });
            }
            openPanel(null);
          }}
        >
          <TrashIcon />
        </button>
        <button type="button" className="fc-icon-button" aria-label="閉じる" title="閉じる（Esc）" onClick={() => openPanel(null)}>
          <CloseIcon />
        </button>
      </div>
      <div className="fc-panel-body">
        {node && <NodeFields key={node.id} node={node} />}
        {edge && <EdgeFields key={edge.id} edge={edge} />}
        {group && <GroupFields key={group.id} group={group} />}
      </div>
    </aside>
  );
}
