import { shell } from 'electron';
import type {
  FinalizeTwitchLoginResult,
  StartTwitchLoginRequest,
  StartTwitchLoginResult,
  TmcAuthStatus,
} from '../../shared/auth/TmcAuthModels';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';
import type { TmcAuthSession } from './TmcAuthSessionStore';
import { TmcAuthSessionStore } from './TmcAuthSessionStore';

/**
 * Raw response returned by the TMC OAuth finalize/restore endpoints.
 */
type RawOAuthFinalizeResponse = {
  readonly profile_id?: unknown;
  readonly username?: unknown;
  readonly user_id?: unknown;
  readonly access_token?: unknown;
  readonly desktop_session_token?: unknown;
  readonly error?: unknown;
};

/**
 * Desktop OAuth uses a manual claim-code page instead of a custom protocol.
 */
const DESKTOP_CLAIM_RETURN_SCHEME = 'desktop-claim';

/**
 * Starts, finalizes, and restores the TMC Desktop authentication flow.
 *
 * The Twitch client_secret and token exchange remain server-side. The desktop
 * app only opens the external broker URL, finalizes the one-time login token,
 * and later restores through a durable desktop session token.
 */
export class TmcAuthBrokerClient {
  /**
   * Creates the auth broker client.
   */
  constructor(
    private readonly config: TmcRuntimeConfig,
    private readonly sessionStore: TmcAuthSessionStore,
  ) {}

  /**
   * Returns the current authentication status.
   */
  getStatus(): TmcAuthStatus {
    return this.sessionStore.getStatus();
  }

  /**
   * Opens the external Twitch OAuth flow through the TMC backend broker.
   */
  async startTwitchLogin(
    request: StartTwitchLoginRequest,
  ): Promise<StartTwitchLoginResult> {
    if (!this.config.oauthStartUrl) {
      throw new Error(
        'Missing TMC_OAUTH_START_URL in local.properties or environment variables.',
      );
    }

    const authUrl = buildDesktopOAuthStartUrl(
      this.config.oauthStartUrl,
      this.config,
      request,
    );
    /*
     * This URL contains no Twitch access token, desktop session token, or
     * client secret. Logging it helps verify the manual claim-code flow.
     */
    console.log(`[TMC Auth] Opening Twitch OAuth: ${authUrl}`);

    await shell.openExternal(authUrl);

    return {
      started: true,
      authUrl,
      message: 'Opened Twitch login in your browser.',
    };
  }

  /**
   * Finalizes the one-time login token pasted by the user from the claim page.
   */
  async finalizeLoginToken(
    loginToken: string,
  ): Promise<FinalizeTwitchLoginResult> {
    const response = await postOAuthJson(this.config, this.config.oauthFinalizeUrl, {
      login_token: loginToken,
    });
    const rawJson = (await response.json()) as RawOAuthFinalizeResponse;

    if (!response.ok) {
      throw new Error(readString(rawJson.error) || 'OAuth finalize failed.');
    }

    const session = normalizeFinalizeResponse(rawJson);

    if (!session.desktopSessionToken) {
      console.warn(
        '[TMC Auth] OAuth finalize response did not include a desktop session token.',
      );
    }

    this.sessionStore.setSession(session);

    return {
      success: true,
      profileId: session.profileId,
      username: session.username,
      userId: session.userId,
      message: `Logged in as ${session.username}.`,
    };
  }

  /**
   * Restores a durable desktop auth session and obtains a fresh access token.
   */
  async restoreDesktopSession(desktopSessionToken: string): Promise<TmcAuthSession> {
    const response = await postOAuthJson(
      this.config,
      this.config.oauthDesktopRestoreUrl,
      {
        desktop_session_token: desktopSessionToken,
      },
    );
    const rawJson = (await response.json()) as RawOAuthFinalizeResponse;

    if (!response.ok) {
      throw new Error(readString(rawJson.error) || 'Desktop session restore failed.');
    }

    const session = normalizeFinalizeResponse(rawJson, desktopSessionToken);
    this.sessionStore.setSession(session);

    return session;
  }

