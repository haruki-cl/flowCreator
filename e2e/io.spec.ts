import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { parseDocumentText } from '../src/core/schema';
import { importFixture, openEditorWith } from './helpers';

test('JSON の書き出し → 読み込みで往復できる', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  await page.getByTestId('tool-more').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('menu-export-json').click()]);
  expect(download.suggestedFilename()).toBe('小さいフロー.flow.json');
  const text = await fs.readFile((await download.path())!, 'utf8');
  const parsed = parseDocumentText(text);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    expect(parsed.doc.nodes).toHaveLength(4);
    expect(parsed.doc.edges.find((e) => e.id === 'e2')?.detail).toBe('確認できたら次へ\n二行目');
    expect(text).not.toMatch(/"selected"|"measured"/);
  }
});

test('不正なファイル・新しいバージョンのファイルはエラーにして、今のフローを変えない', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  await importFixture(page, 'invalid.json');
  await expect(page.getByTestId('toast')).toContainText('flowCreator のファイルではありません');
  await expect(page.getByTestId('flow-node')).toHaveCount(4);

  await page.getByTestId('toast').getByRole('button').click();
  await importFixture(page, 'future-version.flow.json');
  await expect(page.getByTestId('toast')).toContainText('新しいバージョン');
  await expect(page.getByTestId('flow-node')).toHaveCount(4);
});
