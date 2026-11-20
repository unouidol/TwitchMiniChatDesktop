import { badgeLabel, readChatBadges, type TmcChatBadge } from '../../shared/chat/TmcChatBadges';

export function createChatBadges(badges?: readonly TmcChatBadge[]): HTMLElement {
  const container = document.createElement('span');
  container.className = 'tmc-chat-badges';
  for (const badge of readChatBadges(badges)) {
    const slot = document.createElement('span');
    slot.className = 'tmc-chat-badge';
    slot.dataset.tmcBadge = `${badge.setId}/${badge.version}`;
    slot.title = badgeLabel(badge.setId);
    slot.textContent = badgeLabel(badge.setId);
    container.appendChild(slot);
  }
  container.hidden = !container.childElementCount;
  return container;
}
