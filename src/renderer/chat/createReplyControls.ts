import { isTwitchMessageId, type TmcChatReply } from '../../shared/chat/TmcChatReply';

export const TMC_REPLY_SELECTED_EVENT = 'tmc:reply-selected';

export function readReplyProfileId(): string | null {
  return document.querySelector<HTMLSelectElement>('[data-tmc-account-select]')?.value || null;
}

export function appendReplyControls(element: HTMLElement, message: { id: string; channel: string; text: string }, author: string, reply?: TmcChatReply): void {
  if (reply) {
    const context = document.createElement('div');
    context.className = 'tmc-message-reply-context';
    context.textContent = `↪ ${reply.parentDisplayName}: ${reply.parentText}`;
    context.title = context.textContent;
    element.prepend(context);
  }
  if (!isTwitchMessageId(message.id)) return;
  const profileId = readReplyProfileId();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tmc-message-reply-button';
  button.textContent = '↩ Reply';
  button.setAttribute('aria-label', `Reply to ${author}`);
  button.addEventListener('click', () => {
    element.dispatchEvent(new CustomEvent(TMC_REPLY_SELECTED_EVENT, { bubbles: true, detail: {
      profileId, channel: message.channel,
      reply: { parentMessageId: message.id, parentDisplayName: author.slice(0, 128), parentText: message.text.slice(0, 2000) },
    } }));
  });
  element.append(button);
}
