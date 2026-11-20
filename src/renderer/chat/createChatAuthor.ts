import { chatNameColor, readTwitchNameColor } from '../../shared/chat/TmcChatNameColor';

export function createChatAuthor(username: string, displayName: string, color?: string): HTMLElement {
  const author = document.createElement('strong');
  const supplied = readTwitchNameColor(color);
  author.textContent = displayName;
  author.style.color = chatNameColor(username, supplied);
  author.dataset.tmcAuthorLogin = username.trim().toLowerCase();
  author.dataset.tmcColorSource = supplied ? 'provided' : 'fallback';
  if (supplied) author.dataset.tmcNameColor = supplied;
  return author;
}
