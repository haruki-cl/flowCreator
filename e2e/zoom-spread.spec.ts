import { expect, test, type Page } from '@playwright/test';
import { edgesCrossingNodes, modKey, openEditorWith, zoomLevel } from './helpers';

const IDS = ['q', 'a', 'b', 'h'];

async function boxes(page: Page) {
  const result: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const id of IDS) result[id] = (await page.locator(`[data-node-id="${id}"]`).boundingBox())!;
  return result;
}

async function zoomTo(page: Page, level: '1' | '2') {
  await page.mouse.move(5, 790);
  for (let i = 0; i < 8 && (await zoomLevel(page)) !== level; i++) {
    await page.keyboard.press(level === '2' ? '+' : '-');
    await page.waitForTimeout(250);
  }
  expect(await zoomLevel(page)).toBe(level);
  await page.waitForTimeout(150);
}

/** 縦に並ぶ（横の範囲が重なる）ノードどうしの、縦のすき間の最小値（画面上の px） */
function minVerticalGap(b: Awaited<ReturnType<typeof boxes>>): number {
  let min = Infinity;
  for (const p of IDS) {
    for (const q of IDS) {
      if (p === q) continue;
      const P = b[p];
      const Q = b[q];
      const sameColumn = P.x < Q.x + Q.width && Q.x < P.x + P.width;
      if (sameColumn && P.y < Q.y) min = Math.min(min, Q.y - (P.y + P.height));
    }
  }
  return min;
}

async function zoom(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')!;
    return new DOMMatrix(getComputedStyle(viewport).transform).a;
  });
}

test('拡大して要約が出ても、ノードの間が詰まらない（表示だけ広げ、通常表示に戻すと元の配置）', async ({ page }) => {
  await openEditorWith(page, 'cramped-zoom.flow.json');
  const normal = await boxes(page);
  const normalScale = await zoom(page);

  await zoomTo(page, '2');
  const zoomed = await boxes(page);
  const scale = await zoom(page);
  // すき間は 32px（画面上は拡大率ぶん大きい）以上。ぎりぎりに詰まらない
  expect(minVerticalGap(zoomed)).toBeGreaterThanOrEqual(32 * scale - 2);
  // 横に並んだノードは揃ったまま
  expect(Math.abs(zoomed.a.y - zoomed.b.y)).toBeLessThan(1);
  // 線はノードの下を通らず、Yes / No のラベルもノードに隠れない
  expect(await edgesCrossingNodes(page)).toEqual([]);
  for (const label of await page.getByTestId('edge-label').all()) {
    const l = (await label.boundingBox())!;
    const cx = l.x + l.width / 2;
    const cy = l.y + l.height / 2;
    for (const id of IDS) {
      const n = zoomed[id];
      expect(cx > n.x && cx < n.x + n.width && cy > n.y && cy < n.y + n.height, `ラベルが ${id} に重なっている`).toBe(false);
    }
  }

  // 通常表示に戻すと、保存している配置どおり（拡大率が拡大前と同じとは限らないので、フロー上の座標で比べる）
  await zoomTo(page, '1');
  const back = await boxes(page);
  const backScale = await zoom(page);
  for (const id of IDS) {
    const before = (normal[id].y - normal.q.y) / normalScale;
    const after = (back[id].y - back.q.y) / backScale;
    expect(Math.abs(after - before), id).toBeLessThan(1);
  }
});

test('拡大したままドラッグしても離した場所に置け、通常表示でも重ならない', async ({ page }) => {
  await openEditorWith(page, 'cramped-zoom.flow.json');
  // 読み込みのお知らせが画面下のノードに重なるので閉じておく
  await page.getByTestId('toast').getByRole('button').click();
  const relative = async () => {
    const b = await boxes(page);
    const z = await zoom(page);
    return { x: (b.h.x - b.q.x) / z, y: (b.h.y - b.q.y) / z };
  };
  const original = await relative();
  await zoomTo(page, '2');
  const before = (await page.locator('[data-node-id="h"]').boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  // React Flow はドラッグ開始の判定に最初の 1 歩を使うので、細かい歩幅で動かす
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 80, { steps: 40 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const after = (await page.locator('[data-node-id="h"]').boundingBox())!;
  expect(Math.abs(after.x - (before.x + 60))).toBeLessThan(4);
  expect(Math.abs(after.y - (before.y + 80))).toBeLessThan(4);
  expect(minVerticalGap(await boxes(page))).toBeGreaterThanOrEqual(32 * (await zoom(page)) - 2);

  await zoomTo(page, '1');
  const normal = await boxes(page);
  for (const p of IDS) {
    for (const q of IDS) {
      if (p >= q) continue;
      const P = normal[p];
      const Q = normal[q];
      const overlap = P.x < Q.x + Q.width && Q.x < P.x + P.width && P.y < Q.y + Q.height && Q.y < P.y + P.height;
      expect(overlap, `${p} と ${q} が重なっている`).toBe(false);
    }
  }
  // 1 回の Undo でドラッグ前の位置に戻る
  await page.keyboard.press(`${modKey}+z`);
  await expect.poll(async () => {
    const r = await relative();
    return Math.abs(r.x - original.x) < 1 && Math.abs(r.y - original.y) < 1;
  }).toBe(true);
});
