import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { TmcAuthSession } from './TmcAuthSessionStore';

/**
 * Persisted durable desktop session metadata encrypted at rest.
 */
export type TmcSecureDesktopAuthSession = {
  /**
   * Twitch profile identifier used by the TMC backend.
   */
  readonly profileId: string;

  /**
   * Twitch login name.
   */
  readonly username: string;

  /**
   * Twitch user identifier.
   */
  readonly userId: string;

  /**
   * Durable desktop session token used only by the main process.
   */
  readonly desktopSessionToken: string;

  /**
   * Unix epoch milliseconds when this account was persisted.
   */
  readonly savedAt: number;
};

/**
 * Encrypted auth session file schema stored under Electron userData.
 */
type PersistedEncryptedAuthSessions = {
  /**
   * Storage schema version.
   */
  readonly version: 2;

  /**
   * Base64 encoded safeStorage ciphertext.
   */
  readonly encryptedPayload: string;
};

/**
 * Multiaccount durable desktop auth payload encrypted at rest.
 */
type SecureAuthSessionsPayload = {
  /**
   * Saved desktop auth sessions without access tokens.
   */
  readonly accounts: readonly TmcSecureDesktopAuthSession[];

  /**
   * Unix epoch milliseconds when this file was written.
   */
  readonly savedAt: number;
};

type SafeStorageWithAsync = typeof safeStorage & {
  /**
   * Electron async safeStorage availability probe, when present.
   */
  readonly isAsyncEncryptionAvailable?: () => Promise<boolean>;

  /**
   * Electron async safeStorage encryption, when present.
   */
  readonly encryptStringAsync?: (plainText: string) => Promise<Buffer>;

  /**
   * Electron async safeStorage decryption, when present.
   */
  readonly decryptStringAsync?: (
    encrypted: Buffer,
  ) => Promise<Electron.DecryptStringAsyncReturnValue>;
};

/**
 * Persists durable desktop auth sessions encrypted with Electron safeStorage.
 *
 * Access tokens are intentionally excluded from this file. The renderer never
 * receives access tokens or desktop session tokens; only main-process restore
 * calls can use the encrypted desktop session token to obtain fresh access.
 */
export class TmcSecureAuthSessionStore {
  /**
   * Creates the encrypted auth session store.
   */
  constructor(
    private readonly filePath = path.join(
      app.getPath('userData'),
      'tmc-desktop-auth-sessions.json',
    ),
    private readonly legacyAccessTokenFilePath = path.join(
      app.getPath('userData'),
      'tmc-auth-session.json',
    ),
  ) {}

  /**
   * Saves or updates one durable desktop auth session encrypted at rest.
   */
  async saveSession(session: TmcAuthSession): Promise<void> {
    if (!session.desktopSessionToken) {
      throw new Error('Desktop session token is required for durable auth save.');
    }

    const existingSessions = await this.loadSessions();
    const nextSession: TmcSecureDesktopAuthSession = {
      profileId: session.profileId,
      username: session.username,
      userId: session.userId,
      desktopSessionToken: session.desktopSessionToken,
      savedAt: Date.now(),
    };
    const mergedSessions = new Map<string, TmcSecureDesktopAuthSession>();

    for (const existingSession of existingSessions) {
      mergedSessions.set(existingSession.profileId, existingSession);
    }

    mergedSessions.set(nextSession.profileId, nextSession);
    await this.saveSessions(Array.from(mergedSessions.values()));
  }

  /**
   * Loads all durable desktop auth sessions, returning an empty list on failure.
   */
  async loadSessions(): Promise<readonly TmcSecureDesktopAuthSession[]> {
    try {
      const persistedValue = await readPersistedSessions(this.filePath);

      if (!persistedValue) {
        return [];
      }

      const encryptedPayload = Buffer.from(
        persistedValue.encryptedPayload,
        'base64',
      );
      const decryptedPayload = await decryptString(encryptedPayload);
      const sessions = parseSessionsPayload(decryptedPayload.result);

      if (decryptedPayload.shouldReEncrypt) {
        await this.trySaveSessions(sessions);
      }

      return sessions;
    } catch {
      await this.clearSessionsSafely();
      return [];
    }
  }

  /**
   * Finds one durable desktop auth session by profile identifier.
   */
  async findSession(
    profileId: string,
  ): Promise<TmcSecureDesktopAuthSession | null> {
    const normalizedProfileId = readString(profileId);

    if (!normalizedProfileId) {
      return null;
    }

    const sessions = await this.loadSessions();

    return sessions.find((session) => session.profileId === normalizedProfileId) || null;
  }
  /**
   * Removes one durable desktop auth session by profile identifier.
   */
  async deleteSession(profileId: string): Promise<void> {
    const normalizedProfileId = readString(profileId);

    if (!normalizedProfileId) {
      return;
    }

    const sessions = (await this.loadSessions()).filter((session) => {
      return session.profileId !== normalizedProfileId;
    });

    await this.saveSessions(sessions);
  }

