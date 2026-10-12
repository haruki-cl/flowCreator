import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { modKey, node, openEditorWith } from './helpers';

const frame = (page: Page) => page.getByTestId('group-frame');

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('not visible');
  return b;
}

function inside(inner: { x: number; y: number; width: number; height: number }, outer: typeof inner) {
  return (
    inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
  );
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

const center = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test('2 つ以上選ぶと「グループにする」が出て、枠ができて名前を入力できる', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  await expect(frame(page)).toHaveCount(0);
  await node(page, '受付').click();
  await expect(page.getByTestId('group-chip')).toHaveCount(0);
  await node(page, '内容を確認').click({ modifiers: ['Shift'] });
  await page.getByTestId('group-chip').click();

  const input = page.getByTestId('title-input');
  await expect(input).toBeFocused();
  await input.fill('受付フェーズ');
  await input.press('Enter');
  await expect(page.getByTestId('group-label').locator('.fc-frame-title')).toHaveText('受付フェーズ');

  const f = await box(frame(page));
  expect(inside(await box(node(page, '受付')), f)).toBe(true);
  expect(inside(await box(node(page, '内容を確認')), f)).toBe(true);
  expect(inside(await box(node(page, '記録する')), f)).toBe(false);
});

test('⌘G でもまとめられ、Undo で元に戻る', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  await node(page, '記録する').click();
  await node(page, '完了').click({ modifiers: ['Shift'] });
  await page.keyboard.press(`${modKey}+g`);
  await page.getByTestId('title-input').press('Enter');
  await expect(frame(page)).toHaveCount(1);
  await page.keyboard.press(`${modKey}+z`);
  await page.keyboard.press(`${modKey}+z`);
  await expect(frame(page)).toHaveCount(0);
});

test('枠の名前: ホバーで要約、クリックで詳細パネル、選んで Delete で枠だけ消える', async ({ page }) => {
  await openEditorWith(page, 'grouped.flow.json');
  const label = page.getByTestId('group-label');
  await label.hover();
  await expect(page.getByTestId('tooltip')).toHaveText('窓口で受け付けて内容を確かめる');

  await label.click();
  await expect(frame(page)).toHaveClass(/is-selected/);
  await expect(page.getByTestId('panel-group-title')).toHaveValue('受付フェーズ');
  await expect(page.getByTestId('detail-panel')).toContainText('2 個のノード');

  await page.getByTestId('canvas').click({ position: { x: 100, y: 700 } });
  await expect(page.getByTestId('detail-panel')).toHaveCount(0);
  await label.click();
  await page.keyboard.press('Escape'); // パネルだけ閉じる（枠の選択は残る）
  await page.keyboard.press('Delete');
  await expect(frame(page)).toHaveCount(0);
  await expect(page.getByTestId('flow-node')).toHaveCount(4);
});

test('枠の名前をドラッグするとメンバーごと動き、Undo で戻る', async ({ page }) => {
  await openEditorWith(page, 'grouped.flow.json');
  const before = await box(node(page, '受付'));
  const free = await box(node(page, '記録する'));
  const label = await box(page.getByTestId('group-label'));
  await drag(page, center(label), { x: center(label).x + 250, y: center(label).y + 10 });
  const after = await box(node(page, '受付'));
  expect(Math.round(after.x - before.x)).toBe(250);
  expect(Math.round((await box(node(page, '内容を確認'))).x - before.x)).toBe(250);
  expect((await box(node(page, '記録する'))).x).toBe(free.x); // メンバー以外は動かない
  expect(inside(after, await box(frame(page)))).toBe(true);

  await page.keyboard.press(`${modKey}+z`);
  await expect.poll(async () => Math.round((await box(node(page, '受付'))).x)).toBe(Math.round(before.x));
});

test('枠の端のノードを少し動かしても枠から外れない（サンプルの「部長が承認」）', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-sample').click();
  await page.waitForTimeout(100);
  const approve = page.locator('[data-testid="group-frame"][data-group-id="g-approve"]');
  const target = await box(node(page, '部長が承認'));
  // 枠の右端を決めているノードを左下へ少しずらす（スクリーンショットの操作）
  await drag(page, center(target), { x: center(target).x - 40, y: center(target).y + 35 });
  expect(inside(await box(node(page, '部長が承認')), await box(approve))).toBe(true);
  await node(page, '部長が承認').click();
  await expect(page.getByTestId('panel-membership')).toContainText('承認');
});

