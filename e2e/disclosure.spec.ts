import { expect, test } from '@playwright/test';
import { node, openEditorWith, zoomLevel } from './helpers';

test('ホバーは 200ms 待ってから要約を出し、離れたら消え、続けて別要素に移ると即表示', async ({ page }) => {
  await page.clock.install();
  await openEditorWith(page, 'small.flow.json', { settle: false });
  const tooltip = page.getByTestId('tooltip');

  await node(page, '内容を確認').hover();
  await page.clock.runFor(120);
  await expect(tooltip).toHaveCount(0);
  await page.clock.runFor(100);
  await expect(tooltip).toHaveText('申請内容と添付書類を確認する');

  // 要約がないノードは何も出さない
  await node(page, '記録する').hover();
  await page.clock.runFor(600);
  await expect(tooltip).toHaveCount(0);

  // 詳細だけあるノードは案内文
  await node(page, '完了').hover();
  await page.clock.runFor(100);
  await expect(tooltip).toHaveText('詳細あり（クリックで表示）');

  await page.mouse.move(5, 790);
  await expect(tooltip).toHaveCount(0);

  // エッジの詳細は 1 行目だけ
  await page.getByTestId('edge-label').filter({ hasText: 'OK' }).hover();
  await page.clock.runFor(500);
  await expect(tooltip).toHaveText('確認できたら次へ');
});

test('クリックで詳細を開いている間、そのノードのツールチップは出ない', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  await node(page, '内容を確認').click();
  await page.mouse.move(5, 790);
  await node(page, '内容を確認').hover();
  await page.waitForTimeout(700);
  await expect(page.getByTestId('tooltip')).toHaveCount(0);
});

test('拡大すると要約がノード内に出て、縮小すると「•」も消える', async ({ page }) => {
  await openEditorWith(page, 'small.flow.json');
  expect(await zoomLevel(page)).toBe('1');
  const summary = node(page, '内容を確認').locator('.fc-summary');
  await expect(summary).toBeHidden();
  await expect(node(page, '内容を確認').getByTestId('detail-marker')).toBeVisible();

  await page.mouse.move(5, 790);
  for (let i = 0; i < 6 && (await zoomLevel(page)) !== '2'; i++) {
    await page.keyboard.press('+');
    await page.waitForTimeout(250);
  }
  expect(await zoomLevel(page)).toBe('2');
  await expect(summary).toBeVisible();
  // 要約しかないノード（なし）／詳細があるノードの「•」は残る
  await expect(node(page, '内容を確認').getByTestId('detail-marker')).toBeVisible();

  for (let i = 0; i < 12 && (await zoomLevel(page)) !== '0'; i++) {
    await page.keyboard.press('-');
    await page.waitForTimeout(250);
  }
  expect(await zoomLevel(page)).toBe('0');
  await expect(summary).toBeHidden();
  await expect(node(page, '内容を確認').getByTestId('detail-marker')).toBeHidden();
});

test('分岐の要約は、拡大すると菱形の横（線のない側）に出て、枠に収まり、線やノードと重ならない', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-sample').click();
  await page.waitForTimeout(100);
  const decision = node(page, '金額は5万円以上？');
  await expect(decision.getByTestId('decision-caption')).toHaveCount(0);

  await page.mouse.move(5, 790);
  for (let i = 0; i < 6 && (await zoomLevel(page)) !== '2'; i++) {
    await page.keyboard.press('+');
    await page.waitForTimeout(250);
  }
  expect(await zoomLevel(page)).toBe('2');
  const caption = decision.getByTestId('decision-caption');
  await expect(caption).toBeVisible();
  await expect(caption).toHaveText('5 万円以上は部長承認が追加で必要');
  // 菱形の中には要約を出さない
  await expect(decision.locator('.fc-content .fc-summary')).toHaveCount(0);

  // 右には「Yes」の線が出ているので、左側に出る
  const shape = (await decision.locator('.fc-shape').boundingBox())!;
  const c = (await caption.boundingBox())!;
  expect(c.x + c.width).toBeLessThanOrEqual(shape.x);
  expect(c.y).toBeGreaterThanOrEqual(shape.y);
  expect(c.y + c.height).toBeLessThanOrEqual(shape.y + shape.height);

  // 所属する枠の中に収まる
  const frame = (await page.locator('[data-testid="group-frame"][data-group-id="g-approve"]').boundingBox())!;
  expect(c.x).toBeGreaterThanOrEqual(frame.x);

  // ほかのノードと重ならず、線も上を通らない
  for (const other of await page.getByTestId('flow-node').all()) {
    if ((await other.getAttribute('data-node-id')) === 'd1') continue;
    const o = (await other.boundingBox())!;
    const overlap = c.x < o.x + o.width && o.x < c.x + c.width && c.y < o.y + o.height && o.y < c.y + c.height;
    expect(overlap).toBe(false);
  }
  const crossing = await page.evaluate((r) => {
    for (const path of document.querySelectorAll<SVGPathElement>('path.react-flow__edge-path')) {
      const ctm = path.getScreenCTM()!;
      const length = path.getTotalLength();
      for (let i = 0; i <= 200; i++) {
        const p = new DOMPoint(path.getPointAtLength((length * i) / 200).x, path.getPointAtLength((length * i) / 200).y).matrixTransform(ctm);
        if (p.x > r.x + 1 && p.x < r.x + r.width - 1 && p.y > r.y + 1 && p.y < r.y + r.height - 1) return true;
      }
    }
    return false;
  }, c);
  expect(crossing).toBe(false);
});

test('分岐の「•」は菱形の外枠の上（右上の辺の中間）にあり、拡大しても外枠から離れない', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tool-more').click();
  await page.getByTestId('menu-sample').click();
  await page.waitForTimeout(100);
  const decision = node(page, '金額は5万円以上？');
  const onOutline = async () => {
    const shape = (await decision.locator('.fc-shape').boundingBox())!;
    const marker = (await decision.getByTestId('detail-marker').boundingBox())!;
    const mx = marker.x + marker.width / 2;
    const my = marker.y + marker.height / 2;
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    return {
      // 菱形の外枠: |x - cx| / (W/2) + |y - cy| / (H/2) = 1
      outline: Math.abs(mx - cx) / (shape.width / 2) + Math.abs(my - cy) / (shape.height / 2),
      upperRight: mx > cx && my < cy,
    };
  };
  const l1 = await onOutline();
  expect(l1.upperRight).toBe(true);
  expect(Math.abs(l1.outline - 1)).toBeLessThan(0.05);

  // 拡大時（L2）は詳細のあるノードだけ「•」を出すので、詳細を付けてから確かめる
  await decision.click();
  await page.getByTestId('panel-description').fill('部長承認の基準');
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 790);
  for (let i = 0; i < 6 && (await zoomLevel(page)) !== '2'; i++) {
    await page.keyboard.press('+');
    await page.waitForTimeout(250);
  }
  expect(await zoomLevel(page)).toBe('2');
  const l2 = await onOutline();
  expect(l2.upperRight).toBe(true);
  expect(Math.abs(l2.outline - 1)).toBeLessThan(0.05);
});
