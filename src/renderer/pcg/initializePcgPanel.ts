import { TMC_ACCOUNT_CHANGED_EVENT, TMC_ACCOUNT_MENU_CHANGED_EVENT } from '../accounts/initializeAccountSwitcher';
import {
  TMC_AUTH_LOGGED_IN_EVENT,
  TMC_CHANNEL_CHANGED_EVENT,
} from '../chat/TmcChannelChatController';
import type { TmcPcgStatus } from '../../shared/pcg/TmcPcgModels';
import { TMC_AUTH_DIALOG_CHANGED_EVENT } from '../auth/initializeAuthPanel';
import { isLocalDialogVisible } from '../dialogs/TmcLocalDialog';
import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';
import { appendLocalMessage } from '../chat/appendLocalMessage';

const MIN_PCG_VIEW_SIZE = 20;
const SIGN_OUT_CONFIRM_MESSAGE =
  'Sign out of Twitch for PCG and video on this account? Chat stays signed in.';

/**
 * Initializes the passive PokémonCommunityGame panel status UI.
 *
 * The real PCG web surface is owned by the Electron main process through a
 * WebContentsView. The renderer only measures the host bounds, requests
 * activation, and displays safe status text.
 */
export function initializePcgPanel(tmc: TmcRendererPreloadApi): void {
  const panel = document.querySelector<HTMLElement>('.tmc-pcg-panel');
  const host = document.querySelector<HTMLElement>('#pcgHost') || panel;
  const statusElement = ensureStatusElement(panel);
  const loginButton =
    panel?.querySelector<HTMLButtonElement>('[data-tmc-pcg-login]') || null;
  const quickLoginButton = panel?.querySelector<HTMLButtonElement>('[data-tmc-pcg-login-quick]');
  const signInPrompt = panel?.querySelector<HTMLElement>('[data-tmc-pcg-sign-in]');
  const signInDescription = panel?.querySelector<HTMLElement>('[data-tmc-pcg-sign-in-description]');
  const detachButton =
    panel?.querySelector<HTMLButtonElement>('[data-tmc-pcg-detach]') || null;
  const logoutButton = panel?.querySelector<HTMLButtonElement>('[data-tmc-pcg-logout]') || null;
  const detachedPlaceholder = ensureDetachedPlaceholder(host);
  const menu = panel?.querySelector<HTMLDetailsElement>('[data-tmc-pcg-menu]');
  const lifetime = new AbortController();
  const closeMenu = (): void => {
    if (menu) menu.open = false;
  };
  let currentDisplayMode: TmcPcgStatus['displayMode'] = 'embedded';
  let lastKnownChannel = readChannelFromInput();
  let frameHandle: number | null = null;
  let loginPending = false;
  let logoutPending = false;
  let shownProfileId: string | null = null;

  if (loginButton) {
    loginButton.disabled = true;
  }

  const renderStatus = (status: TmcPcgStatus): void => {
    const accountSelect = document.querySelector<HTMLSelectElement>('[data-tmc-account-select]');
    if (status.profileId && accountSelect && status.profileId !== accountSelect.value) return;
    currentDisplayMode = status.displayMode;
    shownProfileId = status.profileId;
    if (panel) panel.dataset.tmcPcgTwitchAuth = status.twitchAuth;
    if (logoutButton) {
      logoutButton.hidden = status.twitchAuth !== 'session-present';
      logoutButton.disabled = logoutPending || !status.profileId;
    }
    if (signInPrompt) {
      const wasHidden = signInPrompt.hidden;
      signInPrompt.hidden = status.state !== 'active' || status.twitchAuth === 'session-present';
      if (wasHidden !== signInPrompt.hidden) scheduleBoundsSync();
    }
    if (signInDescription) signInDescription.textContent = status.twitchAuth === 'unknown'
      ? 'We could not confirm a Twitch session for the game. You can sign in here; chat login is separate.'
      : 'PCG and video share this Twitch sign-in, separate from chat. Use the account selected in chat.';
    if (quickLoginButton) quickLoginButton.disabled = status.state !== 'active' || loginPending;
    host?.classList.toggle('tmc-pcg-host-detached', status.displayMode === 'detached');

    if (detachedPlaceholder) {
      detachedPlaceholder.hidden = status.displayMode !== 'detached';
    }

    if (statusElement) {
      statusElement.textContent = formatPcgStatus(status);
    }

    if (loginButton) {
      loginButton.disabled = status.state !== 'active' || loginPending;
    }
  };

  const syncBoundsNow = async (): Promise<void> => {
    if (!host) {
      return;
    }

    const rect = host.getBoundingClientRect();
    const bounds = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    try {
      const accountMenu = document.querySelector<HTMLDetailsElement>('[data-tmc-account-menu]');
      if (menu?.open || accountMenu?.open || isLocalDialogVisible() ||
          bounds.width <= MIN_PCG_VIEW_SIZE || bounds.height <= MIN_PCG_VIEW_SIZE) {
        await tmc.pcg.hideView();
        return;
      }

      await tmc.pcg.setBounds(bounds);
    } catch {
      // PCG bounds must never block login, account switching, or chat.
    }
  };

  const scheduleBoundsSync = (): void => {
    if (frameHandle !== null) {
      return;
    }

    frameHandle = window.requestAnimationFrame(() => {
      frameHandle = null;
      void syncBoundsNow();
    });
  };

  menu?.addEventListener('toggle', scheduleBoundsSync, { signal: lifetime.signal });
  menu?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMenu();
    menu.querySelector('summary')?.focus();
    event.preventDefault();
  }, { signal: lifetime.signal });
  menu?.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && !menu.contains(event.relatedTarget)) closeMenu();
  }, { signal: lifetime.signal });
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !menu?.contains(event.target)) closeMenu();
  }, { signal: lifetime.signal });

  const activatePcg = async (channelOverride?: string | null): Promise<void> => {
    const channel = normalizeChannel(
      channelOverride || lastKnownChannel || readChannelFromInput() || '',
    );

    if (channel) {
      lastKnownChannel = channel;
    }

    await syncBoundsNow();

    try {
      renderStatus({
        twitchAuth: 'unknown',
        state: 'loading',
        displayMode: currentDisplayMode,
        profileId: null,
        channel: channel || null,
        message: null,
      });

      renderStatus(
        await tmc.pcg.activate(
          channel
            ? {
                channel,
              }
            : undefined,
        ),
      );
      await syncBoundsNow();
    } catch (error) {
      renderStatus({
        twitchAuth: 'unknown',
        state: 'error',
        displayMode: currentDisplayMode,
        profileId: null,
        channel: channel || null,
        message: getErrorMessage(error),
      });
    }
  };

  tmc.pcg.onStatusChanged((status) => {
    if (status.channel) {
      lastKnownChannel = normalizeChannel(status.channel);
    }

    renderStatus(status);
  });

  const openLogin = async (): Promise<void> => {
    if (loginPending) return;
    loginPending = true;
    closeMenu();
    menu?.querySelector('summary')?.focus();
    if (loginButton) loginButton.disabled = true;
    if (quickLoginButton) quickLoginButton.disabled = true;

    try {
      const status = await tmc.pcg.openTwitchLogin();
      loginPending = false;
      renderStatus(status);
    } catch (error) {
      loginPending = false;
      renderStatus({
        twitchAuth: 'unknown',
        state: 'error',
        displayMode: currentDisplayMode,
        profileId: null,
        channel: lastKnownChannel,
        message: getErrorMessage(error),
      });
    }
  };
  loginButton?.addEventListener('click', openLogin);

  logoutButton?.addEventListener('click', async () => {
    const profileId = shownProfileId;
    closeMenu();
    menu?.querySelector('summary')?.focus();
    if (logoutPending || !profileId || !window.confirm(SIGN_OUT_CONFIRM_MESSAGE)) return;
    logoutPending = true;
    logoutButton.disabled = true;

    try {
      const status = await tmc.pcg.signOutTwitch({ profileId });
      logoutPending = false;
      renderStatus(status);
    } catch (error) {
      logoutPending = false;
      logoutButton.disabled = false;
      appendLocalMessage('error', getErrorMessage(error));
    }
  }, { signal: lifetime.signal });
  quickLoginButton?.addEventListener('click', openLogin, { signal: lifetime.signal });

  detachButton?.addEventListener('click', async () => {
    closeMenu();
    menu?.querySelector('summary')?.focus();
    detachButton.disabled = true;

    try {
      renderStatus(await tmc.pcg.openDetachedWindow());
    } catch (error) {
      renderStatus({
        twitchAuth: 'unknown',
        state: 'error',
        displayMode: currentDisplayMode,
        profileId: null,
        channel: lastKnownChannel,
        message: getErrorMessage(error),
      });
    } finally {
      detachButton.disabled = false;
    }
  });

  if (host && typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => {
      scheduleBoundsSync();
    });
    resizeObserver.observe(host);
  }

  window.addEventListener('resize', scheduleBoundsSync);
  window.addEventListener(TMC_AUTH_DIALOG_CHANGED_EVENT, scheduleBoundsSync);
  window.addEventListener(TMC_ACCOUNT_MENU_CHANGED_EVENT, scheduleBoundsSync);
  window.addEventListener('pagehide', () => {
    lifetime.abort();
    window.removeEventListener(TMC_AUTH_DIALOG_CHANGED_EVENT, scheduleBoundsSync);
    window.removeEventListener(TMC_ACCOUNT_MENU_CHANGED_EVENT, scheduleBoundsSync);
  }, { once: true });
  window.addEventListener(TMC_ACCOUNT_CHANGED_EVENT, () => {
    void activatePcg(lastKnownChannel);
  });
  window.addEventListener(TMC_AUTH_LOGGED_IN_EVENT, () => {
    void activatePcg(lastKnownChannel);
  });
  window.addEventListener(TMC_CHANNEL_CHANGED_EVENT, (event) => {
    const channel = readChannelFromEvent(event);

    if (channel) {
      lastKnownChannel = channel;
    }

    void activatePcg(channel);
  });

  scheduleBoundsSync();
  void tmc.pcg
    .getStatus()
    .then((status) => {
      if (status.channel) {
        lastKnownChannel = normalizeChannel(status.channel);
      }

      renderStatus(status);
    })
    .then(() => activatePcg(lastKnownChannel))
    .catch((error) => {
      renderStatus({
        twitchAuth: 'unknown',
        state: 'error',
        displayMode: currentDisplayMode,
        profileId: null,
        channel: lastKnownChannel,
        message: getErrorMessage(error),
      });
    });
}

