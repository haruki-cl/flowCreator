const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** リンクとして描画してよい URL だけを返す（javascript: などは null） */
export function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}