  /**
   * Invalidates one durable desktop auth session on the backend.
   */
  async logoutDesktopSession(desktopSessionToken: string): Promise<void> {
    const response = await postOAuthJson(
      this.config,
      this.config.oauthDesktopLogoutUrl,
      {
        desktop_session_token: desktopSessionToken,
      },
      AbortSignal.timeout(10_000),
    );

    if (!response.ok) {
      let message = 'Desktop session logout failed.';

      try {
        const rawJson = (await response.json()) as RawOAuthFinalizeResponse;
        message = readString(rawJson.error) || message;
      } catch {
        // Keep logout warnings non-sensitive even when the server body is invalid.
      }

      throw new Error(message);
    }
  }
}

/**
 * Builds the public backend OAuth start URL for TMC Desktop.
 */
function buildDesktopOAuthStartUrl(
  oauthStartUrl: string,
  config: TmcRuntimeConfig,
  request: StartTwitchLoginRequest,
): string {
  const url = new URL(oauthStartUrl);
  const desktopReturnScheme = resolveDesktopReturnScheme(config);

  /*
   * These parameters define the desktop OAuth flow and must override any stale
   * value that may be present in local.properties or in the configured URL.
   */
  url.searchParams.set('slot', '0');
  url.searchParams.set('return_scheme', desktopReturnScheme);

  /*
   * Extra parameters are ignored by the current Python backend, but are useful
   * for logs and future desktop-specific behavior.
   */
  setSearchParamIfMissing(url, 'platform', 'desktop');
  setSearchParamIfMissing(url, 'flavor', config.desktopFlavor);
  setSearchParamIfMissing(url, 'client', config.desktopClientId);
  setSearchParamIfMissing(url, 'version', config.desktopClientVersion);

  if (request.source) {
    setSearchParamIfMissing(url, 'source', request.source);
  }

  return url.toString();
}

/**
 * Resolves the desktop OAuth return scheme.
 *
 * TMC Desktop currently supports only the manual claim-code flow. Android
 * custom protocol schemes are intentionally ignored here.
 */
function resolveDesktopReturnScheme(config: TmcRuntimeConfig): string {
  const configuredReturnScheme =
    typeof config.oauthReturnScheme === 'string'
      ? config.oauthReturnScheme.trim()
      : '';

  if (configuredReturnScheme === DESKTOP_CLAIM_RETURN_SCHEME) {
    return configuredReturnScheme;
  }

  console.warn(
    `[TMC Auth] Ignoring OAuth return scheme "${configuredReturnScheme || '<empty>'}". ` +
      `Desktop requires "${DESKTOP_CLAIM_RETURN_SCHEME}".`,
  );

  return DESKTOP_CLAIM_RETURN_SCHEME;
}

/**
 * Adds a URL search parameter only when the backend URL did not already define it.
 */
function setSearchParamIfMissing(
  url: URL,
  name: string,
  value: string,
): void {
  if (!url.searchParams.has(name)) {
    url.searchParams.set(name, value);
  }
}

/**
 * Posts JSON to an OAuth endpoint without logging secret payload values.
 */
function postOAuthJson(
  config: TmcRuntimeConfig,
  url: string,
  payload: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': buildUserAgent(config),
      'X-TMC-Client': config.desktopClientId,
      'X-TMC-Client-Version': config.desktopClientVersion,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Builds a public User-Agent for backend diagnostics.
 */
function buildUserAgent(config: TmcRuntimeConfig): string {
  return `TMCDesktop/${config.desktopClientVersion} (${config.desktopClientId})`;
}

/**
 * Converts the raw finalize/restore response into an in-memory auth session.
 */
function normalizeFinalizeResponse(
  rawJson: RawOAuthFinalizeResponse,
  fallbackDesktopSessionToken?: string,
): TmcAuthSession {
  const profileId = readString(rawJson.profile_id);
  const username = readString(rawJson.username);
  const userId = readString(rawJson.user_id);
  const accessToken = readString(rawJson.access_token);
  const desktopSessionToken =
    readString(rawJson.desktop_session_token) || fallbackDesktopSessionToken;

  if (!profileId || !username || !userId || !accessToken) {
    throw new Error('OAuth response is missing required fields.');
  }

  return {
    profileId,
    username,
    userId,
    accessToken,
    desktopSessionToken,
  };
}

/**
 * Reads a non-empty string from an unknown JSON field.
 */
function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}
