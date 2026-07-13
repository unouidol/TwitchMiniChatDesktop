import { appendLocalMessage } from '../chat/appendLocalMessage';
import { notifyAuthLoggedIn } from '../chat/TmcChannelChatController';
import type { FinalizeTwitchLoginResult } from '../../shared/auth/TmcAuthModels';

/**
 * Initializes the manual Twitch claim-code authentication panel.
 */
export async function initializeAuthPanel(): Promise<void> {
  const loginButton = findLoginButton();
  const authPanel = resolveAuthPanel(loginButton);
  const authStatusElement = ensureAuthStatusElement(authPanel, loginButton);
  const codeInput = ensureCodeInput(authPanel, loginButton);
  const finalizeButton = ensureFinalizeButton(authPanel, codeInput);

  await refreshAuthStatus(authStatusElement);

  bindLoginButton(loginButton, authStatusElement, codeInput);
  bindFinalizeButton(finalizeButton, authStatusElement, codeInput);
}

/**
 * Binds the explicit user action that opens Twitch OAuth in the browser.
 */
function bindLoginButton(
  loginButton: HTMLButtonElement | null,
  authStatusElement: HTMLElement,
  codeInput: HTMLInputElement,
): void {
  if (!loginButton || loginButton.dataset.tmcAuthBound === 'true') {
    return;
  }

  loginButton.dataset.tmcAuthBound = 'true';

  loginButton.addEventListener('click', async () => {
    loginButton.disabled = true;

    try {
      await startTwitchLogin();
      const message = 'Authorize in the browser, then paste the login code here.';
      updateAuthStatus(authStatusElement, message);
      appendLocalMessage('system', message);
      codeInput.focus();
    } catch (error) {
      const message = getErrorMessage(error);
      updateAuthStatus(authStatusElement, message);
      appendLocalMessage('error', message);
      console.warn('[TMC Auth] Twitch login start failed.');
    } finally {
      loginButton.disabled = false;
    }
  });
}

/**
 * Binds the explicit user action that finalizes a pasted one-time login code.
 */
function bindFinalizeButton(
  finalizeButton: HTMLButtonElement,
  authStatusElement: HTMLElement,
  codeInput: HTMLInputElement,
): void {
  if (finalizeButton.dataset.tmcAuthBound === 'true') {
    return;
  }

  finalizeButton.dataset.tmcAuthBound = 'true';

  finalizeButton.addEventListener('click', async () => {
    const loginToken = codeInput.value.trim();

    if (!loginToken) {
      updateAuthStatus(authStatusElement, 'Paste the login code first.');
      codeInput.focus();
      return;
    }

    finalizeButton.disabled = true;

    try {
      const result = await finalizeTwitchLogin(loginToken);
      const message = result.message || `Logged in as ${result.username}.`;
      codeInput.value = '';
      updateAuthStatus(authStatusElement, message);
      appendLocalMessage('system', message);
      notifyAuthLoggedIn();
    } catch {
      const message = 'Login code invalid or expired.';
      updateAuthStatus(authStatusElement, message);
      appendLocalMessage('error', message);
      console.warn('[TMC Auth] Twitch login finalize failed.');
    } finally {
      finalizeButton.disabled = false;
    }
  });
}

/**
 * Refreshes the visible authentication status.
 */
async function refreshAuthStatus(authStatusElement: HTMLElement): Promise<void> {
  try {
    const status = await window.tmc.auth.getStatus();
    updateAuthStatus(authStatusElement, status.message);
  } catch (error) {
    updateAuthStatus(authStatusElement, getErrorMessage(error));
  }
}

/**
 * Updates the visible authentication status message.
 */
function updateAuthStatus(authStatusElement: HTMLElement, message: string): void {
  authStatusElement.textContent = message;
}

/**
 * Finds the existing Twitch login button, including older static markup.
 */
function findLoginButton(): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>('[data-tmc-auth-login]') ||
    findButtonByText('Login with Twitch')
  );
}

/**
 * Finds a button by visible text.
 */
function findButtonByText(text: string): HTMLButtonElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));

  return buttons.find((button) => button.textContent?.trim() === text) || null;
}

/**
 * Resolves or creates the compact header authentication container.
 */
