import type { TmcCatalogEmote, TmcEmoteCatalog } from '../../shared/chat/TmcEmoteCatalog';
import { isTwitchLogin } from '../../shared/chat/TmcUserColors';

export type TmcCompletionToken = { readonly kind: 'user' | 'emote'; readonly start: number; readonly end: number; readonly query: string };
export type TmcCompletionChoice = { readonly kind: 'user'; readonly value: string } |
  { readonly kind: 'emote'; readonly value: string; readonly id: string };

/** A trigger must start a whitespace-delimited word, never an email/URL/time. */
export function completionToken(text: string, caret: number, selectionEnd: number): TmcCompletionToken | null {
  if (!Number.isInteger(caret) || caret !== selectionEnd || caret < 0 || caret > text.length) return null;
  let start = caret;
  while (start > 0 && !/\s/u.test(text[start - 1]) && caret - start <= 129) start--;
  if (caret === start || (start > 0 && !/\s/u.test(text[start - 1]))) return null;
  const marker = text[start];
  if (marker !== '@' && marker !== ':') return null;
  const query = text.slice(start + 1, caret);
  if (query.length > (marker === '@' ? 25 : 128) || /\s/u.test(query) || (marker === '@' && !/^[a-z0-9_]*$/i.test(query))) return null;
  let end = caret;
  while (end < text.length && !/\s/u.test(text[end]) && end - start <= 129 &&
    (marker !== '@' || /[a-z0-9_]/i.test(text[end]))) end++;
  if (end - start - 1 > (marker === '@' ? 25 : 128)) return null;
  if (marker === ':') while (end > caret && /[.,!?]/u.test(text[end - 1])) end--;
  return { kind: marker === '@' ? 'user' : 'emote', start, end, query };
}

/** Prefix matches first; favorites first within the emote catalog, only usable codes. */
export function completionChoices(token: TmcCompletionToken, users: readonly string[], catalog: TmcEmoteCatalog | null): readonly TmcCompletionChoice[] {
  const query = token.query.toLowerCase();
  const choices: TmcCompletionChoice[] = [];
  if (token.kind === 'user') {
    for (const user of users.slice(-1000).reverse()) {
      const name = user.toLowerCase();
      if (isTwitchLogin(name)) choices.push({ kind: 'user', value: name });
    }
  } else if (catalog) {
    const emotes: readonly TmcCatalogEmote[] = [...catalog.favorites,
      ...catalog.emotes.filter((emote) => emote.category === 'channel'),
      ...catalog.emotes.filter((emote) => emote.category === 'personal'),
      ...catalog.emotes.filter((emote) => emote.category === 'global')];
    for (const emote of emotes) {
      if (emote.availability === 'available') choices.push({ kind: 'emote', value: emote.name, id: emote.id });
    }
  }
  const seen = new Set<string>();
  const prefix: TmcCompletionChoice[] = [];
  const contains: TmcCompletionChoice[] = [];
  for (const choice of choices) {
    if (seen.has(choice.value)) continue;
    seen.add(choice.value);
    const name = choice.value.toLowerCase();
    if (name.startsWith(query)) prefix.push(choice);
    else if (token.kind === 'emote' && name.includes(query)) contains.push(choice);
    if (prefix.length >= 20) break;
  }
  return [...prefix, ...contains].slice(0, 20);
}

/** Replace only the active word, preserving surrounding draft and its punctuation. */
export function completionEdit(text: string, token: TmcCompletionToken, choice: TmcCompletionChoice): { value: string; caret: number } {
  const after = text.slice(token.end);
  const value = choice.kind === 'user' ? `@${choice.value}` : choice.value;
  const separator = !after || !/^[\s.,!?;:)\]}]/u.test(after) ? ' ' : '';
  const inserted = value + separator;
  return { value: text.slice(0, token.start) + inserted + after,
    caret: token.start + inserted.length + (after.startsWith(' ') ? 1 : 0) };
}
