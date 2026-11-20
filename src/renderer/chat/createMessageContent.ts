import { twitchEmoteImageUrl, type TmcMessageFragment } from '../../shared/chat/TmcMessageContent';
import { linkifyChatText } from '../../shared/chat/TmcChatLinks';

/** Text nodes, fixed-CDN emotes and validated web anchors; never remote HTML. */
export function createMessageContent(text: string, fragments?: readonly TmcMessageFragment[]): HTMLSpanElement {
  const content = document.createElement('span');
  content.className = 'tmc-message-content';
  let linkBudget = 100;
  for (const fragment of fragments || [{ kind: 'text', text }]) {
    if (fragment.kind !== 'emote') {
      linkBudget -= appendLinkedText(content, fragment.text, linkBudget);
      continue;
    }
    const url = twitchEmoteImageUrl(fragment.id);
    if (!url) {
      content.appendChild(document.createTextNode(fragment.text));
      continue;
    }
    const image = document.createElement('img');
    image.className = 'tmc-chat-emote';
    image.alt = fragment.text;
    image.title = `${fragment.text} (Twitch emote)`;
    image.width = 28;
    image.height = 28;
    image.decoding = 'async';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      image.replaceWith(document.createTextNode(fragment.text));
    }, { once: true });
    image.src = url;
    content.appendChild(image);
  }
  return content;
}

function appendLinkedText(content: HTMLElement, text: string, budget: number): number {
  let used = 0;
  for (const piece of linkifyChatText(text, budget)) {
    if (piece.kind === 'text') { content.appendChild(document.createTextNode(piece.text)); continue; }
    const link = document.createElement('a');
    used++;
    link.className = 'tmc-chat-link';
    link.href = piece.href;
    link.textContent = piece.text;
    link.title = piece.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    let opening = false;
    const errorLabel = document.createElement('span');
    errorLabel.className = 'tmc-link-error';
    errorLabel.setAttribute('role', 'status');
    const open = async (event: MouseEvent): Promise<void> => {
      if ((event.type === 'click' && event.button !== 0) || (event.type === 'auxclick' && event.button !== 1)) return;
      event.preventDefault();
      if (!event.isTrusted || opening) return;
      opening = true;
      errorLabel.remove();
      try { await window.tmc.chat.openLink({ url: piece.href }); }
      catch {
        if (link.isConnected) { errorLabel.textContent = ' Could not open link. Click the link to try again.'; link.after(errorLabel); }
      } finally { opening = false; }
    };
    link.addEventListener('click', (event) => { void open(event); });
    link.addEventListener('auxclick', (event) => { void open(event); });
    content.appendChild(link);
  }
  return used;
}
