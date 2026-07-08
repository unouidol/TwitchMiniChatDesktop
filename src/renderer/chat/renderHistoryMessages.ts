import type { TmcHistoryMessage } from '../../shared/backend/TmcHistoryModels';

/**
 * Replaces the temporary chat list with backend history messages.
 */
export function renderHistoryMessages(
  messages: readonly TmcHistoryMessage[],
): void {
  const chatList = document.querySelector<HTMLDivElement>('#chatList');

  if (!chatList) {
    return;
  }

  chatList.replaceChildren();

  for (const message of messages) {
    chatList.appendChild(createHistoryMessageElement(message));
  }

  chatList.scrollTop = chatList.scrollHeight;
}

/**
 * Creates one DOM element for a normalized backend history message.
 */
function createHistoryMessageElement(message: TmcHistoryMessage): HTMLElement {
  const messageElement = document.createElement('article');
  messageElement.className = 'tmc-message';

  const timeElement = document.createElement('time');
  timeElement.className = 'tmc-message-time';
  timeElement.dateTime = new Date(message.timestampMillis).toISOString();
  timeElement.textContent = formatTime(message.timestampMillis);

  const authorElement = document.createElement('strong');
  authorElement.textContent = message.user;

  const textElement = document.createElement('span');
  textElement.textContent = message.text;

  messageElement.append(timeElement, authorElement, textElement);

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
