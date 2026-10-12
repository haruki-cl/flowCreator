import { expect, test } from '@playwright/test';
import { edgesCrossingNodes, edgesHuggingFrames, node, openEditorWith, overlappingEdges, zoomLevel } from './helpers';

test('途中にノードがあれば、線はその下を通らず避け、ラベルも隠れない', async ({ page }) => {
  await openEditorWith(page, 'route-around.flow.json');
  expect(await edgesCrossingNodes(page)).toEqual([]);
  const label = (await page.getByTestId('edge-label').boundingBox())!;
  const blocker = (await node(page, 'じゃまなノード').boundingBox())!;
  const cx = label.x + label.width / 2;
  const cy = label.y + label.height / 2;
  expect(cx > blocker.x && cx < blocker.x + blocker.width && cy > blocker.y && cy < blocker.y + blocker.height).toBe(false);

  // じゃまなノードをどけると、まっすぐな線に戻る
  const b = (await node(page, 'じゃまなノード').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 400, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  const d = await page.locator('.react-flow__edge-path').first().getAttribute('d');
  expect(d).not.toContain('Q');
});

test('サンプルを拡大して菱形が大きくなっても、線はノードの下を通らない', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-sample').click();
  await page.waitForTimeout(100);
  expect(await edgesCrossingNodes(page)).toEqual([]);
  await page.mouse.move(5, 790);
  for (let i = 0; i < 6 && (await zoomLevel(page)) !== '2'; i++) {
    await page.keyboard.press('+');
    await page.waitForTimeout(250);
  }
  expect(await zoomLevel(page)).toBe('2');
  expect(await edgesCrossingNodes(page)).toEqual([]);
});

test('ノードを線の上に動かすと、線がそのノードを避ける', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-sample').click();
  await page.waitForTimeout(100);
  // 「部長が承認」を、開始 → 申請の線の真横から線の上に重なる位置へ動かす
  const target = (await node(page, '部長が承認').boundingBox())!;
  const start = (await node(page, '申請者が立替払い').boundingBox())!;
  const submit = (await node(page, '経費申請を提出').boundingBox())!;
  const midY = (start.y + start.height + submit.y) / 2;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 120, midY + 300, { steps: 6 });
  await page.mouse.move(start.x + start.width / 2 + 60, midY, { steps: 6 });
  await page.mouse.up();
  expect(await edgesCrossingNodes(page)).toEqual([]);
});

test('線どうしが同じ所を並んで通らない（合流・分岐・同じ辺への出入り）', async ({ page }) => {
  await openEditorWith(page, 'shared-track.flow.json');
  expect(await overlappingEdges(page)).toEqual([]);
  expect(await edgesCrossingNodes(page)).toEqual([]);
});

test('サンプルでも、拡大しても、線どうしが重ならない', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-sample').click();
  await page.waitForTimeout(100);
  expect(await overlappingEdges(page)).toEqual([]);
  await page.mouse.move(5, 790);
  for (let i = 0; i < 6 && (await zoomLevel(page)) !== '2'; i++) {
    await page.keyboard.press('+');
    await page.waitForTimeout(250);
  }
  expect(await overlappingEdges(page)).toEqual([]);
  expect(await edgesCrossingNodes(page)).toEqual([]);
});

test('線は枠の名前の上を通らず、枠の縁にも沿わない（どの拡大段階でも）', async ({ page }) => {
  await openEditorWith(page, 'frame-edges.flow.json');
  await page.getByTestId('toast').getByRole('button').click();
  expect(await edgesHuggingFrames(page)).toEqual([]);
  expect(await edgesCrossingNodes(page)).toEqual([]);
  for (const key of ['+', '+', '-', '-', '-', '-']) {
    await page.mouse.move(5, 790);
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    expect(await edgesHuggingFrames(page), `拡大段階 ${await zoomLevel(page)}`).toEqual([]);
  }
});

