import { expect, test } from '@playwright/test';
import { modKey, node, openEditorWith } from './helpers';

test('初期表示は最小限（ツールバー 4 ボタン、パネル・ツールチップなし）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByTestId('empty-hint')).toBeVisible();
  await expect(page.locator('[data-toolbar-button]')).toHaveCount(4);
  await expect(page.getByTestId('detail-panel')).toHaveCount(0);
  await expect(page.getByTestId('tooltip')).toHaveCount(0);
  await expect(page.locator('.react-flow__minimap, .react-flow__controls')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('ダブルクリックで追加 → Enter で次々につなげて追加 → Undo', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('canvas').dblclick({ position: { x: 400, y: 200 } });
  const input = page.getByTestId('title-input');
  await expect(input).toBeFocused();
  await input.fill('受付');
  await input.press('Enter');
  for (const title of ['確認', '記録']) {
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('title-input')).toBeFocused();
    await page.getByTestId('title-input').fill(title);
    await page.getByTestId('title-input').press('Enter');
  }
  await expect(page.getByTestId('flow-node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.getByTestId('empty-hint')).toHaveCount(0);

  // 下に向かって並んでいる
  const boxes = await Promise.all(['受付', '確認', '記録'].map((t) => node(page, t).boundingBox()));
  expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
  expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);

  // 「記録」のタイトル確定 → ノード追加 の順に戻る
  await page.keyboard.press(`${modKey}+z`);
  await expect(node(page, '記録')).toHaveCount(0);
  await page.keyboard.press(`${modKey}+z`);
  await expect(page.getByTestId('flow-node')).toHaveCount(2);
  await page.keyboard.press(`${modKey}+Shift+z`);
  await expect(page.getByTestId('flow-node')).toHaveCount(3);
});

test('クリックでパネル、空白クリック・Esc で閉じる。複数選択では開かない', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  await node(page, '内容を確認').click();
  const panel = page.getByTestId('detail-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('panel-title')).toHaveValue('内容を確認');
  // 値のある項目だけ表示（担当はある、メモはない）
  await expect(page.getByTestId('panel-owner')).toHaveValue('窓口担当');
  await expect(page.getByTestId('panel-notes')).toHaveCount(0);

  await page.getByTestId('canvas').click({ position: { x: 100, y: 700 } });
  await expect(panel).toHaveCount(0);

  await node(page, '受付').click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  await node(page, '受付').click();
  await node(page, '記録する').click({ modifiers: ['Shift'] });
  await expect(panel).toHaveCount(0);
});

test('パネルで要約を書くと「•」が付き、入力欄の Backspace でノードは消えない', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  const target = node(page, '記録する');
  await expect(target).toHaveAttribute('data-has-summary', 'false');
  await expect(target.getByTestId('detail-marker')).toHaveCount(0);
  await target.click();
  const summary = page.getByTestId('panel-summary');
  await summary.fill('台帳に記録する');
  await summary.press('Backspace');
  await expect(page.getByTestId('flow-node')).toHaveCount(4);
  await expect(target).toHaveAttribute('data-has-summary', 'true');
  await expect(target.getByTestId('detail-marker')).toBeVisible();

  // 「+ 項目を追加」で必要な項目だけ出す
  await page.getByTestId('add-field').click();
  await page.getByRole('button', { name: 'メモ' }).click();
  await expect(page.getByTestId('panel-notes')).toBeVisible();
});

test('分岐から Tab で追加すると "No"、Enter で "Yes" が付く', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tool-add').click();
  await page.getByTestId('add-decision').click();
  await page.getByTestId('title-input').fill('在庫あり？');
  await page.getByTestId('title-input').press('Enter');
  await page.keyboard.press('Tab');
  await page.getByTestId('title-input').fill('発注');
  await page.getByTestId('title-input').press('Enter');
  await node(page, '在庫あり？').click();
  await expect(page.getByTestId('detail-panel')).toBeVisible();
  await page.keyboard.press('Escape'); // パネルを閉じる（選択は残る）
  await expect(page.getByTestId('detail-panel')).toHaveCount(0);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await page.getByTestId('title-input').fill('出荷');
  await page.getByTestId('title-input').press('Enter');
  const labels = page.getByTestId('edge-label');
  await expect(labels).toHaveCount(2);
  await expect(labels.filter({ hasText: 'No' })).toHaveCount(1);
  await expect(labels.filter({ hasText: 'Yes' })).toHaveCount(1);
});

