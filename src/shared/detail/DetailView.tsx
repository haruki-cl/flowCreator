import {
  DETAIL_FIELD_LABELS,
  NODE_KIND_LABELS,
  type FlowEdgeData,
  type FlowGroup,
  type FlowNodeData,
} from '../../core/model';
import { hasDetails } from '../../core/disclosure';
import { safeUrl } from '../../core/links';
import { isBlank } from '../../core/text';
import { UNTITLED } from '../flow/FlowNodeView';
import { UNTITLED_GROUP } from '../flow/GroupFrames';

function TextSection({ label, text }: { label: string; text: string | undefined }) {
  if (isBlank(text)) return null;
  return (
    <section className="fc-view-section">
      <h3>{label}</h3>
      <p className="fc-pre">{text}</p>
    </section>
  );
}

/** 読み取り専用の詳細表示（ビューアのパネル）。空の項目は出さない */
export function NodeDetailView({ data }: { data: FlowNodeData }) {
  const details = data.details ?? {};
  const links = (details.links ?? []).filter((link) => !isBlank(link.url) || !isBlank(link.label));
  return (
    <div className="fc-view">
      <div className="fc-kind-chip">{NODE_KIND_LABELS[data.kind]}</div>
      <h2 className="fc-view-title">{data.title.trim() === '' ? UNTITLED : data.title}</h2>
      {!isBlank(data.summary) && <p className="fc-view-summary fc-pre">{data.summary}</p>}
      <TextSection label={DETAIL_FIELD_LABELS.description} text={details.description} />
      <TextSection label={DETAIL_FIELD_LABELS.owner} text={details.owner} />
      <TextSection label={DETAIL_FIELD_LABELS.conditions} text={details.conditions} />
      <TextSection label={DETAIL_FIELD_LABELS.notes} text={details.notes} />
      {links.length > 0 && (
        <section className="fc-view-section">
          <h3>{DETAIL_FIELD_LABELS.links}</h3>
          <ul className="fc-links">
            {links.map((link, index) => {
              const href = safeUrl(link.url);
              const text = isBlank(link.label) ? link.url : link.label;
              return (
                <li key={index}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {text}
                    </a>
                  ) : (
                    <span className="fc-link-disabled" title="このリンクは開けない形式です">
                      {text}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {isBlank(data.summary) && !hasDetails(data.details) && (
        <p className="fc-muted">詳細は登録されていません</p>
      )}
    </div>
  );
}

export function EdgeDetailView({ data, from, to }: { data: FlowEdgeData | undefined; from: string; to: string }) {
  return (
    <div className="fc-view">
      <div className="fc-kind-chip">矢印</div>
      <h2 className="fc-view-title">{isBlank(data?.label) ? `${from} → ${to}` : data?.label}</h2>
      {!isBlank(data?.label) && (
        <p className="fc-muted">
          {from} → {to}
        </p>
      )}
      <TextSection label="詳細" text={data?.detail} />
      {isBlank(data?.detail) && <p className="fc-muted">詳細は登録されていません</p>}
    </div>
  );
}

export function GroupDetailView({ group, memberTitles }: { group: FlowGroup; memberTitles: string[] }) {
  return (
    <div className="fc-view">
      <div className="fc-kind-chip">グループ</div>
      <h2 className="fc-view-title">{isBlank(group.title) ? UNTITLED_GROUP : group.title}</h2>
      {!isBlank(group.summary) && <p className="fc-view-summary fc-pre">{group.summary}</p>}
      <TextSection label="説明" text={group.description} />
      <section className="fc-view-section">
        <h3>含まれるステップ（{memberTitles.length}）</h3>
        <ul className="fc-members">
          {memberTitles.map((title, index) => (
            <li key={index}>{title}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
