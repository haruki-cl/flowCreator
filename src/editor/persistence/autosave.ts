import type { StoreApi } from 'zustand';
import type { FlowDocument } from '../../core/model';
import { toDocument } from '../../core/serialize';
import type { DocState } from '../store/docStore';

export const AUTOSAVE_DEBOUNCE_MS = 500;

export type SaveStatus = 'saving' | 'saved' | 'error';

export type Autosave = {
  /** 待っている保存があれば今すぐ保存する */
  flush: () => Promise<void>;
  /** 今の内容は保存済みとみなす（保存済みのフローを開いた直後に、開いただけで保存し直さないため） */
  markSaved: () => void;
  /** 保存していない変更があるか */
  isDirty: () => boolean;
  stop: () => void;
};

/** キーを並べ替えて文字列にする（ファイルから読んだデータと画面のデータでは、キーの順番が違うことがあるため） */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 保存内容の比較用。updatedAt は保存のたびに変わるので含めない */
export function contentKeyOf(doc: FlowDocument): string {
  return stableStringify({ ...doc, updatedAt: '' });
}

function contentKey(state: DocState): string {
  return contentKeyOf(toDocument(state.meta, state.nodes, state.edges, state.groups));
}

/**
 * 文書が変わったら debounce して保存する。内容が前回保存時と同じなら書かない
 * （選択状態の変化や寸法の計測だけでは保存しない）。
 */
export function startAutosave(
  store: Pick<StoreApi<DocState>, 'getState' | 'subscribe'>,
  persist: (doc: FlowDocument) => Promise<void>,
  onStatus: (status: SaveStatus) => void,
): Autosave {
  let lastSaved = contentKey(store.getState());
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = async () => {
    timer = null;
    const state = store.getState();
    const key = contentKey(state);
    if (key === lastSaved) return;
    onStatus('saving');
    const doc = toDocument({ ...state.meta, updatedAt: new Date().toISOString() }, state.nodes, state.edges, state.groups);
    try {
      await persist(doc);
      lastSaved = key;
      onStatus('saved');
    } catch {
      onStatus('error');
    }
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.nodes === prev.nodes && state.edges === prev.edges && state.groups === prev.groups && state.meta === prev.meta) {
      return;
    }
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS);
  });

  return {
    flush: async () => {
      if (timer !== null) {
        clearTimeout(timer);
        await save();
      }
    },
    isDirty: () => contentKey(store.getState()) !== lastSaved,
    markSaved: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      lastSaved = contentKey(store.getState());
    },
    stop: () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    },
  };
}