function resolveAuthPanel(loginButton: HTMLButtonElement | null): HTMLElement {
  const existingPanel =
    document.querySelector<HTMLElement>('.tmc-auth-panel') ||
    document.querySelector<HTMLElement>('.tmc-auth-box');

  if (existingPanel) {
    existingPanel.classList.add('tmc-auth-panel');
    return existingPanel;
  }

  const panel = document.createElement('div');
  panel.className = 'tmc-auth-panel';

  if (loginButton?.parentElement) {
    loginButton.parentElement.insertBefore(panel, loginButton);
    panel.append(loginButton);
    return panel;
  }

  document.querySelector('.tmc-header-actions')?.prepend(panel);
  return panel;
}

/**
 * Ensures the user-visible authentication status element exists.
 */
function ensureAuthStatusElement(
  authPanel: HTMLElement,
  loginButton: HTMLButtonElement | null,
): HTMLElement {
  const existingStatus =
    document.querySelector<HTMLElement>('[data-tmc-auth-status]') ||
    document.querySelector<HTMLElement>('#authStatus');

  if (existingStatus) {
    existingStatus.dataset.tmcAuthStatus = 'true';
    existingStatus.classList.add('tmc-auth-status');
    return existingStatus;
  }

  const statusElement = document.createElement('p');
  statusElement.className = 'tmc-auth-status';
  statusElement.dataset.tmcAuthStatus = 'true';
  statusElement.textContent = 'Checking login...';

  if (loginButton?.parentElement === authPanel) {
    authPanel.insertBefore(statusElement, loginButton);
  } else {
    authPanel.prepend(statusElement);
  }

  return statusElement;
}

/**
 * Ensures the one-time claim-code input exists next to the login button.
 */
function ensureCodeInput(
  authPanel: HTMLElement,
  loginButton: HTMLButtonElement | null,
): HTMLInputElement {
  const existingInput =
    document.querySelector<HTMLInputElement>('[data-tmc-auth-code]');

  if (existingInput) {
    return existingInput;
  }

  const label = document.createElement('label');
  label.className = 'tmc-field-label';
  label.htmlFor = 'tmc-login-code';
  label.textContent = 'Paste login code';

  const input = document.createElement('input');
  input.id = 'tmc-login-code';
  input.className = 'tmc-text-input tmc-auth-code-input';
  input.dataset.tmcAuthCode = 'true';
  input.placeholder = 'Code from browser';
  input.autocomplete = 'one-time-code';
  input.spellcheck = false;

  const referenceNode = loginButton?.nextSibling || null;
  authPanel.insertBefore(label, referenceNode);
  authPanel.insertBefore(input, referenceNode);

  return input;
}

/**
 * Ensures the manual finalize button exists after the claim-code input.
 */
function ensureFinalizeButton(
  authPanel: HTMLElement,
  codeInput: HTMLInputElement,
): HTMLButtonElement {
  const existingButton =
    document.querySelector<HTMLButtonElement>('[data-tmc-auth-finalize]');

  if (existingButton) {
    return existingButton;
  }

  const finalizeButton = document.createElement('button');
  finalizeButton.type = 'button';
  finalizeButton.className = 'tmc-button tmc-button-secondary';
  finalizeButton.dataset.tmcAuthFinalize = 'true';
  finalizeButton.textContent = 'Finalize login';

  authPanel.insertBefore(finalizeButton, codeInput.nextSibling);

  return finalizeButton;
}

/**
 * Starts Twitch OAuth through the current preload API or its compatibility alias.
 */
async function startTwitchLogin(): Promise<void> {
  if (window.tmc.auth.startTwitchLogin) {
    await window.tmc.auth.startTwitchLogin({ source: 'main-window' });
    return;
  }

  await window.tmc.auth.openTwitchLogin({ slot: 0 });
}

/**
 * Finalizes Twitch OAuth through the current preload API or its compatibility alias.
 */
async function finalizeTwitchLogin(
  loginToken: string,
): Promise<FinalizeTwitchLoginResult> {
  if (window.tmc.auth.finalizeLoginToken) {
    return window.tmc.auth.finalizeLoginToken(loginToken);
  }

  return window.tmc.auth.finalizeTwitchLogin({ loginToken });
}

/**
 * Converts an unknown error into a user-visible message.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown authentication error.';
}
