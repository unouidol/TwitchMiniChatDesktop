import type { TmcChatAttention } from '../../shared/chat/TmcChatAttention';

/** Main classifies messages; the renderer checks the destination before styling. */
export function markChatAttention(row: HTMLElement, attention?: TmcChatAttention): void {
  const selected = document.querySelector<HTMLSelectElement>('[data-tmc-account-select]')?.value;
  if (!attention || attention.profileId !== selected || !['mention', 'reply'].includes(attention.kind)) return;
  row.classList.add('tmc-message-mention');
  row.dataset.tmcAttentionProfile = attention.profileId;
  row.dataset.tmcMentionKind = attention.kind;
  const label = document.createElement('small');
  label.className = 'tmc-mention-label';
  label.dataset.tmcMentionLabel = 'true';
  label.textContent = attention.kind === 'reply' ? 'Reply to you' : 'Mentions you';
  row.appendChild(label);
}
