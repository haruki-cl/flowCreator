import { expect, test, type Page } from '@playwright/test';
import { createSampleDocument } from '../src/core/sample';
import { encodeSharePayload } from '../src/core/shareLink';
import { node, openEditorWith } from './helpers';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function copyShareLink(page: Page): Promise<string> {
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-share-link').click();
  await expect(page.getByTestId('toast')).toContainText('共有リンクをコピーしました');
  return page.evaluate(() => navigator.clipboard.readText());
}

test('共有リンクを別のブラウザで開くと、同じフローを編集できるコピーとして開く', async ({ page, browser }) => {
  await openEditorWith(page, 'grouped.flow.json');
  const url = await copyShareLink(page);
  expect(url).toMatch(/^http:\/\/localhost:4173\/#flow=1\.[A-Za-z0-9_-]+$/);

  // 受け取った人（ブラウザのデータが別）が開く
  const other = await browser.newContext();
  const received = await other.newPage();
  await received.goto(url);
  await expect(received.getByTestId('toast')).toContainText('共有リンクのフローを開きました');
  await expect(received.getByTestId('flow-title')).toHaveValue('グループ付きフロー');
  await expect(received.getByTestId('flow-node')).toHaveCount(4);
  await expect(received.locator('.react-flow__edge')).toHaveCount(3);
  await expect(received.getByTestId('group-label')).toContainText('受付フェーズ');
  await node(received, '内容を確認').click();
  await expect(received.getByTestId('panel-owner')).toHaveValue('窓口担当');
  // 開いたら URL から # 以降を消す
  expect(new URL(received.url()).hash).toBe('');

  // 受け取った側で編集でき、そのブラウザに保存される。再読み込みしても同じフローは増えない
  await received.getByTestId('flow-title').fill('受け取った人の版');
  await expect(received.getByTestId('save-state')).toHaveAttribute('data-save-state', 'saved');
  await received.reload();
  await expect(received.getByTestId('flow-title')).toHaveValue('受け取った人の版');
  await received.getByTestId('open-library').click();
  await expect(received.getByTestId('library-item')).toHaveCount(1);
  await other.close();

  // 作った人のフローはそのまま
  await expect(page.getByTestId('flow-title')).toHaveValue('グループ付きフロー');
});

test('壊れた共有リンクはエラーを出し、いつもの画面を開く', async ({ page }) => {
  const payload = await encodeSharePayload(createSampleDocument());
  await page.goto(`/#flow=${payload.slice(0, Math.floor(payload.length / 2))}`); // 途中で切れたリンク
  await expect(page.getByTestId('toast')).toContainText('共有リンクを開けませんでした');
  await expect(page.getByTestId('toast')).toContainText('途中で切れています');
  expect(new URL(page.url()).hash).toBe('');
  // エディタは普通に使える
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-sample').click();
  await expect(page.getByTestId('flow-node')).toHaveCount(7);
});

test('開いている画面のアドレスバーに共有リンクを貼っても開ける', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  const payload = await encodeSharePayload({ ...createSampleDocument(), title: '貼り付けたフロー' });
  // # 以降だけが変わるので、ページは読み込み直されない
  await page.evaluate((p) => {
    location.hash = `flow=${p}`;
  }, payload);
  await expect(page.getByTestId('toast')).toContainText('共有リンクのフローを開きました');
  await expect(page.getByTestId('flow-title')).toHaveValue('貼り付けたフロー');
  await expect(page.getByTestId('flow-node')).toHaveCount(7);
  expect(new URL(page.url()).hash).toBe('');
  // 前に開いていたフローは一覧に残る
  await page.getByTestId('open-library').click();
  await expect(page.getByTestId('library-item').filter({ hasText: '小さいフロー' })).toHaveCount(1);
});

test('長いリンクは、切れるおそれがあると知らせる（閉じるまで消えない）', async ({ page }) => {
  // 圧縮しにくい文字列を説明に入れたノードを並べて、8,000 字を超えるリンクにする
  let seed = 1;
  const random = () => (seed = (seed * 48271) % 0x7fffffff);
  const noise = (length: number) => Array.from({ length }, () => String.fromCharCode(0x3041 + (random() % 80))).join('');
  const nodes = Array.from({ length: 40 }, (_, i) => ({
    id: `n${i}`,
    kind: 'process',
    title: `手順 ${i + 1}`,
    details: { description: noise(120) },
    position: { x: (i % 5) * 240, y: Math.floor(i / 5) * 140 },
  }));
  const doc = { ...createSampleDocument(), title: '長いフロー', nodes, edges: [], groups: [] };
  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles({
    name: 'long.flow.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.getByTestId('flow-title')).toHaveValue('長いフロー');

  const url = await copyShareLink(page);
  expect(url.length).toBeGreaterThan(8000);
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('途中で切れることがあります');
  await page.waitForTimeout(2500);
  await expect(toast).toBeVisible();
});

test('クリップボードに書けないときは、リンクを選べるダイアログで見せる', async ({ page }) => {
  await page.addInitScript(() => {
    const deny = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    navigator.clipboard.write = deny;
    navigator.clipboard.writeText = deny;
  });
  await openEditorWith(page, 'small.flow.json');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-share-link').click();
  const field = page.getByTestId('share-url');
  await expect(field).toBeVisible();
  await expect(field).toHaveValue(/^http:\/\/localhost:4173\/#flow=1\./);
  // 開いたらすぐコピーできるよう、全体が選ばれている
  expect(await field.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart)).toBe(
    (await field.inputValue()).length,
  );
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
});