function ensureDetachedPlaceholder(host: HTMLElement | null): HTMLElement | null {
  if (!host) {
    return null;
  }

  const existingPlaceholder = host.querySelector<HTMLElement>('[data-tmc-pcg-detached-placeholder]');

  if (existingPlaceholder) {
    return existingPlaceholder;
  }

  const placeholder = document.createElement('div');
  placeholder.className = 'tmc-pcg-detached-placeholder';
  placeholder.dataset.tmcPcgDetachedPlaceholder = 'true';
  placeholder.hidden = true;

  const title = document.createElement('p');
  title.className = 'tmc-pcg-detached-title';
  title.textContent = 'PCG extension opened in a separate window';

  const detail = document.createElement('p');
  detail.className = 'tmc-pcg-detached-detail';
  detail.textContent = 'Close the separate window to restore the embedded panel.';

  placeholder.append(title, detail);
  host.appendChild(placeholder);

  return placeholder;
}

/**
 * Ensures that the PCG status text exists in the local renderer panel.
 */
function ensureStatusElement(panel: HTMLElement | null): HTMLElement | null {
  if (!panel) {
    return null;
  }

  const existingStatus = panel.querySelector<HTMLElement>('[data-tmc-pcg-status]');

  if (existingStatus) {
    return existingStatus;
  }

  const status = document.createElement('p');
  status.dataset.tmcPcgStatus = 'true';
  status.className = 'tmc-pcg-status';
  status.textContent = 'PCG: empty';
  panel.appendChild(status);

  return status;
}

