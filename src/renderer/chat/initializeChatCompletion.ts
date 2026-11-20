import type { TmcEmoteCatalog } from '../../shared/chat/TmcEmoteCatalog';
import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';
import { TMC_ACCOUNT_CHANGED_EVENT } from '../accounts/initializeAccountSwitcher';
import { TMC_AUTH_LOGGED_IN_EVENT, TMC_CHANNEL_CHANGED_EVENT } from './TmcChannelChatController';
import { completionToken, completionChoices, completionEdit, type TmcCompletionChoice } from './TmcChatCompletion';
import { createMessageContent } from './createMessageContent';

export function initializeChatCompletion(tmc: TmcRendererPreloadApi, getChannel: () => string | null,
  getUsers: () => readonly string[], onLayoutChange: () => void, onOpen: () => void): { dismiss: () => void } {
  const input = document.querySelector<HTMLInputElement>('#messageInput');
  const panel = document.querySelector<HTMLElement>('[data-tmc-completion]');
  const list = document.querySelector<HTMLElement>('[data-tmc-completion-list]');
  const status = document.querySelector<HTMLElement>('[data-tmc-completion-status]');
  if (!input || !panel || !list || !status) throw new Error('Chat completion markup is incomplete.');
  const lifetime = new AbortController();
  const listener = { signal: lifetime.signal };
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let catalog: TmcEmoteCatalog | null = null;
  let catalogAt = 0;
  let loading = false;
  let failed = false;
  let composing = false;
  let applying = false;
  let acceptedEnter = false;
  let choices: readonly TmcCompletionChoice[] = [];
  let selected = 0;
  let context = '';
  const profileId = () => document.querySelector<HTMLSelectElement>('[data-tmc-account-select]')?.value || '';
  const identity = () => `${profileId()}:${getChannel() || ''}`;
  const token = () => completionToken(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length);
  const dismiss = (): void => {
    revision++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    catalog = null;
    loading = false;
    failed = false;
    choices = [];
    list.replaceChildren();
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    onLayoutChange();
  };
  const select = (index: number): void => {
    selected = index;
    const options = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
    options.forEach((option, position) => option.setAttribute('aria-selected', String(position === selected)));
    const option = options[selected];
    if (option) { input.setAttribute('aria-activedescendant', option.id); option.scrollIntoView({ block: 'nearest' }); }
  };
  const choose = (choice: TmcCompletionChoice): void => {
    if (choice.kind === 'emote' && Date.now() - catalogAt >= 300000) { catalog = null; update(); return; }
    const current = token();
    if (!current || identity() !== context || !choices.includes(choice) || current.kind !== choice.kind) { dismiss(); return; }
    const currentChoices = completionChoices(current, getUsers(), catalog);
    if (!currentChoices.some((item) => item.value === choice.value && item.kind === choice.kind)) { dismiss(); return; }
    const edit = completionEdit(input.value, current, choice);
    dismiss();
    input.value = edit.value;
    input.setSelectionRange(edit.caret, edit.caret);
    applying = true;
    try { input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }
    finally { applying = false; }
  };
  const render = (): void => {
    const current = token();
    if (!current || composing || document.activeElement !== input || !profileId() || !getChannel()) { dismiss(); return; }
    context = identity();
    if (panel.hidden) { onOpen(); panel.hidden = false; onLayoutChange(); }
    input.setAttribute('aria-expanded', 'true');
    choices = completionChoices(current, getUsers(), catalog);
    selected = 0;
    list.replaceChildren();
    input.removeAttribute('aria-activedescendant');
    for (const [index, choice] of choices.entries()) {
      const option = document.createElement('button');
      option.type = 'button';
      option.tabIndex = -1;
      option.id = `tmc-completion-option-${index}`;
      option.className = 'tmc-completion-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-label', choice.kind === 'user' ? `@${choice.value}` : choice.value);
      if (choice.kind === 'emote') option.appendChild(createMessageContent(choice.value, [{ kind: 'emote', provider: 'twitch', id: choice.id, text: choice.value }]));
      const label = document.createElement('span');
      label.textContent = choice.kind === 'user' ? `@${choice.value}` : choice.value;
      option.appendChild(label);
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => choose(choice));
      list.appendChild(option);
    }
    status.textContent = choices.length ? '↑↓ Select · Tab/Enter insert · Esc close' : current.kind === 'user'
      ? 'No matching users seen in this chat. Esc to close.' : failed
        ? 'Emote suggestions unavailable. Close and type : to retry.' : loading || !catalog
          ? 'Loading emote suggestions… Esc to close.' : 'No matching available emotes. Esc to close.';
    select(0);
  };
  const update = (): void => {
    if (applying) return;
    const current = token();
    if (!current || composing || document.activeElement !== input) { dismiss(); return; }
    if (context !== identity()) dismiss();
    if (catalog && Date.now() - catalogAt >= 300000) catalog = null;
    render();
    if (current.kind !== 'emote' || catalog || loading || failed || !profileId() || !getChannel()) return;
    loading = true;
    const request = revision;
    const profile = profileId();
    const channel = getChannel();
    timer = setTimeout(() => {
      timer = null;
      if (!channel) return;
      void tmc.emotes.getCatalog({ profileId: profile, channel }).then((result) => {
        if (request !== revision || profile !== profileId() || channel !== getChannel() || result.profileId !== profile || result.channel !== channel) return;
        catalog = result;
        catalogAt = Date.now();
        loading = false;
        render();
      }, () => {
        if (request !== revision || profile !== profileId() || channel !== getChannel()) return;
        loading = false;
        failed = true;
        render();
      });
    }, 150);
  };
  input.addEventListener('input', update, listener);
  input.addEventListener('focus', update, listener);
  input.addEventListener('click', update, listener);
  input.addEventListener('blur', dismiss, listener);
  input.addEventListener('compositionstart', () => { composing = true; dismiss(); }, listener);
  input.addEventListener('compositionend', () => { composing = false; update(); }, listener);
  input.addEventListener('keyup', (event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) update(); }, listener);
  input.addEventListener('keydown', (event) => {
    if (composing || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Enter' && event.repeat && acceptedEnter) { event.preventDefault(); return; }
    if (event.key === 'Enter' && !event.repeat) acceptedEnter = false;
    if (panel.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (choices.length) select((selected + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length);
    } else if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey && choices.length)) {
      event.preventDefault();
      if (event.key === 'Enter') acceptedEnter = true;
      if (choices[selected]) choose(choices[selected]);
    } else if (event.key === 'Tab') dismiss();
  }, { ...listener, capture: true });
  for (const event of [TMC_ACCOUNT_CHANGED_EVENT, TMC_AUTH_LOGGED_IN_EVENT, TMC_CHANNEL_CHANGED_EVENT]) window.addEventListener(event, dismiss, listener);
  window.addEventListener('pagehide', () => { dismiss(); lifetime.abort(); }, { once: true });
  return { dismiss };
}
