import type {
  TmcAccountListResult,
  TmcAccountSummary,
  TmcActiveAccountResult,
} from '../../shared/accounts/TmcAccountModels';
import type { TmcAuthSession } from '../auth/TmcAuthSessionStore';
import type { TmcAccountStore, TmcStoredAccountSession } from './TmcAccountStore';
import type { TmcActiveAccountStore } from './TmcActiveAccountStore';

/**
 * Main-process registry for restored accounts and the active OAuth session.
 */
export class TmcAccountSessionRegistry {
  private readonly accounts = new Map<string, TmcStoredAccountSession>();
  private activeProfileId: string | null = null;

  /**
   * Creates an account session registry.
   */
  constructor(
    private readonly accountStore: TmcAccountStore,
    private readonly activeAccountStore: TmcActiveAccountStore,
  ) {}

  /**
   * Loads account metadata and remembers the preferred active profile.
   */
  async initialize(): Promise<void> {
    this.replaceAccounts(await this.accountStore.loadAccounts());
    this.activeProfileId = await this.activeAccountStore.loadActiveProfileId();
    await this.ensureActiveAccount();
  }

  /**
   * Adds or updates an OAuth account and makes it active by default.
   */
  async addOrUpdateSession(
    session: TmcAuthSession,
    options: { readonly makeActive?: boolean } = {},
  ): Promise<TmcActiveAccountResult> {
    const makeActive = options.makeActive !== false;
    const storedSession: TmcStoredAccountSession = {
      profileId: session.profileId,
      username: session.username,
      userId: session.userId,
      accessToken: session.accessToken,
      desktopSessionToken: session.desktopSessionToken,
      savedAt: Date.now(),
    };

    this.accounts.set(storedSession.profileId, storedSession);

    if (makeActive) {
      this.activeProfileId = storedSession.profileId;
      await this.persistActiveProfileIdSafely(storedSession.profileId);
    }

    await this.persistAccountsSafely();
    await this.ensureActiveAccount();

    return this.getActiveAccountResult();
  }

  /**
   * Removes an account from the in-memory registry.
   */
  async removeAccount(profileId: string): Promise<void> {
    const normalizedProfileId = normalizeProfileId(profileId);

    if (!normalizedProfileId) {
      return;
    }

    this.accounts.delete(normalizedProfileId);

    if (this.activeProfileId === normalizedProfileId) {
      this.activeProfileId = null;
    }

    await this.ensureActiveAccount();
    await this.persistAccountsSafely();
  }

  /**
   * Ensures the active profile points to a valid restored account when possible.
   */
  async ensureActiveAccount(): Promise<TmcActiveAccountResult> {
    if (this.activeProfileId && this.accounts.has(this.activeProfileId)) {
      await this.persistActiveProfileIdSafely(this.activeProfileId);
      return this.getActiveAccountResult();
    }

    const fallbackAccount = this.getSortedAccounts()[0] || null;
    this.activeProfileId = fallbackAccount?.profileId || null;

    if (this.activeProfileId) {
      await this.persistActiveProfileIdSafely(this.activeProfileId);
    }

    return this.getActiveAccountResult();
  }

  /**
   * Sets the active account by profile identifier.
   */
  async setActiveAccount(profileId: string): Promise<TmcActiveAccountResult> {
    const normalizedProfileId = normalizeProfileId(profileId);

    if (!normalizedProfileId || !this.accounts.has(normalizedProfileId)) {
      throw new Error('Account not found.');
    }

    this.activeProfileId = normalizedProfileId;
    await this.persistActiveProfileIdSafely(normalizedProfileId);

    return this.getActiveAccountResult();
  }

  /**
   * Returns the active OAuth session for main-process features.
   */
  getActiveSession(): TmcAuthSession | null {
    if (!this.activeProfileId) {
      return null;
    }

    const account = this.accounts.get(this.activeProfileId);

    if (!account) {
      return null;
    }

    return {
      profileId: account.profileId,
      username: account.username,
      userId: account.userId,
      accessToken: account.accessToken,
      desktopSessionToken: account.desktopSessionToken,
    };
  }

  /**
   * Returns all saved accounts without OAuth tokens.
   */
  listAccounts(): TmcAccountListResult {
    const accounts = this.getSortedAccounts().map((account) => {
      return this.toAccountSummary(account);
    });
    const activeAccount = accounts.find((account) => account.isActive) || null;

    return {
      accounts,
      activeProfileId: this.activeProfileId,
      activeAccount,
    };
  }

  /**
   * Returns the active account without OAuth tokens.
   */
  getActiveAccountResult(): TmcActiveAccountResult {
    const activeSession = this.activeProfileId
      ? this.accounts.get(this.activeProfileId) || null
      : null;
    const activeAccount = activeSession
      ? this.toAccountSummary(activeSession)
      : null;

    return {
      isLoggedIn: Boolean(activeAccount),
      loggedIn: Boolean(activeAccount),
      activeProfileId: activeAccount?.profileId || null,
      activeAccount,
      message: activeAccount
        ? `Logged in as ${activeAccount.username}.`
        : 'Not logged in.',
    };
  }

  private replaceAccounts(accounts: readonly TmcStoredAccountSession[]): void {
    this.accounts.clear();

    for (const account of accounts) {
      this.accounts.set(account.profileId, account);
    }
  }

  private getSortedAccounts(): readonly TmcStoredAccountSession[] {
    return Array.from(this.accounts.values()).sort(
      (left, right) => right.savedAt - left.savedAt,
    );
  }

  private toAccountSummary(account: TmcStoredAccountSession): TmcAccountSummary {
    return {
      profileId: account.profileId,
      username: account.username,
      userId: account.userId,
      isActive: account.profileId === this.activeProfileId,
      savedAt: account.savedAt,
    };
  }

  private async persistAccountsSafely(): Promise<void> {
    try {
      await this.accountStore.saveAccounts();
    } catch {
      console.warn('[TMC Accounts] Account registry persistence skipped.');
    }
  }

  private async persistActiveProfileIdSafely(profileId: string): Promise<void> {
    try {
      await this.activeAccountStore.saveActiveProfileId(profileId);
    } catch {
      console.warn('[TMC Accounts] Active account save failed.');
    }
  }
}

function normalizeProfileId(profileId: string): string | null {
  const trimmed = profileId.trim();

  return trimmed.length > 0 ? trimmed : null;
}