import './index.css';

/**
 * Appends a local message to the temporary chat list.
 *
 * This is a UI-only placeholder. Real Twitch Internet Relay Chat sending will
 * be added later through a dedicated Twitch package and secure Inter-Process
 * Communication handler.
 */
function appendLocalMessage(author: string, text: string): void {
  const chatList = document.querySelector<HTMLDivElement>('#chatList');

  if (!chatList) {
    return;
  }

  const messageElement = document.createElement('article');
  messageElement.className = 'tmc-message';

  const authorElement = document.createElement('strong');
  authorElement.textContent = author;

  const textElement = document.createElement('span');
  textElement.textContent = text;

  messageElement.append(authorElement, textElement);
  chatList.appendChild(messageElement);
  chatList.scrollTop = chatList.scrollHeight;
}

/**
 * Initializes the local TMC Desktop renderer.
 */
async function initializeRenderer(): Promise<void> {
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

void initializeRenderer();
