import { initializeAccountSwitcher } from '../accounts/initializeAccountSwitcher';
import { initializeAuthPanel } from '../auth/initializeAuthPanel';
import { appendLocalMessage } from '../chat/appendLocalMessage';
import { TmcChatInputHistoryController } from '../chat/TmcChatInputHistoryController';
import { TmcChannelChatController } from '../chat/TmcChannelChatController';
import { initializePcgPanel } from '../pcg/initializePcgPanel';
import { initializeEmotePicker, notifyEmoteMessageSent } from '../chat/initializeEmotePicker';
import { initializeReplyComposer } from '../chat/initializeReplyComposer';
import { initializeChatCompletion } from '../chat/initializeChatCompletion';
import { initializeChatAppearance } from '../chat/initializeChatAppearance';
import { initializeLivePlayer } from '../player/initializeLivePlayer';
import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';
//import { initializePcgSessionPanel } from '../pcg/initializePcgSessionPanel';

/**
 * Initializes the local TMC Desktop renderer.
 *
 * This bootstrap wires the local shell UI. Twitch authorization, backend
 * history loading, and passive live chat are delegated to dedicated modules.
 */
export async function bootstrapRenderer(): Promise<void> {
  const tmc = window.tmc as TmcRendererPreloadApi;
  const composerForm = document.querySelector<HTMLFormElement>('#composerForm');
  const messageInput = document.querySelector<HTMLInputElement>('#messageInput');
  const channelInput = document.querySelector<HTMLInputElement>('#channelInput');
  const channelForm = document.querySelector<HTMLFormElement>('#channelForm');
  //const pcgSessionPanel = initializePcgSessionPanel(tmc);
  const loadHistoryButton =
    document.querySelector<HTMLButtonElement>('#loadHistoryButton');
  const inputHistoryController = messageInput
    ? new TmcChatInputHistoryController(messageInput, readActiveAccountId)
    : null;
  const chatController = new TmcChannelChatController({
    tmc,
    channelInput,
    loadHistoryButton,
    //pcgSessionPanel,
  });
  const appearance = initializeChatAppearance(tmc, () => chatController.notifyViewportChanged());
  window.addEventListener('pagehide', () => appearance.dispose(), { once: true });
  const player = initializeLivePlayer(tmc, () => chatController.getCurrentChannel(), () => chatController.notifyViewportChanged());
  window.addEventListener('pagehide', () => player.dispose(), { once: true });

  initializeAccountSwitcher(tmc);
  window.addEventListener('pagehide', () => chatController.dispose(), { once: true });

  try {
    initializePcgPanel(tmc);
  } catch (error) {
    console.warn('[TMC PCG] Panel initialization failed:', error);
  }

  await initializeAuthPanel();
  const picker = initializeEmotePicker(() => chatController.getCurrentChannel(), () => chatController.notifyViewportChanged(), () => completion.dismiss());
  const completion = initializeChatCompletion(tmc, () => chatController.getCurrentChannel(), () => chatController.getCompletionUsers(),
    () => chatController.notifyViewportChanged(), () => picker.close());
  window.addEventListener('pagehide', () => inputHistoryController?.destroy(), { once: true });
  const replyComposer = initializeReplyComposer(() => chatController.getCurrentChannel(), () => chatController.notifyViewportChanged());
  window.addEventListener('pagehide', () => replyComposer.dispose(), { once: true });
  let sending = false;


  channelForm?.addEventListener('submit', (event) => {
    event.preventDefault();

    const requestedChannel = normalizeChannel(channelInput?.value ?? '');

    if (!requestedChannel) {
      return;
    }

    void chatController.switchToChannel(requestedChannel);
  });

  loadHistoryButton?.addEventListener('click', () => {
    void chatController.refreshCurrentChannel();
  });

  composerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const text = messageInput?.value.trim();

    if (!text || sending) {
      return;
    }

    const channel = chatController.getCurrentChannel();
    if (!channel) return;
    const activeAccountId = readActiveAccountId();
    if (!activeAccountId) return;
    const draft = messageInput?.value;
    const replySnapshot = replyComposer.snapshot();
    sending = true;

    try {
      await tmc.chat.sendMessage({ profileId: activeAccountId, channel, text, reply: replySnapshot.reply });
      notifyEmoteMessageSent(activeAccountId, channel);
      inputHistoryController?.recordSentMessage(text, activeAccountId);

      if (messageInput && messageInput.value === draft && readActiveAccountId() === activeAccountId && chatController.getCurrentChannel() === channel && replyComposer.isCurrent(replySnapshot.revision)) {
        messageInput.value = '';
        messageInput.focus();
      }
      replyComposer.complete(replySnapshot.revision);
    } catch {
      if (readActiveAccountId() === activeAccountId && chatController.getCurrentChannel() === channel) appendLocalMessage('system', 'Message not sent. Check the live connection, account and channel, then try again.');
    } finally {
      sending = false;
    }
  });

  await chatController.initialize();
}

/**
 * Reads the active account profile identifier from the existing account selector.
 */
function readActiveAccountId(): string | null {
  const accountSelect = document.querySelector<HTMLSelectElement>(
    '[data-tmc-account-select]',
  );
  const profileId = accountSelect?.value.trim() || '';

  return profileId || null;
}

function normalizeChannel(channel: string): string {
  return channel.trim().replace(/^#/, '').toLowerCase();
}


