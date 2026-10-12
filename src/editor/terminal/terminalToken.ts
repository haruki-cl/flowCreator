const TOKEN_META = 'flowcreator-terminal-token';

/** 開発サーバー（npm run dev）で開いたときだけ、HTML にターミナル用のトークンが入っている */
export function terminalToken(): string | null {
  return document.querySelector<HTMLMetaElement>(`meta[name="${TOKEN_META}"]`)?.content ?? null;
}
