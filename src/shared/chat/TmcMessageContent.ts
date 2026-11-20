/** Provider-neutral message pieces; original text is retained for copying/fallback. */
export type TmcMessageFragment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'emote'; readonly provider: 'twitch'; readonly id: string; readonly text: string };

const EMOTE_ID = /^(?:[0-9]+|emotesv2_[A-Za-z0-9_-]+)$/;
const MAX_EMOTES = 256;

export function twitchEmoteImageUrl(id: string): string | null {
  if (id.length > 128 || !EMOTE_ID.test(id)) return null;
  return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
}

/** Twitch IRC ranges are inclusive Unicode code-point offsets, not UTF-16 indices. */
export function parseTwitchMessageContent(text: string, emotesRaw?: string): readonly TmcMessageFragment[] {
  const displayText = text.startsWith('\u0001ACTION ') && text.endsWith('\u0001')
    ? text.slice(8, -1) : text;
  const plain = (): readonly TmcMessageFragment[] => [{ kind: 'text', text: displayText }];
  if (!emotesRaw || emotesRaw.length > 16384) return plain();
  const characters = Array.from(displayText);
  const ranges: Array<{ start: number; end: number; id: string }> = [];
  for (const entry of emotesRaw.split('/')) {
    const parts = entry.split(':');
    if (parts.length !== 2 || !twitchEmoteImageUrl(parts[0])) return plain();
    for (const rawRange of parts[1].split(',')) {
      const match = /^(\d+)-(\d+)$/.exec(rawRange);
      if (!match || ranges.length >= MAX_EMOTES) return plain();
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
          start > end || end >= characters.length) return plain();
      ranges.push({ start, end, id: parts[0] });
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const fragments: TmcMessageFragment[] = [];
  let cursor = 0;
  let previous: typeof ranges[number] | undefined;
  for (const range of ranges) {
    if (previous && range.start === previous.start && range.end === previous.end && range.id === previous.id) continue;
    if (range.start < cursor) return plain();
    if (range.start > cursor) fragments.push({ kind: 'text', text: characters.slice(cursor, range.start).join('') });
    const code = characters.slice(range.start, range.end + 1).join('');
    if (!code || /\s/.test(code)) return plain();
    fragments.push({ kind: 'emote', provider: 'twitch', id: range.id, text: code });
    cursor = range.end + 1;
    previous = range;
  }
  if (cursor < characters.length) fragments.push({ kind: 'text', text: characters.slice(cursor).join('') });
  return fragments.length ? fragments : plain();
}
