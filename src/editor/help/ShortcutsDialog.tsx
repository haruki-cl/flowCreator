import { useEffect } from 'react';
import { useUi } from '../../shared/ui/uiStore';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: Array<[string, string]> = [
  ['ダブルクリック（空白）', 'ノードを追加'],
  ['Enter', '選択中のノードの下に次のノードを追加'],
  ['Tab', '選択中のノードの右に分岐を追加'],
  ['F2 / ダブルクリック', '見出しを編集'],
  ['I', '詳細パネルを開く / 閉じる'],
  ['Esc', 'パネルを閉じる → 選択を解除'],
  ['Delete / Backspace', '削除（枠を選んでいるときは枠だけを外す）'],
  [`${mod}+G`, '選んだノードを枠（グループ）でまとめる'],
  [`${mod}+Shift+G`, '枠を外す（ノードを選んでいるときは、そのノードを枠から外す）'],
  ['枠の名前をドラッグ', '枠ごと移動'],
  ['ノードを枠の中へドラッグ', 'その枠に入る（枠のノードは動かしても外れず、枠が広がる）'],
  [`${mod}+O`, '保存したフローの一覧（変更は自動で保存されます）'],
  [isMac ? '⌘+J' : 'Ctrl+Shift+J', 'Claude Code（AI）のターミナルを開く / 閉じる（npm run dev のとき）'],
  [`${mod}+Z`, '元に戻す'],
  [`${mod}+Shift+Z`, 'やり直す'],
  ['Shift+L', '自動整列'],
  ['Shift+1', '全体を表示'],
  ['+ / −', '拡大 / 縮小（表示される情報量も変わります）'],
  ['?', 'この一覧'],
];

export function ShortcutsDialog() {
  const open = useUi((s) => s.helpOpen);
  const setHelpOpen = useUi((s) => s.setHelpOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setHelpOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, setHelpOpen]);

  if (!open) return null;
  return (
    <div className="fc-dialog-backdrop" onClick={() => setHelpOpen(false)}>
      <div className="fc-dialog" role="dialog" aria-modal="true" aria-label="ショートカット" onClick={(e) => e.stopPropagation()}>
        <h2>使い方</h2>
        <p className="fc-muted" style={{ marginTop: 0 }}>
          ノードには短い見出しだけを書き、説明はパネルの「要約」「詳細」へ。要約はホバーで、詳細はクリックで表示されます。拡大すると要約がノード内に表示されます。
        </p>
        <table>
          <tbody>
            {SHORTCUTS.map(([key, label]) => (
              <tr key={key}>
                <td>
                  <span className="fc-kbd">{key}</span>
                </td>
                <td>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="fc-dialog-actions">
          <button type="button" className="fc-text-button" onClick={() => setHelpOpen(false)} autoFocus>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
