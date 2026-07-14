import { initializeAccountSwitcher } from '../accounts/initializeAccountSwitcher';
import { initializeAuthPanel } from '../auth/initializeAuthPanel';
import { appendLocalMessage } from '../chat/appendLocalMessage';
import { TmcChatInputHistoryController } from '../chat/TmcChatInputHistoryController';
import { TmcChannelChatController } from '../chat/TmcChannelChatController';
import { initializePcgPanel } from '../pcg/initializePcgPanel';
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

  initializeAccountSwitcher(tmc);

  try {
    initializePcgPanel(tmc);
  } catch (error) {
    console.warn('[TMC PCG] Panel initialization failed:', error);
  }

  await initializeAuthPanel();


  channelForm?.addEventListener('submit', (event) => {
    event.preventDefault();

    const requestedChannel = normalizeChannel(channelInput?.value ?? '');

    if (!requestedChannel) {
      return;
    }

    void chatController.switchToChannel(requestedChannel);
  });

  composerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const text = messageInput?.value.trim();

    if (!text) {
      return;
    }

    const channel = readSelectedChannel(channelInput);
    const activeAccountId = readActiveAccountId();

    try {
      await tmc.chat.sendMessage({ channel, text });
      inputHistoryController?.recordSentMessage(text, activeAccountId);

      if (messageInput) {
        messageInput.value = '';
        messageInput.focus();
      }
    } catch {
      appendLocalMessage('system', 'Live chat connection required.');
    }
  });

  await chatController.initialize();
}

/**
 * Reads the currently selected channel from the shell input.
 */
function readSelectedChannel(channelInput: HTMLInputElement | null): string {
  return normalizeChannel(channelInput?.value ?? '') || 'unouidol';
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


