import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { FILE_STORE_DIR } from '../playwright.config';
import { createSampleDocument } from '../src/core/sample';
import { modKey, node } from './helpers';

const dir = path.resolve(import.meta.dirname, '..', FILE_STORE_DIR);

// 保存先のフォルダを共有するので、このファイルのテストは 1 つずつ順に流す
test.describe.configure({ mode: 'serial' });
test.use({ baseURL: 'http://localhost:4174' });

test.beforeEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
});

const files = async () => (await readdir(dir)).filter((f) => f.endsWith('.flow.json')).sort();
const readJson = async (file: string) => JSON.parse(await readFile(path.join(dir, file), 'utf8'));

async function openSample(page: Page) {
  await page.goto('/');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-sample').click();
  await expect(page.getByTestId('flow-node')).toHaveCount(7);
  await expect.poll(files).toHaveLength(1);
}

test('フローは flows フォルダに「フロー名__ID.flow.json」として自動で保存され、名前を変えるとファイル名も変わる', async ({ page }) => {
  await openSample(page);
  const [file] = await files();
  expect(file).toMatch(/^経費精算フロー（サンプル）__[A-Za-z0-9_-]+\.flow\.json$/);
  const doc = await readJson(file);
  expect(doc.nodes).toHaveLength(7);
  expect(doc.groups).toHaveLength(3);

  await node(page, '経費申請を提出').click();
  await page.getByTestId('panel-summary').fill('ファイルにも残る要約');
  await expect.poll(async () => (await readJson((await files())[0])).nodes.find((n: { id: string }) => n.id === 'p1')?.summary).toBe('ファイルにも残る要約');

  await page.getByTestId('flow-title').fill('経費精算');
  await expect.poll(files).toEqual([`経費精算__${doc.id}.flow.json`]);
  // 自分で保存した内容を「外部での変更」と取り違えない
  await page.waitForTimeout(500);
  await expect(page.getByText('ファイルの変更を読み込みました')).toHaveCount(0);

  // 一覧に保存先のフォルダが出る
  await page.getByTestId('open-library').click();
  await expect(page.getByTestId('library-location')).toContainText(dir);
});

test('AI などがファイルを書き換えると、開いている画面に反映され、⌘Z で元に戻せる', async ({ page }) => {
  await openSample(page);
  const [file] = await files();
  const doc = await readJson(file);
  // 画面の外でファイルを書き換える（AI が編集した想定）
  doc.nodes = doc.nodes.map((n: { id: string; title: string }) => (n.id === 'p1' ? { ...n, title: 'AI が書き換えた見出し' } : n));
  doc.updatedAt = new Date().toISOString();
  await writeFile(path.join(dir, file), JSON.stringify(doc, null, 2));

  await expect(node(page, 'AI が書き換えた見出し')).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('ファイルの変更を読み込みました');

  // 取り込みは Undo できる。戻した内容はファイルにも保存される
  await page.getByTestId('canvas').click({ position: { x: 100, y: 700 } });
  await page.keyboard.press(`${modKey}+z`);
  await expect(node(page, '経費申請を提出')).toBeVisible();
  await expect.poll(async () => (await readJson(file)).nodes.find((n: { id: string }) => n.id === 'p1')?.title).toBe('経費申請を提出');
});

test('ブラウザのデータが空でも、フォルダにある一番新しいフローを開く', async ({ page }) => {
  const doc = { ...createSampleDocument(), title: 'フォルダに置いたフロー' };
  await writeFile(path.join(dir, `手で置いた__${doc.id}.flow.json`), JSON.stringify(doc));
  await page.goto('/');
  await expect(page.getByTestId('flow-title')).toHaveValue('フォルダに置いたフロー');
});

test('ブラウザ内に保存していたフローは、初回にフォルダへコピーされる', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
  // ファイル保存になる前に、ブラウザ内（IndexedDB）へ保存していた状態を作る
  const legacy = { ...createSampleDocument(), title: 'ブラウザにあった古いフロー' };
  await page.evaluate(async (doc) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('keyval-store');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('keyval', 'readwrite');
      tx.objectStore('keyval').put(doc, `flow:${doc.id}`);
      tx.objectStore('keyval').delete('meta:migratedToFiles');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }, legacy);
  await page.reload();
  await expect(page.getByTestId('toast')).toContainText('1 件のフローをファイルにコピーしました');
  await expect.poll(files).toEqual([`ブラウザにあった古いフロー__${legacy.id}.flow.json`]);
});

test('Claude Code のターミナルを横に開き、「@ このフロー」で指定して AI に書き換えさせると画面に反映される', async ({ page }) => {
  await openSample(page);
  const before = (await page.getByTestId('canvas').boundingBox())!.width;
  await page.getByTestId('toggle-terminal').click();
  const terminal = page.getByTestId('terminal-panel');
  const screen = terminal.locator('.xterm-rows');
  await expect(screen).toContainText('fake-claude ready');
  // フローの画面は左に縮んで、両方が見える
  expect((await page.getByTestId('canvas').boundingBox())!.width).toBeLessThan(before - 200);
  await expect(node(page, '経費申請を提出')).toBeVisible();

  await page.keyboard.type('edit ');
  await page.getByTestId('terminal-insert-flow').click();
  await expect(screen).toContainText('e2e-flows/経費精算フロー（サンプル）__');
  await page.keyboard.press('Enter');
  await expect(screen).toContainText('edited');
  await expect(node(page, 'AI が書いた見出し')).toBeVisible();

  // ⌘J で閉じて開き直しても、再読み込みしても、続きから表示される
  await page.keyboard.press(`${modKey}+j`);
  await expect(terminal).toBeHidden();
  await page.keyboard.press(`${modKey}+j`);
  await expect(screen).toContainText('edited');
  await page.reload();
  await page.getByTestId('toggle-terminal').click();
  await expect(page.getByTestId('terminal-panel').locator('.xterm-rows')).toContainText('edited');
});