test('枠のノードは外へドラッグしても外れず枠が広がる。外すのはパネルの「外す」', async ({ page }) => {
  await openEditorWith(page, 'grouped.flow.json');
  const member = await box(node(page, '内容を確認'));
  await drag(page, center(member), { x: center(member).x + 320, y: center(member).y + 40 });
  expect(inside(await box(node(page, '内容を確認')), await box(frame(page)))).toBe(true);

  await node(page, '内容を確認').click();
  await page.getByTestId('panel-membership').getByRole('button', { name: '外す' }).click();
  await expect(page.getByTestId('panel-membership')).toHaveCount(0);
  expect(inside(await box(node(page, '内容を確認')), await box(frame(page)))).toBe(false);
});

test('枠の外のノードを枠の中へドラッグすると入る', async ({ page }) => {
  await openEditorWith(page, 'grouped.flow.json');
  const f = await box(frame(page));
  const free = await box(node(page, '完了'));
  await page.mouse.move(center(free).x, center(free).y);
  await page.mouse.down();
  await page.mouse.move(center(f).x, center(f).y + 10, { steps: 10 });
  await expect(frame(page)).toHaveClass(/is-drop-target/);
  await page.mouse.up();
  await expect(frame(page)).not.toHaveClass(/is-drop-target/);
  expect(inside(await box(node(page, '完了')), await box(frame(page)))).toBe(true);

  // パネルにも所属が出る
  await node(page, '完了').click();
  await expect(page.getByTestId('panel-membership')).toContainText('受付フェーズ');
});

test('グループはリロード後も残り、JSON と閲覧用 HTML にも含まれる', async ({ page, context }, testInfo) => {
  await openEditorWith(page, 'grouped.flow.json');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await page.reload();
  await expect(page.getByTestId('group-label').locator('.fc-frame-title')).toHaveText('受付フェーズ');

  await page.getByTestId('tool-more').click();
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByTestId('menu-export-json').click()]);
  const doc = JSON.parse(await fs.readFile((await json.path())!, 'utf8'));
  expect(doc.schemaVersion).toBe(2);
  expect(doc.groups).toEqual([{ id: 'g1', title: '受付フェーズ', summary: '窓口で受け付けて内容を確かめる', description: '受付は平日 9〜17 時。' }]);

  await page.getByTestId('tool-more').click();
  const [html] = await Promise.all([page.waitForEvent('download'), page.getByTestId('menu-export-viewer').click()]);
  const out = testInfo.outputPath('grouped.html');
  await html.saveAs(out);
  const viewer = await context.newPage();
  await viewer.goto(pathToFileURL(out).href);
  await expect(viewer.getByTestId('group-frame')).toHaveCount(1);
  await viewer.getByTestId('group-label').click();
  const panel = viewer.getByTestId('detail-panel');
  await expect(panel).toContainText('受付は平日 9〜17 時。');
  await expect(panel).toContainText('含まれるステップ（2）');
  await expect(panel).toContainText('内容を確認');
});

test('枠の名前の高さを通る線は名前を避け、名前をつかんで枠を動かせる', async ({ page }) => {
  await openEditorWith(page, 'edge-over-label.flow.json');
  const label = await box(page.getByTestId('group-label'));
  // 以前は線が名前の中心を横切り、名前をつかめなくなっていた。今は線が名前を避ける
  const crossesLabel = await page.evaluate((r) => {
    const path = document.querySelector<SVGPathElement>('path.react-flow__edge-path')!;
    const ctm = path.getScreenCTM()!;
    const length = path.getTotalLength();
    for (let i = 0; i <= 200; i++) {
      const p = new DOMPoint(path.getPointAtLength((length * i) / 200).x, path.getPointAtLength((length * i) / 200).y).matrixTransform(ctm);
      if (p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height) return true;
    }
    return false;
  }, label);
  expect(crossesLabel).toBe(false);

  const before = await box(node(page, 'メンバー1'));
  await drag(page, center(label), { x: center(label).x + 200, y: center(label).y + 60 });
  const after = await box(node(page, 'メンバー1'));
  expect(Math.round(after.x - before.x)).toBe(200);
  expect(Math.round(after.y - before.y)).toBe(60);

  // クリックでも枠を選べる（矢印は選ばれない）
  await page.keyboard.press('Escape');
  await page.getByTestId('group-label').click();
  await expect(page.getByTestId('panel-group-title')).toHaveValue('承認');
  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);
});
