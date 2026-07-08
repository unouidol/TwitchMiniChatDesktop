import { appendLocalMessage } from '../chat/appendLocalMessage';

/**
 * Initializes the local TMC Desktop renderer.
 *
 * This bootstrap wires the temporary shell UI only. Real chat state, backend
 * history, Twitch authorization, and PokémonCommunityGame snapshots will be
 * added through dedicated modules.
 */
export async function bootstrapRenderer(): Promise<void> {
  const appInfoElement = document.querySelector<HTMLParagraphElement>('#appInfo');
  const pingButton = document.querySelector<HTMLButtonElement>('#pingButton');
  const composerForm = document.querySelector<HTMLFormElement>('#composerForm');
  const messageInput = document.querySelector<HTMLInputElement>('#messageInput');

  const appInfo = window.tmc.getAppInfo();

  if (appInfoElement) {
    appInfoElement.textContent = `${appInfo.appName} running on ${appInfo.platform}`;
  }

  pingButton?.addEventListener('click', async () => {
    const result = await window.tmc.ping();
    appendLocalMessage('main', result);
  });

  composerForm?.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = messageInput?.value.trim();

    if (!text) {
      return;
    }

    appendLocalMessage('you', text);

    if (messageInput) {
      messageInput.value = '';
      messageInput.focus();
    }
  });
}
