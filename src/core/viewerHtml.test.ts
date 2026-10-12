import { describe, expect, it } from 'vitest';
import { createSampleDocument } from './sample.ts';
import { buildViewerHtml, safeJsonForScript } from './viewerHtml.ts';

const template = `<!doctype html><html><head><title>Viewer</title><script type="module">console.log("app")</script></head>
<body><div id="root"></div><script id="flowcreator-data" type="application/json">null</script></body></html>`;

function extractJson(html: string): unknown {
  const m = html.match(/<script id="flowcreator-data" type="application\/json">([\s\S]*?)<\/script>/);
  return JSON.parse(m![1]);
}

describe('buildViewerHtml', () => {
  it('データタグをちょうど 1 回置換し、JSON として読み戻せる', () => {
    const doc = createSampleDocument();
    const html = buildViewerHtml(template, doc);
    expect(html.match(/flowcreator-data/g)).toHaveLength(1);
    expect(extractJson(html)).toEqual(doc);
  });

  it('</script> や U+2028 を含むタイトルでも脱出されない', () => {
    const doc = { ...createSampleDocument(), title: '</script><script>window.pwned=1</script>\u2028&' };
    const html = buildViewerHtml(template, doc);
    expect(html).not.toContain('<script>window.pwned');
    expect(html).toContain('<title>&lt;/script&gt;&lt;script&gt;window.pwned=1&lt;/script&gt;\u2028&amp;</title>');
    expect(extractJson(html)).toEqual(doc);
  });

  it('$& や $1 を含む文字列をそのまま保持する', () => {
    const doc = { ...createSampleDocument(), title: '価格 $& と $1 と $$' };
    const html = buildViewerHtml(template, doc);
    expect((extractJson(html) as { title: string }).title).toBe('価格 $& と $1 と $$');
    expect(html).toContain('<title>価格 $&amp; と $1 と $$</title>');
  });

  it('埋め込み位置がなければ例外', () => {
    expect(() => buildViewerHtml('<html></html>', createSampleDocument())).toThrow();
  });

  it('safeJsonForScript は < > & をエスケープする', () => {
    expect(safeJsonForScript({ a: '<>&' })).toBe('{"a":"\\u003c\\u003e\\u0026"}');
  });
});
