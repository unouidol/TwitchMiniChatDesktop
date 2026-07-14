import type { TmcChatScrollController } from './TmcChatScrollController';

/**
 * Appends a local message to the temporary chat list.
 *
 * This is a UI-only placeholder. Real Twitch Internet Relay Chat sending will
 * be added later through a dedicated Twitch package and secure Inter-Process
 * Communication handler.
 */
export function appendLocalMessage(
  author: string,
  text: string,
  scrollController?: TmcChatScrollController | null,
): void {
  const chatList = document.querySelector<HTMLDivElement>('#chatList');

  if (!chatList) {
    return;
  }

  const messageElement = document.createElement('article');
  messageElement.className = 'tmc-message';

  const authorElement = document.createElement('strong');
  authorElement.textContent = author;

  const textElement = document.createElement('span');
  textElement.textContent = text;

  messageElement.append(authorElement, textElement);
  chatList.appendChild(messageElement);
  if (scrollController) {
    scrollController.notifyMessagesAppended();
  } else {
    chatList.scrollTop = chatList.scrollHeight;
  }
}
