import type { TmcAuthSession } from '../auth/TmcAuthSessionStore';

/**
 * Main-process saved account session kept in memory for the current app run.
 */
export type TmcStoredAccountSession = TmcAuthSession & {
  /**
   * Unix epoch milliseconds when this account was last restored or saved.
   */
  readonly savedAt: number;
};

/**
 * Compatibility account store.
 *
 * Durable desktop auth now lives in TmcSecureAuthSessionStore and persists only
 * desktop_session_token values encrypted with safeStorage. This store therefore
 * intentionally avoids writing access tokens to disk.
 */
export class TmcAccountStore {
  /**
   * Loads persisted in-memory account sessions.
   */
  async loadAccounts(): Promise<readonly TmcStoredAccountSession[]> {
    return [];
  }

  /**
   * No-op: access tokens must not be persisted by the account registry.
   */
  async saveAccounts(): Promise<void> {
    // Durable account restore is handled by TmcSecureAuthSessionStore.
  }
}