  /**
   * Removes one durable desktop auth session by profile identifier.
   */
  async removeAccount(profileId: string): Promise<void> {
    await this.deleteSession(profileId);
  }
  /**
   * Removes all encrypted desktop auth sessions from disk.
   */
  async clearSessions(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Compatibility alias for older callers.
   */
  async clearSession(): Promise<void> {
    await this.clearSessions();
  }

  /**
   * Compatibility shim: old single-account access-token persistence is ignored.
   */
  async loadSession(): Promise<TmcAuthSession | null> {
    await this.clearLegacyAccessTokenSessionSafely();
    return null;
  }

  /**
   * Deletes the legacy single-account access-token file when present.
   */
  async clearLegacyAccessTokenSession(): Promise<void> {
    try {
      await fs.unlink(this.legacyAccessTokenFilePath);
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Returns the local encrypted auth session file path for diagnostics.
   */
  getFilePath(): string {
    return this.filePath;
  }

  private async saveSessions(
    sessions: readonly TmcSecureDesktopAuthSession[],
  ): Promise<void> {
    const payload: SecureAuthSessionsPayload = {
      accounts: normalizeSessions(sessions),
      savedAt: Date.now(),
    };
    const encryptedPayload = await encryptString(JSON.stringify(payload));
    const persistedValue: PersistedEncryptedAuthSessions = {
      version: 2,
      encryptedPayload: encryptedPayload.toString('base64'),
    };

    await writeJsonAtomically(this.filePath, persistedValue);
  }

  private async trySaveSessions(
    sessions: readonly TmcSecureDesktopAuthSession[],
  ): Promise<void> {
    try {
      await this.saveSessions(sessions);
    } catch {
      // Re-encryption is opportunistic; valid restored sessions can stay in memory.
    }
  }

  private async clearSessionsSafely(): Promise<void> {
    try {
      await this.clearSessions();
    } catch {
      // Corrupt or inaccessible persisted auth should not block startup.
    }
  }

  private async clearLegacyAccessTokenSessionSafely(): Promise<void> {
    try {
      await this.clearLegacyAccessTokenSession();
    } catch {
      // Legacy cleanup is best effort and must not block startup.
    }
  }
}

async function readPersistedSessions(
  filePath: string,
): Promise<PersistedEncryptedAuthSessions | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsedValue = JSON.parse(content) as Partial<PersistedEncryptedAuthSessions>;

    if (
      parsedValue.version !== 2 ||
      typeof parsedValue.encryptedPayload !== 'string' ||
      !parsedValue.encryptedPayload.trim()
    ) {
      return null;
    }

    return {
      version: 2,
      encryptedPayload: parsedValue.encryptedPayload,
    };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function writeJsonAtomically(
  filePath: string,
  value: PersistedEncryptedAuthSessions,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const temporaryFilePath = `${filePath}.tmp`;
  const serializedValue = `${JSON.stringify(value, null, 2)}\n`;

  await fs.writeFile(temporaryFilePath, serializedValue, 'utf8');
  await fs.rename(temporaryFilePath, filePath);
}

async function encryptString(plainText: string): Promise<Buffer> {
  const asyncSafeStorage = safeStorage as SafeStorageWithAsync;

  if (
    asyncSafeStorage.isAsyncEncryptionAvailable &&
    asyncSafeStorage.encryptStringAsync &&
    (await asyncSafeStorage.isAsyncEncryptionAvailable())
  ) {
    return asyncSafeStorage.encryptStringAsync(plainText);
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure auth session storage is unavailable.');
  }

  return safeStorage.encryptString(plainText);
}

async function decryptString(
  encrypted: Buffer,
): Promise<Electron.DecryptStringAsyncReturnValue> {
  const asyncSafeStorage = safeStorage as SafeStorageWithAsync;

  if (
    asyncSafeStorage.isAsyncEncryptionAvailable &&
    asyncSafeStorage.decryptStringAsync &&
    (await asyncSafeStorage.isAsyncEncryptionAvailable())
  ) {
    return asyncSafeStorage.decryptStringAsync(encrypted);
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure auth session storage is unavailable.');
  }

  return {
    shouldReEncrypt: false,
    result: safeStorage.decryptString(encrypted),
  };
}

function parseSessionsPayload(
  payloadJson: string,
): readonly TmcSecureDesktopAuthSession[] {
  const payload = JSON.parse(payloadJson) as Partial<SecureAuthSessionsPayload>;

  if (!Array.isArray(payload.accounts)) {
    return [];
  }

  return normalizeSessions(payload.accounts);
}

function normalizeSessions(
  sessions: readonly Partial<TmcSecureDesktopAuthSession>[],
): readonly TmcSecureDesktopAuthSession[] {
  const normalizedSessions = new Map<string, TmcSecureDesktopAuthSession>();

  for (const session of sessions) {
    const normalizedSession = normalizeSession(session);

    if (normalizedSession) {
      normalizedSessions.set(normalizedSession.profileId, normalizedSession);
    }
  }

  return Array.from(normalizedSessions.values()).sort(
    (left, right) => right.savedAt - left.savedAt,
  );
}

function normalizeSession(
  session: Partial<TmcSecureDesktopAuthSession>,
): TmcSecureDesktopAuthSession | null {
  const profileId = readString(session.profileId);
  const username = readString(session.username);
  const userId = readString(session.userId);
  const desktopSessionToken = readString(session.desktopSessionToken);
  const savedAt = Number(session.savedAt);

  if (!profileId || !username || !userId || !desktopSessionToken) {
    return null;
  }

  return {
    profileId,
    username,
    userId,
    desktopSessionToken,
    savedAt: Number.isFinite(savedAt) ? Math.round(savedAt) : Date.now(),
  };
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Node.js error with an optional file-system error code.
 */
type NodeError = Error & {
  /**
   * Node.js error code.
   */
  readonly code?: string;
};

function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error;
}