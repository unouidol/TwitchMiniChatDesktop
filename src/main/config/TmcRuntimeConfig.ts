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
   * Optional secret key required by the current TMC history endpoint.
   *
   * Do not hardcode this value in the desktop source tree. During development,
   * put it in local.properties as TMC_HISTORY_SECRET_KEY.
   */
  readonly historySecretKey?: string;
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

  historySecretKey: readConfigValue('TMC_HISTORY_SECRET_KEY', [
    'TMC_HISTORY_SECRET_KEY',
    /*
     * Android compatibility aliases, useful if you copy the same key name from
     * the Android local.properties file.
     */
    'HISTORY_SECRET_KEY',
    'historySecretKey',
  ]),
};
