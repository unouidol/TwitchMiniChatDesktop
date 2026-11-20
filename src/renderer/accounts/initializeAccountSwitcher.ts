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
export const TMC_ACCOUNT_MENU_CHANGED_EVENT = 'tmc:account:menu-changed';

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

  const lifetime = new AbortController();
  const closeMenu = (): void => { elements.menu.open = false; };
  elements.menu.addEventListener('toggle', () => {
    window.dispatchEvent(new Event(TMC_ACCOUNT_MENU_CHANGED_EVENT));
  }, { signal: lifetime.signal });
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !elements.menu.contains(event.target)) closeMenu();
  }, { signal: lifetime.signal });
  elements.menu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMenu();
    elements.menu.querySelector('summary')?.focus();
    event.preventDefault();
  }, { signal: lifetime.signal });
  elements.menu.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && !elements.menu.contains(event.relatedTarget)) closeMenu();
  }, { signal: lifetime.signal });
  window.addEventListener('pagehide', () => lifetime.abort(), { once: true });

  elements.select.addEventListener('change', async () => {
    closeMenu();
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
    closeMenu();
    elements.menu.querySelector('summary')?.focus();

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
  readonly status: HTMLElement;
  readonly select: HTMLSelectElement;
  readonly removeButton: HTMLButtonElement;
  readonly menu: HTMLDetailsElement;
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
    const option = document.createElement('option');
    option.textContent = 'Accounts unavailable';
    option.value = '';
    elements.select.appendChild(option);
    setControlsDisabled(elements, true);
  }
}

function renderAccountList(
  elements: AccountSwitcherElements,
  result: TmcAccountListResult,
): void {
  elements.select.replaceChildren();

  if (result.accounts.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'No saved accounts';
    option.value = '';
    elements.select.appendChild(option);
    elements.status.textContent = 'No saved accounts.';
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
    return;
  }

  elements.status.textContent = 'No active account.';
}

function renderActiveAccountResult(
  elements: AccountSwitcherElements,
  result: TmcActiveAccountResult,
): void {
  elements.status.textContent = result.activeAccount
    ? `Active account: ${result.activeAccount.username}`
    : result.message;
}

function resolveAccountSwitcherElements(): AccountSwitcherElements | null {
  const panel = document.querySelector<HTMLElement>('[data-tmc-account-switcher]');
  const status = panel?.querySelector<HTMLElement>('[data-tmc-account-status]');
  const select = panel?.querySelector<HTMLSelectElement>('[data-tmc-account-select]');
  const removeButton = panel?.querySelector<HTMLButtonElement>('[data-tmc-remove-local-account]');
  const menu = panel?.querySelector<HTMLDetailsElement>('[data-tmc-account-menu]');
  if (!panel || !status || !select || !removeButton || !menu) return null;
  return { status, select, removeButton, menu };
}

function setControlsDisabled(
  elements: AccountSwitcherElements,
  disabled: boolean,
): void {
  elements.select.disabled = disabled;
  elements.removeButton.disabled = disabled || !elements.select.value;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown account error.';
}