test('ドラッグ後の Undo で元の位置に戻る', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  const target = node(page, '記録する');
  const before = (await target.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + 300, before.y + 40, { steps: 8 });
  await page.mouse.up();
  const moved = (await target.boundingBox())!;
  expect(Math.abs(moved.x - before.x)).toBeGreaterThan(100);
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${modKey}+z`);
  await expect.poll(async () => Math.round((await target.boundingBox())!.x)).toBe(Math.round(before.x));
});

test('自動整列で重ならず、Undo で戻る', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  // わざと重ねる
  const a = (await node(page, '受付').boundingBox())!;
  const c = node(page, '記録する');
  const cb = (await c.boundingBox())!;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 5, { steps: 8 });
  await page.mouse.up();
  const gap = async () => {
    const [p, q] = await Promise.all([node(page, '受付').boundingBox(), c.boundingBox()]);
    return Math.round(q!.y - p!.y);
  };
  const gapAfterDrag = await gap();
  expect(gapAfterDrag).toBeLessThan(44); // 重なっている
  await page.getByTestId('tool-layout').click();
  await page.waitForTimeout(400);
  const boxes = await page.getByTestId('flow-node').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i];
      const q = boxes[j];
      const overlap = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
      expect(overlap).toBe(false);
    }
  }
  // Undo で整列前（重なった状態）に戻る。整列後の全体表示でズームは変わらない（maxZoom 1）ので画面上の差で比べる
  await page.keyboard.press(`${modKey}+z`);
  await expect.poll(gap).toBe(gapAfterDrag);
});

test('ハンドルから線を引いて空白で離すと、そこにノードができてつながる', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  const from = node(page, '完了');
  await from.hover();
  const handle = from.locator('.react-flow__handle-right');
  await expect(handle).toBeVisible();
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 260, hb.y + 40, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('title-input')).toBeFocused();
  await page.getByTestId('title-input').fill('後処理');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('flow-node')).toHaveCount(5);
  await expect(page.locator('.react-flow__edge')).toHaveCount(4);

  // ノード本体の上で離したら、そのノードにつながる
  await node(page, '後処理').hover();
  const hb2 = (await node(page, '後処理').locator('.react-flow__handle-top').boundingBox())!;
  const target = (await node(page, '受付').boundingBox())!;
  await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2 + 20, target.y + target.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(5);
  await expect(page.getByTestId('flow-node')).toHaveCount(5);
});

test('リロードしても内容が残る（ブラウザ保存）', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  await node(page, '記録する').click();
  await page.getByTestId('panel-summary').fill('保存されるはずの要約');
  await page.getByTestId('flow-title').fill('保存テスト');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.waitForTimeout(700);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.reload();
  await expect(page.getByTestId('flow-title')).toHaveValue('保存テスト');
  await expect(page.getByTestId('flow-node')).toHaveCount(4);
  await node(page, '記録する').click();
  await expect(page.getByTestId('panel-summary')).toHaveValue('保存されるはずの要約');
});

test('ノードをほかのノードの上に落とすと、重ならない近くの位置へずれる', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-sample').click();
  await page.waitForTimeout(100);
  const target = await node(page, '申請者が立替払い').boundingBox();
  const moving = await node(page, '経費申請を提出').boundingBox();
  // スクリーンショットと同じく、ほぼ真上に重ねて離す
  await page.mouse.move(moving!.x + moving!.width / 2, moving!.y + moving!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2 + 10, target!.y + target!.height / 2 + 15, { steps: 10 });
  await page.mouse.up();

  const boxes = await page.getByTestId('flow-node').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i];
      const q = boxes[j];
      const overlap = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
      expect(overlap, `${i} と ${j}`).toBe(false);
    }
  }
  // 離した位置の近くに留まる（遠くへ飛ばない）
  const after = (await node(page, '経費申請を提出').boundingBox())!;
  expect(Math.hypot(after.x - target!.x, after.y - target!.y)).toBeLessThan(120);
  // 1 回の Undo でドラッグ前に戻る
  await page.keyboard.press(`${modKey}+z`);
  await expect.poll(async () => Math.round((await node(page, '経費申請を提出').boundingBox())!.y)).toBe(Math.round(moving!.y));
});