/**
 * Reads the channel from the chat channel input when available.
 */
function readChannelFromInput(): string | null {
  const channelInput = document.querySelector<HTMLInputElement>('#channelInput');
  const channel = normalizeChannel(channelInput?.value || '');

  return channel || null;
}

/**
 * Reads the channel from the renderer channel-change event detail.
 */
function readChannelFromEvent(event: Event): string | null {
  if (!(event instanceof CustomEvent)) {
    return null;
  }

  const detail = event.detail as { readonly channel?: unknown } | null;
  const channel = typeof detail?.channel === 'string' ? detail.channel : '';

  return normalizeChannel(channel) || null;
}

/**
 * Normalizes a Twitch channel name for URL construction and comparisons.
 */
function normalizeChannel(channel: string): string {
  return channel.trim().replace(/^#/, '').toLowerCase();
}

/**
 * Formats a renderer-safe PCG status for the compact panel label.
 */
function formatPcgStatus(status: TmcPcgStatus): string {
  if (status.displayMode === 'detached') {
    return status.channel ? `PCG: detached #${status.channel}` : 'PCG: detached';
  }

  if (status.state === 'loading' && status.channel) {
    return `PCG: loading #${status.channel}`;
  }

  if (status.state === 'active' && status.channel) {
    return `PCG: active #${status.channel}`;
  }

  if (status.state === 'error') {
    return status.message ? `PCG: error ${status.message}` : 'PCG: error';
  }

  return 'PCG: empty';
}

/**
 * Converts unknown activation failures into a safe UI message.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'PCG panel failed.';
}
