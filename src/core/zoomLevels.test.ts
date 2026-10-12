import { describe, expect, it } from 'vitest';
import { nextZoomLevel, zoomLevelOf } from './zoomLevels.ts';

describe('zoomLevelOf', () => {
  it('閾値の境界', () => {
    expect(zoomLevelOf(0.54)).toBe(0);
    expect(zoomLevelOf(0.55)).toBe(1);
    expect(zoomLevelOf(1.24)).toBe(1);
    expect(zoomLevelOf(1.25)).toBe(2);
  });
});

describe('nextZoomLevel（ヒステリシス）', () => {
  it('上がるときは閾値ちょうどで切り替わる', () => {
    expect(nextZoomLevel(1, 1.25)).toBe(2);
    expect(nextZoomLevel(0, 0.55)).toBe(1);
    expect(nextZoomLevel(0, 1.5)).toBe(2);
  });
  it('下がるときは閾値 - 0.05 を下回るまで維持する', () => {
    expect(nextZoomLevel(2, 1.22)).toBe(2);
    expect(nextZoomLevel(2, 1.19)).toBe(1);
    expect(nextZoomLevel(1, 0.52)).toBe(1);
    expect(nextZoomLevel(1, 0.49)).toBe(0);
    expect(nextZoomLevel(2, 0.3)).toBe(0);
  });
});
