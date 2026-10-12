import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { createSampleDocument } from './sample.ts';
import { decodeSharePayload, encodeSharePayload, readShareHash, shareUrl } from './shareLink.ts';

const BASE = 'https://haruki-cl.github.io/flowCreator/';
const strip = ({ id: _i, createdAt: _c, updatedAt: _u, ...rest }: ReturnType<typeof createSampleDocument>) => rest;

describe('共有リンク', () => {
  it('作ったリンクを開くと、id と日時以外は元のフローと同じになる', async () => {
    const doc = createSampleDocument();
    const url = shareUrl(BASE, await encodeSharePayload(doc));
    expect(url.startsWith(`${BASE}#flow=1.`)).toBe(true);
    const payload = readShareHash(new URL(url).hash)!;
    const result = await decodeSharePayload(payload, new Date('2026-10-12T00:00:00Z'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(strip(result.doc)).toEqual(strip(doc));
    expect(result.doc.id).not.toBe(doc.id); // 受け取った側では別のフローになる
    expect(result.doc.createdAt).toBe('2026-10-12T00:00:00.000Z');
  });

  it('サンプル（7 ノード）のリンクは 2,000 字に収まる', async () => {
    const url = shareUrl(BASE, await encodeSharePayload(createSampleDocument()));
    expect(url.length).toBeLessThan(2000);
  });

  it('</script> や $& を含む文字列も、そのまま往復できる', async () => {
    const doc = { ...createSampleDocument(), title: '</script><script>alert(1)</script> $& $1 😀' };
    const result = await decodeSharePayload((await encodeSharePayload(doc)).toString());
    expect(result.ok && result.doc.title).toBe(doc.title);
  });

  it('壊れたリンク・途中で切れたリンク・形式違い・新しい版はエラーになる', async () => {
    const payload = await encodeSharePayload(createSampleDocument());
    const cases = [
      'abc',
      '1.!!!!',
      payload.slice(0, Math.floor(payload.length / 2)), // 途中で切れた
      `9.${payload.slice(2)}`,
      `1.${Buffer.from(deflateRawSync(Buffer.from('{"hello":1}'))).toString('base64url')}`,
      `1.${Buffer.from(deflateRawSync(Buffer.from('[1,2,3]'))).toString('base64url')}`,
    ];
    for (const c of cases) {
      const result = await decodeSharePayload(c);
      expect(result.ok, c.slice(0, 20)).toBe(false);
    }
    const future = await decodeSharePayload(`9.${payload.slice(2)}`);
    expect(!future.ok && future.error).toContain('新しいバージョン');
  });

  it('展開すると極端に大きくなるデータは途中でやめる', async () => {
    const huge = Buffer.from(deflateRawSync(Buffer.alloc(5 * 1024 * 1024, 0x20))).toString('base64url');
    const result = await decodeSharePayload(`1.${huge}`);
    expect(result.ok).toBe(false);
  });

  it('# 以降に共有リンクがないときは null', () => {
    expect(readShareHash('')).toBeNull();
    expect(readShareHash('#other=1')).toBeNull();
    expect(readShareHash('#flow=1.abc')).toBe('1.abc');
  });
});
