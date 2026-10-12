import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name);

/** JSON を読み込む（今のフローは保存したまま、新しいフローとして開く） */
export async function importFixture(page: Page, name: string) {
  await page.getByTestId('import-input').setInputFiles(fixture(name));
}

/** 読み込み後の「全体を表示」（requestAnimationFrame 内）が終わるまで待つ */
export async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** page.clock.install() したテストでは requestAnimationFrame が止まるので settle: false にする */
export async function openEditorWith(page: Page, name: string, options: { settle?: boolean } = {}) {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
  await importFixture(page, name);
  await expect(page.getByTestId('flow-title')).not.toHaveValue('無題のフロー');
  if (options.settle !== false) await settle(page);
}

export const node = (page: Page, title: string) => page.getByTestId('flow-node').filter({ hasText: title });

export const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

export async function zoomLevel(page: Page) {
  return page.getByTestId('canvas').getAttribute('data-zoom-level');
}

/** すべての線について、途中の点がノード（両端のノードを除く）の内側に入っていないかを調べる */
export async function edgesCrossingNodes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>('[data-testid="flow-node"]')].map((el) => ({
      id: el.dataset.nodeId!,
      rect: el.getBoundingClientRect(),
    }));
    const problems: string[] = [];
    for (const edge of document.querySelectorAll<SVGGElement>('.react-flow__edge')) {
      const path = edge.querySelector<SVGPathElement>('path.react-flow__edge-path');
      if (!path) continue;
      const ctm = path.getScreenCTM()!;
      const length = path.getTotalLength();
      const at = (t: number) => new DOMPoint(path.getPointAtLength(length * t).x, path.getPointAtLength(length * t).y).matrixTransform(ctm);
      // 両端の点が乗っているノードは、その線がつないでいるノード
      const ends = [at(0), at(1)];
      const touching = (r: DOMRect, p: DOMPoint) => p.x >= r.left - 2 && p.x <= r.right + 2 && p.y >= r.top - 2 && p.y <= r.bottom + 2;
      for (const { id, rect } of nodes) {
        if (ends.some((p) => touching(rect, p))) continue;
        for (let i = 1; i < 200; i++) {
          const p = at(i / 200);
          if (p.x > rect.left + 1 && p.x < rect.right - 1 && p.y > rect.top + 1 && p.y < rect.bottom - 1) {
            problems.push(`${edge.dataset.id} が ${id} の下を通っている`);
            break;
          }
        }
      }
    }
    return problems;
  });
}

/** 2 本の線が、同じ位置を一定の長さ以上並んで通っていないかを調べる（画面上で 2px ごとに点を取って比べる） */
export async function overlappingEdges(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const STEP = 2;
    const MIN_RUN = 12;
    const edges = [...document.querySelectorAll<SVGGElement>('.react-flow__edge')].map((edge) => {
      const path = edge.querySelector<SVGPathElement>('path.react-flow__edge-path')!;
      const ctm = path.getScreenCTM()!;
      const length = path.getTotalLength();
      const scale = Math.hypot(ctm.a, ctm.b);
      const count = Math.max(2, Math.ceil((length * scale) / STEP));
      const points: DOMPoint[] = [];
      for (let i = 0; i <= count; i++) {
        const p = path.getPointAtLength((length * i) / count);
        points.push(new DOMPoint(p.x, p.y).matrixTransform(ctm));
      }
      return { id: edge.dataset.id!, points };
    });
    const problems: string[] = [];
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const other = edges[j].points;
        let run = 0;
        let longest = 0;
        for (const p of edges[i].points) {
          const near = other.some((q) => Math.abs(p.x - q.x) < 1.5 && Math.abs(p.y - q.y) < 1.5);
          run = near ? run + 1 : 0;
          longest = Math.max(longest, run);
        }
        if (longest * STEP >= MIN_RUN) problems.push(`${edges[i].id} と ${edges[j].id} が重なっている（約 ${longest * STEP}px）`);
      }
    }
    return problems;
  });
}

/**
 * 線が枠の名前の上を通っていないか、枠の縁に沿って走っていないかを調べる（画面上で 2px ごとに点を取る）。
 * 縁を垂直に横切るのは問題ないので、縁から BAND 以内を縁と平行に MIN_RUN 以上走ったときだけ問題にする
 */
export async function edgesHuggingFrames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const BAND = 8;
    const MIN_RUN = 20;
    const frames = [...document.querySelectorAll<HTMLElement>('[data-testid="group-frame"]')].map((el) => el.getBoundingClientRect());
    const labels = [...document.querySelectorAll<HTMLElement>('[data-testid="group-label"]')].map((el) => el.getBoundingClientRect());
    const problems: string[] = [];
    for (const edge of document.querySelectorAll<SVGGElement>('.react-flow__edge')) {
      const path = edge.querySelector<SVGPathElement>('path.react-flow__edge-path')!;
      const ctm = path.getScreenCTM()!;
      const length = path.getTotalLength();
      const count = Math.max(2, Math.ceil((length * Math.hypot(ctm.a, ctm.b)) / 2));
      const points: DOMPoint[] = [];
      for (let i = 0; i <= count; i++) {
        const p = path.getPointAtLength((length * i) / count);
        points.push(new DOMPoint(p.x, p.y).matrixTransform(ctm));
      }
      const id = edge.dataset.id;
      for (const l of labels) {
        if (points.some((p) => p.x > l.left + 1 && p.x < l.right - 1 && p.y > l.top + 1 && p.y < l.bottom - 1)) {
          problems.push(`${id} が枠の名前の上を通っている`);
        }
      }
      for (const f of frames) {
        const lines = [
          { horizontal: true, at: f.top },
          { horizontal: true, at: f.bottom },
          { horizontal: false, at: f.left },
          { horizontal: false, at: f.right },
        ];
        for (const line of lines) {
          let run = 0;
          let longest = 0;
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            const parallel = line.horizontal ? Math.abs(a.y - b.y) < 0.5 : Math.abs(a.x - b.x) < 0.5;
            const near = line.horizontal
              ? Math.abs(b.y - line.at) < BAND && b.x > f.left && b.x < f.right
              : Math.abs(b.x - line.at) < BAND && b.y > f.top && b.y < f.bottom;
            run = parallel && near ? run + Math.hypot(b.x - a.x, b.y - a.y) : 0;
            longest = Math.max(longest, run);
          }
          if (longest >= MIN_RUN) problems.push(`${id} が枠の縁に沿って走っている（約 ${Math.round(longest)}px）`);
        }
      }
    }
    return problems;
  });
}

