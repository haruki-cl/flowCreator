import { expect, test } from '@playwright/test';
import { importFixture, node } from './helpers';

const items = (page: import('@playwright/test').Page) => page.getByTestId('library-item');

test('保存したフローは一覧から開き直せる（新しいフローを作っても前のフローは残る）', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-sample').click();
  await expect(page.getByTestId('flow-node')).toHaveCount(7);
  await page.getByTestId('flow-title').fill('経費精算（編集版）');

  // 新しいフローへ切り替える（確認なし。サンプルは保存されたまま）
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-new').click();
  await expect(page.getByTestId('flow-node')).toHaveCount(0);

  await page.getByTestId('open-library').click();
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).first()).toContainText('無題のフロー');
  await expect(items(page).first()).toContainText('編集中');
  await expect(items(page).nth(1)).toContainText('経費精算（編集版）');
  await expect(items(page).nth(1)).toContainText('ノード 7');

  await items(page).filter({ hasText: '経費精算（編集版）' }).getByRole('button').first().click();
  await expect(page.getByTestId('library')).toHaveCount(0);
  await expect(page.getByTestId('flow-title')).toHaveValue('経費精算（編集版）');
  await expect(node(page, '経費申請を提出')).toBeVisible();

  // リロードすると最後に開いたフローが出る
  await page.reload();
  await expect(page.getByTestId('flow-title')).toHaveValue('経費精算（編集版）');
});

test('⌘O で一覧を開け、編集中でないフローを削除できる。読み込んだファイルも一覧に入る', async ({ page }) => {
  await page.goto('/');
  await importFixture(page, 'small.flow.json');
  await expect(page.getByTestId('flow-title')).toHaveValue('小さいフロー');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-new').click();

  await page.getByTestId('canvas').click({ position: { x: 300, y: 300 } });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+o' : 'Control+o');
  await expect(items(page)).toHaveCount(2);
  page.once('dialog', (d) => void d.accept());
  await items(page).filter({ hasText: '小さいフロー' }).getByRole('button', { name: /削除/ }).click();
  await expect(items(page)).toHaveCount(1);
  // 編集中のフローには削除ボタンを出さない
  await expect(items(page).first().getByRole('button', { name: /削除/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('library')).toHaveCount(0);
});
