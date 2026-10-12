import { newId } from './factory.ts';
import { FORMAT, SCHEMA_VERSION, type FlowDocument } from './model.ts';

/** 「サンプルを開く」で使う例。見出しは短く、詳細は summary / details に寄せている */
export function createSampleDocument(now = new Date()): FlowDocument {
  const iso = now.toISOString();
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    // 開くたびに別のフローとして保存する（前に開いたサンプルの編集内容を上書きしない）
    id: newId(),
    title: '経費精算フロー（サンプル）',
    createdAt: iso,
    updatedAt: iso,
    settings: { direction: 'TB' },
    nodes: [
      { id: 's', kind: 'start', title: '申請者が立替払い', groupId: 'g-apply', position: { x: 112, y: 0 } },
      {
        id: 'p1',
        kind: 'process',
        title: '経費申請を提出',
        summary: '領収書の画像を添付して経費システムから申請する',
        details: {
          description: '経費システムの「新規申請」から入力する。\n交通費は経路検索の結果を添付すると差し戻しが減る。',
          owner: '申請者',
          conditions: '支払日から 30 日以内',
          links: [{ label: '経費精算規程', url: 'https://example.com/rules/expense' }],
        },
        groupId: 'g-apply',
        position: { x: 112, y: 104 },
      },
      {
        id: 'd1',
        kind: 'decision',
        title: '金額は5万円以上？',
        summary: '5 万円以上は部長承認が追加で必要',
        groupId: 'g-approve',
        position: { x: 100, y: 264 },
      },
      {
        id: 'p2',
        kind: 'process',
        title: '部長が承認',
        summary: '内容と予算科目を確認する',
        details: { owner: '部長', notes: '不在時は代理承認者が対応' },
        groupId: 'g-approve',
        position: { x: 380, y: 290 },
      },
      {
        id: 'p3',
        kind: 'process',
        title: '上長が承認',
        summary: '業務上必要な支出かを確認する',
        details: { owner: '直属の上長' },
        groupId: 'g-approve',
        position: { x: 112, y: 460 },
      },
      {
        id: 'p4',
        kind: 'process',
        title: '経理が精査',
        summary: '領収書と申請内容の一致、規程違反がないかを確認',
        details: {
          owner: '経理部',
          description: '不備があれば差し戻し。差し戻し理由はコメント欄に記入する。',
        },
        groupId: 'g-pay',
        position: { x: 112, y: 620 },
      },
      { id: 'e', kind: 'end', title: '翌月の給与で振込', groupId: 'g-pay', position: { x: 112, y: 724 } },
    ],
    edges: [
      { id: 'e1', source: 's', target: 'p1' },
      { id: 'e2', source: 'p1', target: 'd1' },
      { id: 'e3', source: 'd1', target: 'p2', label: 'Yes' },
      { id: 'e4', source: 'd1', target: 'p3', label: 'No' },
      { id: 'e5', source: 'p2', target: 'p3' },
      { id: 'e6', source: 'p3', target: 'p4' },
      { id: 'e7', source: 'p4', target: 'e', detail: '毎月 20 日締め、翌月 10 日の給与と合わせて振り込む' },
    ],
    groups: [
      { id: 'g-apply', title: '申請', summary: '申請者が行う作業' },
      { id: 'g-approve', title: '承認', summary: '金額に応じて上長・部長が承認する', description: '承認期限は申請から 5 営業日。' },
      { id: 'g-pay', title: '精算', summary: '経理部が行う作業' },
    ],
  };
}
