import { appendLocalMessage } from '../chat/appendLocalMessage';
import { renderHistoryMessages } from '../chat/renderHistoryMessages';

/**
 * Initializes the local TMC Desktop renderer.
 *
 * This bootstrap wires the temporary shell UI only. Real Twitch authorization,
 * live Internet Relay Chat, and PokémonCommunityGame snapshots will be added
 * through dedicated modules.
 */
export async function bootstrapRenderer(): Promise<void> {
  const appInfoElement = document.querySelector<HTMLParagraphElement>('#appInfo');
  const pingButton = document.querySelector<HTMLButtonElement>('#pingButton');
  const composerForm = document.querySelector<HTMLFormElement>('#composerForm');
  const messageInput = document.querySelector<HTMLInputElement>('#messageInput');
  const channelInput = document.querySelector<HTMLInputElement>('#channelInput');
  const loadHistoryButton =
    document.querySelector<HTMLButtonElement>('#loadHistoryButton');
  const channelButtons =
    document.querySelectorAll<HTMLButtonElement>('[data-channel]');

  const appInfo = window.tmc.getAppInfo();

  if (appInfoElement) {
    appInfoElement.textContent = `${appInfo.appName} running on ${appInfo.platform}`;
  }

  pingButton?.addEventListener('click', async () => {
    const result = await window.tmc.ping();
    appendLocalMessage('main', result);
  });

  channelButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const channel = button.dataset.channel;

      if (channelInput && channel) {
        channelInput.value = channel;
      }
    });
  });

  loadHistoryButton?.addEventListener('click', async () => {
    const channel = readSelectedChannel(channelInput);

    loadHistoryButton.disabled = true;
    appendLocalMessage('system', `Loading history for #${channel}...`);

    try {
      const result = await window.tmc.backend.loadHistory({
        channel,
        seconds: 3600,
      });

      renderHistoryMessages(result.messages);
      appendLocalMessage(
        'system',
        `Loaded ${result.messages.length} cached messages for #${result.channel}.`,
      );
    } catch (error) {
      appendLocalMessage('error', getErrorMessage(error));
    } finally {
      loadHistoryButton.disabled = false;
    }
  });

  composerForm?.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = messageInput?.value.trim();

    if (!text) {
      return;
    }

    /*
     * Manual-only placeholder: one explicit user submit appends one visible
     * local message. Real Twitch sending will remain user-triggered.
     */
    appendLocalMessage('you', text);

    if (messageInput) {
      messageInput.value = '';
      messageInput.focus();
    }
  });
}

/**
 * Reads the currently selected channel from the shell input.
 */
function readSelectedChannel(channelInput: HTMLInputElement | null): string {
  return channelInput?.value.trim().replace(/^#/, '') || 'unouidol';
}

/**
 * Converts an unknown error into a user-visible message.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown backend error while loading history.';
}
