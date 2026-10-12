import { newId } from './factory.ts';
import type { FlowDocument } from './model.ts';
import { parseDocument, type ParseResult } from './schema.ts';

/**
 * 共有リンク: フローの中身を URL の # 以降に入れて、リンクだけで渡せるようにする。
 * 形式は `<公開版の URL>#flow=1.<圧縮した JSON の base64url>`。先頭の `1.` は形式の版。
 * # 以降はサーバーに送られないので、GitHub Pages 側に中身は残らず、長さの制限も受けない。
 */

export const SHARE_PARAM = 'flow';
const LINK_VERSION = 1;
/** 展開後の大きさの上限（極端なデータで固まらないように） */
export const MAX_SHARED_BYTES = 2 * 1024 * 1024;
/** これより長いリンクは、貼り付け先のアプリによっては途中で切れることがある */
export const LONG_LINK_CHARS = 8000;

/** id と日時は受け取る側で付け直すので入れない（その分 URL が短くなる） */
type SharedFlow = Omit<FlowDocument, 'id' | 'createdAt' | 'updatedAt'>;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('invalid base64url');
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 上限を超えたら途中でやめて展開する */
async function inflate(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** リンクの # 以降に入れる文字列を作る */
export async function encodeSharePayload(doc: FlowDocument): Promise<string> {
  const { id: _id, createdAt: _created, updatedAt: _updated, ...shared } = doc;
  const compressed = await deflate(new TextEncoder().encode(JSON.stringify(shared satisfies SharedFlow)));
  return `${LINK_VERSION}.${toBase64Url(compressed)}`;
}

export function shareUrl(base: string, payload: string): string {
  const withoutHash = base.split('#')[0];
  return `${withoutHash}#${SHARE_PARAM}=${payload}`;
}

/** location.hash から共有リンクの中身を取り出す。共有リンクでなければ null */
export function readShareHash(hash: string): string | null {
  if (!hash.startsWith('#')) return null;
  return new URLSearchParams(hash.slice(1)).get(SHARE_PARAM);
}

/** 共有リンクの中身を、新しい id と今の日時を付けたフローに戻して検証する */
export async function decodeSharePayload(payload: string, now = new Date()): Promise<ParseResult> {
  const dot = payload.indexOf('.');
  const version = Number(payload.slice(0, dot));
  if (dot <= 0 || !Number.isInteger(version)) return { ok: false, error: '共有リンクの形式が正しくありません' };
  if (version > LINK_VERSION) return { ok: false, error: 'このリンクは新しいバージョンの flowCreator で作られています' };
  let json: unknown;
  try {
    const bytes = await inflate(fromBase64Url(payload.slice(dot + 1)), MAX_SHARED_BYTES);
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, error: '共有リンクが壊れているか、途中で切れています' };
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, error: '共有リンクの形式が正しくありません' };
  }
  const iso = now.toISOString();
  return parseDocument({ ...json, id: newId(), createdAt: iso, updatedAt: iso });
}
