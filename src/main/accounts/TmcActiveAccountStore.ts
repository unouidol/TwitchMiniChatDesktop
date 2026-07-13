import { app } from 'electron';
import path from 'node:path';
import { JsonFileStore } from '../storage/JsonFileStore';

type PersistedActiveAccount = {
  /**
   * Active Twitch profile identifier. This is not a secret.
   */
  readonly activeProfileId: string | null;
};

const DEFAULT_ACTIVE_ACCOUNT: PersistedActiveAccount = {
  activeProfileId: null,
};

/**
 * Persists the active account profile identifier outside the encrypted token blob.
 */
export class TmcActiveAccountStore {
  private readonly store: JsonFileStore<PersistedActiveAccount>;

  /**
   * Creates the active account store.
   */
  constructor(
    filePath = path.join(app.getPath('userData'), 'tmc-active-account.json'),
  ) {
    this.store = new JsonFileStore(filePath, DEFAULT_ACTIVE_ACCOUNT);
  }

  /**
   * Loads the active profile identifier, when available.
   */
  async loadActiveProfileId(): Promise<string | null> {
    try {
      const value = await this.store.read();
      const activeProfileId = normalizeProfileId(value.activeProfileId);

      return activeProfileId || null;
    } catch {
      return null;
    }
  }

  /**
   * Saves the active profile identifier.
   */
  async saveActiveProfileId(profileId: string): Promise<void> {
    const activeProfileId = normalizeProfileId(profileId);

    if (!activeProfileId) {
      throw new Error('Active profileId cannot be empty.');
    }

    await this.store.write({ activeProfileId });
  }

  /**
   * Clears the active profile identifier.
   */
  async clearActiveProfileId(): Promise<void> {
    await this.store.write(DEFAULT_ACTIVE_ACCOUNT);
  }
}

function normalizeProfileId(profileId: unknown): string | null {
  if (typeof profileId !== 'string') {
    return null;
  }

  const trimmed = profileId.trim();

  return trimmed.length > 0 ? trimmed : null;
}