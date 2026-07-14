import type {
  TmcAccountListResult,
  TmcActiveAccountResult,
} from '../../shared/accounts/TmcAccountModels';
import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';
import { appendLocalMessage } from '../chat/appendLocalMessage';

/**
 * Window event emitted after the active desktop account changes.
 */
export const TMC_ACCOUNT_CHANGED_EVENT = 'tmc:account:changed';

/**
 * Window event emitted after one desktop account is removed locally.
 */
export const TMC_ACCOUNT_REMOVED_EVENT = 'tmc:account:removed';

const TMC_AUTH_LOGGED_IN_EVENT = 'tmc:auth:logged-in';
const REMOVE_ACCOUNT_CONFIRM_MESSAGE =
  'Remove this account from this device? This will not delete Twitch or server data.';

/**
 * Initializes the compact account switcher in the header.
 */
export function initializeAccountSwitcher(
  tmc: TmcRendererPreloadApi = window.tmc,
): void {
  const elements = resolveAccountSwitcherElements();

  if (!elements) {
    return;
  }

  elements.select.addEventListener('change', async () => {
    const profileId = elements.select.value;

    if (!profileId) {
      return;
    }

    setControlsDisabled(elements, true);

    try {
      const result = await tmc.accounts.setActive({ profileId });
      renderActiveAccountResult(elements, result);
      window.dispatchEvent(new CustomEvent(TMC_ACCOUNT_CHANGED_EVENT));
      await refreshAccounts(tmc, elements);
    } catch (error) {
      appendLocalMessage('error', getErrorMessage(error));
      await refreshAccounts(tmc, elements);
    }
  });

  elements.removeButton.addEventListener('click', async () => {
    const profileId = elements.select.value;

    if (!profileId || !window.confirm(REMOVE_ACCOUNT_CONFIRM_MESSAGE)) {
      return;
    }

    setControlsDisabled(elements, true);

    try {
      const result = await tmc.accounts.removeLocal({ profileId });
      renderAccountList(elements, result);
      window.dispatchEvent(
        new CustomEvent(TMC_ACCOUNT_REMOVED_EVENT, {
          detail: { profileId },
        }),
      );
      window.dispatchEvent(new CustomEvent(TMC_ACCOUNT_CHANGED_EVENT));
    } catch (error) {
      appendLocalMessage('error', getErrorMessage(error));
      await refreshAccounts(tmc, elements);
    }
  });

  window.addEventListener(TMC_AUTH_LOGGED_IN_EVENT, () => {
    void refreshAccounts(tmc, elements);
  });

  void refreshAccounts(tmc, elements);
}

type AccountSwitcherElements = {
  readonly panel: HTMLElement;
  readonly status: HTMLElement;
  readonly select: HTMLSelectElement;
  readonly removeButton: HTMLButtonElement;
};

async function refreshAccounts(
  tmc: TmcRendererPreloadApi,
  elements: AccountSwitcherElements,
): Promise<void> {
  try {
    const result = await tmc.accounts.list();
    renderAccountList(elements, result);
  } catch (error) {
    elements.status.textContent = getErrorMessage(error);
    elements.select.replaceChildren();
    setControlsDisabled(elements, true);
  }
}

function renderAccountList(
  elements: AccountSwitcherElements,
  result: TmcAccountListResult,
): void {
  elements.select.replaceChildren();

  if (result.accounts.length === 0) {
    elements.status.textContent = 'No saved accounts.';
    updateAuthStatusText('Not logged in.');
    setControlsDisabled(elements, true);
    return;
  }

  for (const account of result.accounts) {
    const option = document.createElement('option');
    option.value = account.profileId;
    option.textContent = account.isActive
      ? `${account.username} (active)`
      : account.username;

    elements.select.appendChild(option);
  }

  elements.select.value = result.activeProfileId || '';
  setControlsDisabled(elements, false);

  if (result.activeAccount) {
    const message = `Active account: ${result.activeAccount.username}`;
    elements.status.textContent = message;
    updateAuthStatusText(`Logged in as ${result.activeAccount.username}.`);
    return;
  }

  elements.status.textContent = 'No active account.';
  updateAuthStatusText('Not logged in.');
}

function renderActiveAccountResult(
  elements: AccountSwitcherElements,
  result: TmcActiveAccountResult,
): void {
  elements.status.textContent = result.activeAccount
    ? `Active account: ${result.activeAccount.username}`
    : result.message;
  updateAuthStatusText(result.message);
}

function resolveAccountSwitcherElements(): AccountSwitcherElements | null {
  const headerActions = document.querySelector<HTMLElement>('.tmc-header-actions');

  if (!headerActions) {
    return null;
  }

  const existingPanel = document.querySelector<HTMLElement>('[data-tmc-account-switcher]');

  if (existingPanel) {
    return {
      panel: existingPanel,
      status: existingPanel.querySelector<HTMLElement>('[data-tmc-account-status]') ||
        createAccountStatus(existingPanel),
      select: existingPanel.querySelector<HTMLSelectElement>('[data-tmc-account-select]') ||
        createAccountSelect(existingPanel),
      removeButton:
        existingPanel.querySelector<HTMLButtonElement>('[data-tmc-remove-local-account]') ||
        createRemoveLocalButton(existingPanel),
    };
  }

  const panel = document.createElement('section');
  panel.className = 'tmc-account-switcher';
  panel.dataset.tmcAccountSwitcher = 'true';

  const title = document.createElement('h2');
  title.className = 'tmc-auth-title';
  title.textContent = 'Accounts';

  const status = createAccountStatus(panel);
  const select = createAccountSelect(panel);
  const removeButton = createRemoveLocalButton(panel);

  panel.prepend(title);
  headerActions.appendChild(panel);

  return {
    panel,
    status,
    select,
    removeButton,
  };
}

function createAccountStatus(panel: HTMLElement): HTMLElement {
  const status = document.createElement('p');
  status.className = 'tmc-auth-status';
  status.dataset.tmcAccountStatus = 'true';
  status.textContent = 'Loading accounts...';
  panel.appendChild(status);

  return status;
}

function createAccountSelect(panel: HTMLElement): HTMLSelectElement {
  const label = document.createElement('label');
  label.className = 'tmc-field-label';
  label.textContent = 'Active account';

  const select = document.createElement('select');
  select.className = 'tmc-text-input';
  select.dataset.tmcAccountSelect = 'true';
  select.disabled = true;

  label.appendChild(select);
  panel.appendChild(label);

  return select;
}

function createRemoveLocalButton(panel: HTMLElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tmc-button tmc-button-secondary tmc-remove-account-button';
  button.dataset.tmcRemoveLocalAccount = 'true';
  button.textContent = 'Remove from this device';
  button.disabled = true;

  panel.appendChild(button);

  return button;
}

function setControlsDisabled(
  elements: AccountSwitcherElements,
  disabled: boolean,
): void {
  elements.select.disabled = disabled;
  elements.removeButton.disabled = disabled || !elements.select.value;
}

function updateAuthStatusText(message: string): void {
  const authStatusElement = document.querySelector<HTMLElement>(
    '[data-tmc-auth-status]',
  );

  if (authStatusElement) {
    authStatusElement.textContent = message;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown account error.';
}