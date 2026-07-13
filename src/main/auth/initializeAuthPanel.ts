/**
 * Minimal shape of the auth preload API used by the renderer.
 */
interface TmcAuthWindowApi {
  /**
   * Authentication APIs exposed by the preload script.
   */
  auth: {
    /**
     * Opens Twitch OAuth in the external browser.
     */
    startTwitchLogin?: (request: { source: string }) => Promise<{
      started: boolean;
      authUrl: string;
      message: string;
    }>;

    /**
     * Older alias used by previous auth scaffold.
     */
    openTwitchLogin?: (request: { slot: number }) => Promise<unknown>;

    /**
     * Finalizes the pasted manual claim code.
     */
    finalizeLoginToken?: (loginToken: string) => Promise<{
      success: boolean;
      profileId: string;
      username: string;
      userId: string;
      message: string;
    }>;

    /**
     * Older alias used by previous auth scaffold.
     */
    finalizeTwitchLogin?: (request: { loginToken: string }) => Promise<{
      profile?: {
        username?: string;
      };
      username?: string;
      message?: string;
    }>;

    /**
     * Reads the current auth status.
     */
    getStatus?: () => Promise<{
      loggedIn?: boolean;
      isLoggedIn?: boolean;
      username?: string | null;
      profile?: {
        username?: string;
      } | null;
    }>;

    /**
     * Older alias used by previous auth scaffold.
     */
    getSession?: () => Promise<{
      loggedIn?: boolean;
      isLoggedIn?: boolean;
      username?: string | null;
      profile?: {
        username?: string;
      } | null;
    }>;
  };
}

/**
 * Initializes the manual Twitch claim-code login panel.
 */
export function initializeAuthPanel(): void {
  const tmc = (window as Window & typeof globalThis & { tmc?: TmcAuthWindowApi }).tmc;

  const loginButton = document.querySelector<HTMLButtonElement>('[data-tmc-auth-login]');
  const finalizeButton = document.querySelector<HTMLButtonElement>('[data-tmc-auth-finalize]');
  const loginCodeInput = document.querySelector<HTMLInputElement>('[data-tmc-auth-code]');
  const statusLabel = document.querySelector<HTMLElement>('[data-tmc-auth-status]');

  if (!tmc?.auth || !loginButton || !finalizeButton || !loginCodeInput || !statusLabel) {
    console.warn('[TMC Auth] Auth panel skipped because required DOM/API elements are missing.');
    return;
  }

  /**
   * Updates the visible authentication status.
   */
  const setStatus = (message: string): void => {
    statusLabel.textContent = message;
  };

  loginButton.addEventListener('click', async () => {
    try {
      loginButton.disabled = true;
      setStatus('Opening Twitch authorization...');

      if (tmc.auth.startTwitchLogin) {
        await tmc.auth.startTwitchLogin({
          source: 'main-window',
        });
      } else if (tmc.auth.openTwitchLogin) {
        await tmc.auth.openTwitchLogin({
          slot: 0,
        });
      } else {
        throw new Error('No Twitch login method exposed by preload.');
      }

      setStatus('Authorize in the browser, then paste the login code here.');
      loginCodeInput.focus();
    } catch (error) {
      console.error('[TMC Auth] Failed to open Twitch login.', error);
      setStatus('Could not open Twitch authorization.');
    } finally {
      loginButton.disabled = false;
    }
  });

  finalizeButton.addEventListener('click', async () => {
    const loginToken = loginCodeInput.value.trim();

    if (!loginToken) {
      setStatus('Paste the login code first.');
      loginCodeInput.focus();
      return;
    }

    try {
      finalizeButton.disabled = true;
      setStatus('Finalizing Twitch login...');

      if (tmc.auth.finalizeLoginToken) {
        const result = await tmc.auth.finalizeLoginToken(loginToken);

        loginCodeInput.value = '';
        setStatus(result.message || `Logged in as ${result.username}.`);
        return;
      }

      if (tmc.auth.finalizeTwitchLogin) {
        const result = await tmc.auth.finalizeTwitchLogin({
          loginToken,
        });

        const username = result.profile?.username || result.username || 'Twitch user';

        loginCodeInput.value = '';
        setStatus(result.message || `Logged in as ${username}.`);
        return;
      }

      throw new Error('No Twitch finalize method exposed by preload.');
    } catch (error) {
      console.error('[TMC Auth] Failed to finalize Twitch login.', error);
      setStatus('Login code invalid or expired.');
    } finally {
      finalizeButton.disabled = false;
    }
  });

  const loadStatus = tmc.auth.getStatus || tmc.auth.getSession;

  if (loadStatus) {
    void loadStatus().then((status) => {
      const username = status.username || status.profile?.username || null;
      const loggedIn = status.loggedIn || status.isLoggedIn || Boolean(username);

      if (loggedIn && username) {
        setStatus(`Logged in as ${username}.`);
      }
    });
  }
}