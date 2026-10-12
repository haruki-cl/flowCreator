import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openEditorWith } from './helpers';

async function exportViewer(page: Page, outPath: string) {
  await page.getByTestId('tool-more').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('menu-export-viewer').click()]);
  await download.saveAs(outPath);
  return download.suggestedFilename();
}

test('閲覧用 HTML はオフラインで単体で開け、ホバー・クリック・ズームが効く', async ({ page, context }, testInfo) => {
  await openEditorWith(page, 'small.flow.json');
  const out = testInfo.outputPath('viewer.html');
  expect(await exportViewer(page, out)).toBe('小さいフロー.html');
  expect((await fs.stat(out)).size).toBeLessThan(600 * 1024);

  const viewer = await context.newPage();
  const external: string[] = [];
  viewer.on('request', (r) => {
    if (!/^(file|data|blob):/.test(r.url())) external.push(r.url());
  });
  const errors: string[] = [];
  viewer.on('pageerror', (e) => errors.push(e.message));
  await context.setOffline(true);
  await viewer.goto(pathToFileURL(out).href);

  await expect(viewer.getByTestId('viewer-title')).toHaveText('小さいフロー');
  await expect(viewer.getByTestId('flow-node')).toHaveCount(4);
  await expect(viewer.locator('.react-flow__edge')).toHaveCount(3);

  await viewer.getByTestId('flow-node').filter({ hasText: '内容を確認' }).hover();
  await expect(viewer.getByTestId('tooltip')).toHaveText('申請内容と添付書類を確認する');

  await viewer.getByTestId('flow-node').filter({ hasText: '内容を確認' }).click();
  const panel = viewer.getByTestId('detail-panel');
  await expect(panel).toContainText('不足があれば差し戻す。');
  await expect(panel).toContainText('窓口担当');
  await expect(panel.locator('input, textarea')).toHaveCount(0);

  const canvas = viewer.getByTestId('canvas');
  await expect(canvas).toHaveAttribute('data-zoom-level', '1');
  await viewer.mouse.move(300, 400);
  for (let i = 0; i < 10 && (await canvas.getAttribute('data-zoom-level')) !== '2'; i++) {
    await viewer.mouse.wheel(0, -300);
    await viewer.waitForTimeout(150);
  }
  await expect(canvas).toHaveAttribute('data-zoom-level', '2');

  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});

test('悪意のある文字列が入ったフローでもスクリプトは実行されず、javascript: リンクは無効', async ({ page, context }, testInfo) => {
  await openEditorWith(page, 'xss.flow.json');
  const out = testInfo.outputPath('xss.html');
  await exportViewer(page, out);
  const html = await fs.readFile(out, 'utf8');
  expect(html).not.toContain('<script>window.pwned');

  const viewer = await context.newPage();
  await viewer.goto(pathToFileURL(out).href);
  await expect(viewer.getByTestId('viewer-title')).toHaveText('</script><script>window.pwned=1</script>');
  await expect(viewer.getByTestId('flow-node')).toContainText('<img src=x onerror="window.pwned=2">');
  await viewer.getByTestId('flow-node').click();
  const panel = viewer.getByTestId('detail-panel');
  await expect(panel).toContainText('$& $1 </script>');
  await expect(panel.getByRole('link', { name: '安全なリンク' })).toHaveAttribute('href', 'https://example.com/');
  await expect(panel.getByRole('link', { name: '危険なリンク' })).toHaveCount(0);
  await expect(panel.getByText('危険なリンク')).toBeVisible();
  expect(await viewer.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
});
