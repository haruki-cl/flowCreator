import { newId } from '../../core/factory';
import type { FlowDocument } from '../../core/model';
import type { ParseResult } from '../../core/schema';
import { decodeSharePayload, readShareHash } from '../../core/shareLink';
import { toDocument } from '../../core/serialize';
import { useUi } from '../../shared/ui/uiStore';
import { useDoc } from '../store/docStore';
import { contentKeyOf, type Autosave } from './autosave';
import {
  browserRepository,
  detectRepository,
  loadInitialDocument,
  migrateBrowserFlows,
  setLastOpened,
  type FlowRepository,
} from './repository';
import { idbStorage } from './storage';

let repository: FlowRepository = browserRepository(idbStorage);
let active: Autosave | null = null;
const listeners = new Set<() => void>();

export function getRepository(): FlowRepository {
  return repository;
}

export function attachAutosave(autosave: Autosave | null): void {
  active = autosave;
}

export type InitResult = {
  doc: FlowDocument | null;
  migrated: number;
  /** 共有リンクから開いたときの結果（共有リンクでなければ null） */
  shared: ParseResult | null;
};

let initializing: Promise<InitResult> | null = null;

/**
 * 起動時: 保存先を決め、ブラウザ内の古いフローをファイルへ移し、最初に開くフローを読む。
 * 共有リンクから開いたときは、そのフローを新しいフローとして保存して開く（壊れていればいつものフローを開く）。
 * 開発時の React（StrictMode）は起動処理を 2 回呼ぶので、2 回目以降は 1 回目の結果を返す
 */
export function initSession(): Promise<InitResult> {
  initializing ??= (async () => {
    repository = await detectRepository(idbStorage);
    const migrated = repository.kind === 'files' ? await migrateBrowserFlows(idbStorage, repository) : 0;
    const shared = await takeSharedLink();
    if (shared?.ok) {
      await persist(shared.doc);
      return { doc: shared.doc, migrated, shared };
    }
    return { doc: await loadInitialDocument(repository, idbStorage), migrated, shared };
  })();
  return initializing;
}

/**
 * URL の # に共有リンクの中身があれば取り出し、URL からは消す
 * （再読み込みで同じフローが増えないように。アドレスバーに長い URL を残さないように）。
 * 共有リンクでなければ null
 */
export async function takeSharedLink(): Promise<ParseResult | null> {
  const payload = readShareHash(location.hash);
  if (payload === null) return null;
  history.replaceState(history.state, '', location.pathname + location.search);
  return decodeSharePayload(payload);
}

/** 自動保存から呼ばれる。保存先へ書き、最後に開いたフローとして覚える */
export async function persist(doc: FlowDocument): Promise<void> {
  await repository.save(doc);
  await setLastOpened(idbStorage, doc.id);
}

/** 編集中の変更を保存し終えてから返す（一覧を開く前や、フローを切り替える前に呼ぶ） */
export async function flushPending(): Promise<void> {
  await active?.flush();
}

/**
 * 編集するフローを切り替える。今のフローは保存してから閉じるので、一覧からいつでも開き直せる。
 * - saved: 一覧から開いた保存済みのフロー（開いただけでは保存し直さない）
 * - new: 新規・サンプル・読み込んだファイル（すぐに保存して一覧に載せる）
 */
export async function switchDocument(doc: FlowDocument, source: 'saved' | 'new'): Promise<void> {
  await flushPending();
  const ui = useUi.getState();
  ui.openPanel(null);
  ui.setEditingTitle(null);
  ui.selectGroup(null);
  useDoc.getState().loadDocument(doc);
  if (source === 'saved') {
    active?.markSaved();
    await setLastOpened(idbStorage, doc.id);
  } else {
    await flushPending();
  }
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** 読み込んだファイルが保存済みのフローと同じ ID（またはファイル名に使えない ID）なら、別の ID を振る */
export async function asNewDocument(doc: FlowDocument): Promise<FlowDocument> {
  if (!SAFE_ID.test(doc.id) || (await repository.load(doc.id)) !== null) return { ...doc, id: newId() };
  return doc;
}

/** 保存したフローが外部で変わったときに知らせる（一覧の表示を更新するため） */
export function onFlowsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * AI などがファイルを書き換えたら、開いているフローに取り込む。
 * 自分が保存した内容と同じなら何もしない。保存前の編集が残っているときは、上書きしないよう取り込まずに知らせる。
 */
export async function handleExternalChange(): Promise<void> {
  for (const listener of listeners) listener();
  if (repository.kind !== 'files') return;
  const state = useDoc.getState();
  const current = toDocument(state.meta, state.nodes, state.edges, state.groups);
  const latest = await repository.load(current.id);
  if (!latest || contentKeyOf(latest) === contentKeyOf(current)) return;
  const ui = useUi.getState();
  if (active?.isDirty()) {
    ui.showToast('ファイルが外部で変更されましたが、編集中のため読み込んでいません', 'error');
    return;
  }
  ui.setEditingTitle(null);
  useDoc.getState().applyExternal(latest);
  active?.markSaved();
  ui.showToast('ファイルの変更を読み込みました（⌘Z で元に戻せます）');
}
