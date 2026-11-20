import type { TmcHistoryMessage } from '../../shared/backend/TmcHistoryModels';
import type { TmcChatScrollController } from './TmcChatScrollController';
import { createMessageContent } from './createMessageContent';
import { appendReplyControls } from './createReplyControls';
import { createChatAuthor } from './createChatAuthor';
import { markChatAttention } from './markChatAttention';
import { createChatBadges } from './createChatBadges';

/**
 * Replaces the temporary chat list with backend history messages.
 */
export function renderHistoryMessages(
  messages: readonly TmcHistoryMessage[],
  scrollController?: TmcChatScrollController | null,
): readonly HTMLElement[] {
  const chatList = document.querySelector<HTMLDivElement>('#chatList');

  if (!chatList) {
    return [];
  }

  chatList.replaceChildren();
  const authors: HTMLElement[] = [];

  for (const message of messages) {
    const row = createHistoryMessageElement(message);
    chatList.appendChild(row);
    const author = row.querySelector<HTMLElement>('[data-tmc-author-login]');
    if (author) authors.push(author);
  }

  if (scrollController) {
    scrollController.handleInitialHistoryLoaded();
  } else {
    chatList.scrollTop = chatList.scrollHeight;
  }
  return authors;
}

/**
 * Creates one DOM element for a normalized backend history message.
 */
function createHistoryMessageElement(message: TmcHistoryMessage): HTMLElement {
  const messageElement = document.createElement('article');
  messageElement.className = 'tmc-message';
  messageElement.dataset.tmcMessageId = message.id;

  const timeElement = document.createElement('time');
  timeElement.className = 'tmc-message-time';
  timeElement.dateTime = new Date(message.timestampMillis).toISOString();
  timeElement.textContent = formatTime(message.timestampMillis);

  const authorElement = createChatAuthor(message.user, message.user, message.color);

  const textElement = createMessageContent(message.text, message.fragments);

  messageElement.append(timeElement, createChatBadges(message.badges), authorElement, textElement);
  appendReplyControls(messageElement, message, message.user);
  markChatAttention(messageElement, message.attention);

  return messageElement;
}

/**
 * Formats a timestamp for compact local chat display.
 */
function formatTime(timestampMillis: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMillis));
}
