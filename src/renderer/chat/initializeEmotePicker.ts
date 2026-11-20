import type { TmcEmoteCatalog, TmcCatalogEmote } from '../../shared/chat/TmcEmoteCatalog';
import { createMessageContent } from './createMessageContent';
import { TMC_ACCOUNT_CHANGED_EVENT } from '../accounts/initializeAccountSwitcher';
import { TMC_AUTH_LOGGED_IN_EVENT, TMC_CHANNEL_CHANGED_EVENT } from './TmcChannelChatController';

const TMC_EMOTE_MESSAGE_SENT_EVENT = 'tmc:emote-message-sent';
export function notifyEmoteMessageSent(profileId: string, channel: string): void {
  window.dispatchEvent(new CustomEvent(TMC_EMOTE_MESSAGE_SENT_EVENT, { detail: { profileId, channel } }));
}

export function initializeEmotePicker(getChannel: () => string | null, onLayoutChange: () => void,
  onOpen: () => void = () => undefined): { close: () => void } {
  const panel = document.querySelector<HTMLElement>('[data-tmc-emote-picker]');
  const trigger = document.querySelector<HTMLButtonElement>('[data-tmc-emote-open]');
  const close = document.querySelector<HTMLButtonElement>('[data-tmc-emote-close]');
  const search = document.querySelector<HTMLInputElement>('[data-tmc-emote-search]');
  const grid = document.querySelector<HTMLElement>('[data-tmc-emote-grid]');
  const notice = document.querySelector<HTMLElement>('[data-tmc-emote-notice]');
  const contextLabel = document.querySelector<HTMLElement>('[data-tmc-emote-context]');
  const retry = document.querySelector<HTMLButtonElement>('[data-tmc-emote-retry]');
  const input = document.querySelector<HTMLInputElement>('#messageInput');
  if (!panel || !trigger || !close || !search || !grid || !notice || !contextLabel || !retry || !input) throw new Error('Emote picker markup is incomplete.');
  const lifetime = new AbortController();
  const listener = { signal: lifetime.signal };
  let revision = 0;
  let disposed = false;
  let catalog: TmcEmoteCatalog | null = null;
  const profileId = (): string => document.querySelector<HTMLSelectElement>('[data-tmc-account-select]')?.value || '';
  const current = (request: number, profile: string, channel: string): boolean => !disposed && request === revision &&
    !panel.hidden && profileId() === profile && getChannel() === channel;
  const dismiss = (): void => {
    revision++;
    catalog = null;
    grid.replaceChildren();
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    onLayoutChange();
  };
  const choose = (emote: TmcCatalogEmote): void => {
    if (!catalog || catalog.profileId !== profileId() || catalog.channel !== getChannel() || emote.availability !== 'available') return;
    const selectionStart = input.selectionStart ?? input.value.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const before = input.value.slice(0, selectionStart);
    const after = input.value.slice(selectionEnd);
    const insertion = `${before && !/\s$/.test(before) ? ' ' : ''}${emote.name}${!after || !/^\s/.test(after) ? ' ' : ''}`;
    input.setRangeText(insertion, selectionStart, selectionEnd, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  };
  const render = (): void => {
    if (!catalog) return;
    const query = search.value.trim().toLowerCase();
    const channelIds = new Set(catalog.emotes.filter((emote) => emote.category !== 'personal').map((emote) => emote.id));
    const sections = [
      { key: 'favorites', label: 'Favorites', emotes: catalog.favorites, empty: 'Send an emote to add it here. Up to 24, newest additions first.' },
      { key: 'channel', label: 'Channel', emotes: catalog.emotes.filter((emote) => emote.category === 'channel'), empty: 'No channel emotes.' },
      { key: 'personal', label: 'Account', emotes: catalog.emotes.filter((emote) => emote.category === 'personal' && !channelIds.has(emote.id)), empty: 'No other account emotes.' },
      { key: 'global', label: 'Global', emotes: catalog.emotes.filter((emote) => emote.category === 'global'), empty: 'No global emotes.' },
    ];
    const unique = new Map<string, TmcCatalogEmote>();
    if (query) {
      for (const emote of sections.flatMap((section) => section.emotes)) {
        const previous = unique.get(emote.id);
        if (!previous || (previous.availability !== 'available' && emote.availability === 'available')) unique.set(emote.id, emote);
      }
    }
    const groups = query ? [{ key: 'results', label: '', emotes: [...unique.values()], empty: 'No matching emotes.' }] : sections;
    const scrollTop = grid.scrollTop;
    grid.replaceChildren();
    let remaining = 300;
    let total = 0;
    for (const group of groups) {
      const matches = group.emotes.filter((emote) => emote.name.toLowerCase().includes(query));
      total += matches.length;
      const section = document.createElement('section');
      section.className = 'tmc-emote-section';
      section.dataset.tmcEmoteSection = group.key;
      const heading = document.createElement('h3');
      heading.textContent = `${group.label} (${matches.length})`;
      const choices = document.createElement('div');
      choices.className = 'tmc-emote-grid';
      const visible = matches.slice(0, remaining);
      remaining -= visible.length;
      for (const emote of visible) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tmc-emote-choice';
        button.disabled = emote.availability !== 'available';
        button.title = emote.availability === 'locked' ? `${emote.name} — Not available for this account`
          : emote.availability === 'unknown' ? `${emote.name} — Availability not confirmed by your sign-in` : emote.name;
        button.setAttribute('aria-label', button.title);
        button.appendChild(createMessageContent(emote.name, [{ kind: 'emote', provider: 'twitch', id: emote.id, text: emote.name }]));
        const name = document.createElement('small');
        name.textContent = emote.name;
        button.appendChild(name);
        button.addEventListener('click', () => choose(emote));
        choices.appendChild(button);
      }
      if (!query) section.appendChild(heading);
      section.appendChild(choices);
      if (!visible.length) {
        const empty = document.createElement('p');
        empty.className = 'tmc-emote-section-empty';
        empty.textContent = matches.length ? 'Search to show these emotes.' : query ? 'No matches.' : group.empty;
        section.appendChild(empty);
      }
      grid.appendChild(section);
    }
    grid.scrollTop = scrollTop;
    const permission = !catalog.personalPermission
      ? 'Personal emotes are not enabled by your current sign-in. Global emotes are available. ' : '';
    const storage = catalog.favoritesSaveFailed ? 'Favorites could not be loaded or saved. Messages can still be sent. ' : '';
    notice.textContent = storage + permission + (total > 300 ? `Showing 300 of ${total}. Search to narrow the list.` : '');
    notice.hidden = !notice.textContent;
  };
  const load = async (quiet = false): Promise<void> => {
    const request = ++revision;
    const profile = profileId();
    const channel = getChannel();
    if (!quiet) { catalog = null; grid.replaceChildren(); }
    retry.hidden = true;
    contextLabel.textContent = '';
    if (!profile || !channel) { notice.hidden = false; notice.textContent = 'Sign in and open a channel to use emotes.'; return; }
    contextLabel.textContent = `#${channel}`;
    if (!quiet) { notice.hidden = false; notice.textContent = 'Loading your emotes…'; }
    try {
      const result = await window.tmc.emotes.getCatalog({ profileId: profile, channel });
      if (!current(request, profile, channel) || result.profileId !== profile || result.channel !== channel) return;
      catalog = result;
      render();
    } catch {
      if (!current(request, profile, channel)) return;
      notice.textContent = 'The emote catalog could not be loaded. Your saved login has been kept. Try again.';
      notice.hidden = false;
      retry.hidden = false;
    }
  };
  trigger.addEventListener('click', () => {
    if (!panel.hidden) { dismiss(); input.focus(); return; }
    onOpen();
    search.value = '';
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    onLayoutChange();
    search.focus();
    void load();
  }, listener);
  close.addEventListener('click', () => { dismiss(); input.focus(); }, listener);
  const escape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || panel.hidden) return;
    dismiss();
    input.focus();
    event.preventDefault();
  };
  panel.addEventListener('keydown', escape, listener);
  input.addEventListener('keydown', escape, listener);
  trigger.addEventListener('keydown', escape, listener);
  search.addEventListener('input', () => { grid.scrollTop = 0; render(); }, listener);
  retry.addEventListener('click', () => { void load(); }, listener);
  window.addEventListener(TMC_EMOTE_MESSAGE_SENT_EVENT, (event: Event) => {
    if (!(event instanceof CustomEvent) || panel.hidden) return;
    const detail: unknown = event.detail;
    if (detail && typeof detail === 'object' && 'profileId' in detail && 'channel' in detail &&
        detail.profileId === profileId() && detail.channel === getChannel()) void load(true);
  }, listener);
  for (const event of [TMC_ACCOUNT_CHANGED_EVENT, TMC_AUTH_LOGGED_IN_EVENT, TMC_CHANNEL_CHANGED_EVENT]) {
    window.addEventListener(event, dismiss, listener);
  }
  window.addEventListener('pagehide', () => { disposed = true; revision++; lifetime.abort(); }, { once: true });
  return { close: dismiss };
}
