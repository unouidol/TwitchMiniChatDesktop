import { readChatReply, type TmcChatReply } from '../../shared/chat/TmcChatReply';
import { TMC_ACCOUNT_CHANGED_EVENT } from '../accounts/initializeAccountSwitcher';
import { TMC_AUTH_LOGGED_IN_EVENT, TMC_CHANNEL_CHANGED_EVENT } from './TmcChannelChatController';
import { readReplyProfileId, TMC_REPLY_SELECTED_EVENT } from './createReplyControls';

export function initializeReplyComposer(getChannel: () => string | null, onLayoutChange: () => void) {
  const banner = document.querySelector<HTMLElement>('[data-tmc-reply-preview]');
  const label = document.querySelector<HTMLElement>('[data-tmc-reply-label]');
  const input = document.querySelector<HTMLInputElement>('#messageInput');
  let selection: { profileId: string; channel: string; reply: TmcChatReply } | null = null;
  let revision = 0;
  const clear = () => {
    selection = null;
    revision++;
    if (banner) banner.hidden = true;
    if (label) label.textContent = '';
    onLayoutChange();
  };
  const onSelect = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!detail || typeof detail !== 'object' || !('reply' in detail) || !('profileId' in detail) || !('channel' in detail)) return;
    const reply = readChatReply(detail.reply);
    if (!reply || typeof detail.profileId !== 'string' || typeof detail.channel !== 'string' || !detail.profileId || detail.profileId !== readReplyProfileId() || detail.channel !== getChannel()) return;
    selection = { profileId: detail.profileId, channel: detail.channel, reply };
    revision++;
    if (label) label.textContent = `Replying to ${reply.parentDisplayName}: ${reply.parentText}`;
    if (banner) banner.hidden = false;
    onLayoutChange();
    input?.focus();
  };
  const cancel = () => { clear(); input?.focus(); };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && selection && !event.defaultPrevented) { event.preventDefault(); cancel(); }
  };
  document.querySelector('#chatList')?.addEventListener(TMC_REPLY_SELECTED_EVENT, onSelect);
  document.querySelector('[data-tmc-reply-cancel]')?.addEventListener('click', cancel);
  input?.addEventListener('keydown', onKey);
  const events = [TMC_ACCOUNT_CHANGED_EVENT, TMC_AUTH_LOGGED_IN_EVENT, TMC_CHANNEL_CHANGED_EVENT];
  for (const event of events) window.addEventListener(event, clear);
  return {
    snapshot: () => {
      if (selection && (selection.profileId !== readReplyProfileId() || selection.channel !== getChannel())) clear();
      return { reply: selection?.reply, revision };
    },
    complete: (sentRevision: number) => { if (revision === sentRevision) clear(); },
    isCurrent: (sentRevision: number) => revision === sentRevision,
    dispose: () => {
      document.querySelector('#chatList')?.removeEventListener(TMC_REPLY_SELECTED_EVENT, onSelect);
      document.querySelector('[data-tmc-reply-cancel]')?.removeEventListener('click', cancel);
      input?.removeEventListener('keydown', onKey);
      for (const event of events) window.removeEventListener(event, clear);
    },
  };
}
