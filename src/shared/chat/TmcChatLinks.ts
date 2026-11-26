export type TmcChatTextPiece = { readonly kind: 'text'; readonly text: string } |
  { readonly kind: 'link'; readonly text: string; readonly href: string };
const CLOSING_BRACKETS = new Map([[')', '('], [']', '['], ['}', '{']]);

/** Shared validation, repeated in main before calling the OS browser boundary. */
export function externalChatUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096 || !/^https?:\/\//i.test(value) ||
      /[\s\p{Cc}\\]/u.test(value) || /^https?:\/\/[^/?#]*@/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > 4096) return null;
    return url.href;
  } catch { return null; }
}

/** Preserve exact message text; trim prose punctuation, keeping balanced URL brackets. */
export function linkifyChatText(text: string, limit = 100): readonly TmcChatTextPiece[] {
  const pieces: TmcChatTextPiece[] = [];
  let cursor = 0;
  let count = 0;
  const cap = Number.isSafeInteger(limit) ? Math.max(0, Math.min(100, limit)) : 100;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"`]+/giu)) {
    if (count >= cap) break;
    const start = match.index;
    if (start && /[\p{L}\p{N}_@]/u.test(text[start - 1])) continue;
    const raw = match[0];
    if (raw.length > 4096) continue;
    const counts = new Map<string, number>();
    for (const character of raw) {
      if ('()[]{}'.includes(character)) counts.set(character, (counts.get(character) || 0) + 1);
    }
    let end = raw.length;
    while (end > 0) {
      const last = raw[end - 1];
      if (/[.,!?;:']/u.test(last)) { end--; continue; }
      const open = CLOSING_BRACKETS.get(last);
      if (open && (counts.get(last) || 0) > (counts.get(open) || 0)) {
        counts.set(last, counts.get(last) - 1);
        end--;
        continue;
      }
      break;
    }
    const candidate = raw.slice(0, end);
    const href = externalChatUrl(candidate);
    if (!href) continue;
    if (start > cursor) pieces.push({ kind: 'text', text: text.slice(cursor, start) });
    pieces.push({ kind: 'link', text: candidate, href });
    cursor = start + candidate.length;
    count++;
  }
  if (cursor < text.length || !pieces.length) pieces.push({ kind: 'text', text: text.slice(cursor) });
  return pieces;
}
