import { readLocalPropertiesFromProjectRoot } from './LocalPropertiesReader';

/**
 * Runtime configuration used by the Electron main process.
 */
export type TmcRuntimeConfig = {
  /**
   * Base URL of the TMC backend.
   */
  readonly backendBaseUrl: string;

  /**
   * Default history window requested from the backend.
   */
  readonly defaultHistorySeconds: number;

  /**
   * Public desktop client identifier sent to the backend for diagnostics.
   */
  readonly desktopClientId: string;

  /**
   * Public desktop client version sent to the backend for diagnostics.
   */
  readonly desktopClientVersion: string;

  /**
   * Desktop flavor used by backend/OAuth diagnostics.
   */
  readonly desktopFlavor: string;

  /**
   * Optional secret key required by the current TMC history endpoint.
   *
   * Do not hardcode this value in the desktop source tree. During development,
   * put it in local.properties as TMC_HISTORY_SECRET_KEY.
   */
  readonly historySecretKey?: string;

  /**
   * Public backend URL used to start the Twitch OAuth flow.
   *
   * This is not a secret. The backend must keep client_secret and token exchange
   * logic server-side.
   */
  readonly oauthStartUrl?: string;

  /**
   * Public backend URL used to finalize an OAuth login token.
   */
  readonly oauthFinalizeUrl: string;

  /**
   * Public backend URL used to restore a durable desktop OAuth session.
   */
  readonly oauthDesktopRestoreUrl: string;

  /**
   * Public backend URL used to logout one durable desktop OAuth session.
   */
  readonly oauthDesktopLogoutUrl: string;

  /**
   * Desktop custom scheme used by the backend OAuth callback.
   */
  /**
   * Optional PCG extension URL template. Use {channel} as placeholder.
   */
  readonly pcgExtensionUrlTemplate?: string;

  readonly oauthReturnScheme: string;
};

const localProperties = readLocalPropertiesFromProjectRoot();

/**
 * Reads a runtime value from local.properties first, then environment variables.
 *
 * Local properties mirror the Android development setup and avoid accidentally
 * reusing stale PowerShell environment values during desktop development.
 */
function readConfigValue(
  environmentName: string,
  localPropertyNames: readonly string[],
): string | undefined {
  for (const propertyName of localPropertyNames) {
    const propertyValue = localProperties[propertyName]?.trim();

    if (propertyValue) {
      return propertyValue;
    }
  }

  const environmentValue = process.env[environmentName]?.trim();

  if (environmentValue) {
    return environmentValue;
  }

  return undefined;
}

/**
 * Reads an integer runtime value.
 */
function readConfigInt(
  environmentName: string,
  localPropertyNames: readonly string[],
  fallback: number,
): number {
  const rawValue = readConfigValue(environmentName, localPropertyNames);

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

/**
 * Builds a backend endpoint URL from the base URL.
 */
function buildBackendUrl(path: string): string {
  const baseUrl = readConfigValue('TMC_BACKEND_BASE_URL', [
    'TMC_BACKEND_BASE_URL',
  ]) || 'https://api.ircminichat.party';

  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

/**
 * Default runtime configuration for TMC Desktop.
 *
 * Environment variables and local.properties are supported to make dev/stable
 * switching easy without hardcoding backend URLs or secret values in source.
 */
export const TMC_RUNTIME_CONFIG: TmcRuntimeConfig = {
  backendBaseUrl:
    readConfigValue('TMC_BACKEND_BASE_URL', ['TMC_BACKEND_BASE_URL']) ||
    'https://api.ircminichat.party',

  defaultHistorySeconds: readConfigInt(
    'TMC_HISTORY_SECONDS',
    ['TMC_HISTORY_SECONDS'],
    3600,
  ),

  desktopClientId:
    readConfigValue('TMC_DESKTOP_CLIENT_ID', ['TMC_DESKTOP_CLIENT_ID']) ||
    'tmc-desktop-electron',

  desktopClientVersion:
    process.env.npm_package_version?.trim() ||
    readConfigValue('TMC_DESKTOP_CLIENT_VERSION', [
      'TMC_DESKTOP_CLIENT_VERSION',
    ]) ||
    '0.1.0',

  desktopFlavor:
    readConfigValue('TMC_DESKTOP_FLAVOR', ['TMC_DESKTOP_FLAVOR']) || 'dev',

  historySecretKey: readConfigValue('TMC_HISTORY_SECRET_KEY', [
    'TMC_HISTORY_SECRET_KEY',
    'HISTORY_SECRET_KEY',
    'historySecretKey',
  ]),

  oauthStartUrl: readConfigValue('TMC_OAUTH_START_URL', [
    'TMC_OAUTH_START_URL',
    'OAUTH_START_URL',
  ]),

  oauthFinalizeUrl:
    readConfigValue('TMC_OAUTH_FINALIZE_URL', [
      'TMC_OAUTH_FINALIZE_URL',
      'OAUTH_FINALIZE_URL',
    ]) || buildBackendUrl('/oauth/finalize'),

  oauthDesktopRestoreUrl:
    readConfigValue('TMC_OAUTH_DESKTOP_RESTORE_URL', [
      'TMC_OAUTH_DESKTOP_RESTORE_URL',
      'OAUTH_DESKTOP_RESTORE_URL',
    ]) || buildBackendUrl('/oauth/desktop/restore'),

  oauthDesktopLogoutUrl:
    readConfigValue('TMC_OAUTH_DESKTOP_LOGOUT_URL', [
      'TMC_OAUTH_DESKTOP_LOGOUT_URL',
      'OAUTH_DESKTOP_LOGOUT_URL',
    ]) || buildBackendUrl('/oauth/desktop/logout'),

  oauthReturnScheme:
    readConfigValue('TMC_OAUTH_RETURN_SCHEME', [
      'TMC_OAUTH_RETURN_SCHEME',
      'OAUTH_RETURN_SCHEME',
    ]) || 'desktop-claim',

  pcgExtensionUrlTemplate:
  readConfigValue('TMC_PCG_EXTENSION_URL_TEMPLATE', [
    'TMC_PCG_EXTENSION_URL_TEMPLATE',
  ]) ||
  'https://www.twitch.tv/popout/{channel}/extensions/pm0qkv9g4h87t5y6lg329oam8j7ze9/panel',
};