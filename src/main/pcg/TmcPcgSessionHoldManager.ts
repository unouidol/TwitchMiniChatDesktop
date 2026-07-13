import type {
  TmcPcgSessionKey,
  TmcPcgSessionStatus,
} from '../../shared/pcg/TmcPcgSessionModels';

/**
 * Default grace window before a hidden PCG session is destroyed.
 */
export const TMC_PCG_DEFAULT_HOLD_GRACE_MS = 5 * 60 * 1000;

/**
 * Default cap for hidden PCG sessions retained at the same time.
 */
export const TMC_PCG_DEFAULT_MAX_HELD_SESSIONS = 3;

type TmcPcgSessionRecord = {
  readonly key: TmcPcgSessionKey;
  readonly sessionKey: string;
  readonly partition: string;
  readonly createdAt: number;
  updatedAt: number;
  heldAt: number | null;
  expiresAt: number | null;
  destroy: (() => void) | null;
};

export type TmcPcgSessionHoldManagerOptions = {
  readonly holdGraceMs?: number;
  readonly maxHeldSessions?: number;
};

/**
 * Holds PCG sessions by profile/channel instead of destroying them immediately.
 *
 * The current project only has a PCG placeholder in the renderer. When a real
 * BrowserView, WebContentsView, BrowserWindow, or webview-backed PCG panel is
 * added, its hide/detach and dispose callbacks should be wired into this
 * manager so held sessions remain alive until the grace window expires.
 */
export class TmcPcgSessionHoldManager {
  private readonly holdGraceMs: number;
  private readonly maxHeldSessions: number;
  private readonly heldSessions = new Map<string, TmcPcgSessionRecord>();
  private activeSession: TmcPcgSessionRecord | null = null;
  private lastExpiredSession: TmcPcgSessionKey | null = null;
  private expirationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: TmcPcgSessionHoldManagerOptions = {}) {
    this.holdGraceMs = options.holdGraceMs || TMC_PCG_DEFAULT_HOLD_GRACE_MS;
    this.maxHeldSessions =
      options.maxHeldSessions || TMC_PCG_DEFAULT_MAX_HELD_SESSIONS;
  }

  /**
   * Builds the stable manager key from profileId and normalized channel.
   */
  buildSessionKey(profileId: string, channel: string): string {
    const key = this.normalizeSessionKey(profileId, channel);

    return `${key.profileId}:${key.channel}`;
  }

  /**
   * Activates an existing held session or creates metadata for a new one.
   */
  activateSession(profileId: string, channel: string): TmcPcgSessionStatus {
    this.expireOldSessions();

    const key = this.normalizeSessionKey(profileId, channel);
    const sessionKey = this.buildSessionKey(key.profileId, key.channel);

    if (this.activeSession?.sessionKey === sessionKey) {
      this.activeSession.updatedAt = Date.now();
      return this.getStatus(`PCG active for #${key.channel}.`);
    }

    this.holdActiveSession();

    const heldSession = this.heldSessions.get(sessionKey);

    if (heldSession) {
      this.heldSessions.delete(sessionKey);
      this.activeSession = {
        ...heldSession,
        updatedAt: Date.now(),
        heldAt: null,
        expiresAt: null,
      };

      return this.getStatus(`PCG restored for #${key.channel}.`);
    }

    this.activeSession = this.createSessionRecord(key);

    return this.getStatus(`PCG active for #${key.channel}.`);
  }

  /**
   * Moves the current visible session into the grace window.
   */
  holdActiveSession(): TmcPcgSessionStatus {
    this.expireOldSessions();

    if (!this.activeSession) {
      return this.getStatus('No active PCG session to hold.');
    }

    const now = Date.now();
    const heldSession: TmcPcgSessionRecord = {
      ...this.activeSession,
      updatedAt: now,
      heldAt: now,
      expiresAt: now + this.holdGraceMs,
    };

    // Future PCG probe/snapshot handlers must treat held sessions as stale:
    // only the active session key may update inventory/Dex-like state.
    this.heldSessions.set(heldSession.sessionKey, heldSession);
    this.activeSession = null;
    this.enforceMaxHeldSessions();

    return this.getStatus(`PCG held for #${heldSession.key.channel}.`);
  }

  /**
   * Restores a held session without creating a new one.
   */
  restoreHeldSession(profileId: string, channel: string): TmcPcgSessionStatus {
    this.expireOldSessions();

    const sessionKey = this.buildSessionKey(profileId, channel);
    const heldSession = this.heldSessions.get(sessionKey);

    if (!heldSession) {
      return this.getStatus('No held PCG session exists for this channel.');
    }

    this.holdActiveSession();
    this.heldSessions.delete(sessionKey);
    this.activeSession = {
      ...heldSession,
      updatedAt: Date.now(),
      heldAt: null,
      expiresAt: null,
    };

    return this.getStatus(`PCG restored for #${this.activeSession.key.channel}.`);
  }

  /**
   * Expires hidden sessions whose grace window has elapsed.
   */
  expireOldSessions(now = Date.now()): void {
    for (const [sessionKey, session] of this.heldSessions) {
      if (session.expiresAt !== null && session.expiresAt <= now) {
        this.destroySession(session);
        this.heldSessions.delete(sessionKey);
      }
    }

    this.scheduleExpirationCheck(now);
  }

  /**
   * Drops oldest held sessions when the hidden-session cap is exceeded.
   */
  enforceMaxHeldSessions(): void {
    while (this.heldSessions.size > this.maxHeldSessions) {
      const oldestSession = Array.from(this.heldSessions.values()).sort(
        (left, right) => (left.heldAt || 0) - (right.heldAt || 0),
      )[0];

      if (!oldestSession) {
        return;
      }

      this.destroySession(oldestSession);
      this.heldSessions.delete(oldestSession.sessionKey);
    }
  }

  /**
   * Returns renderer-safe status after pruning expired hidden sessions.
   */
  getStatus(message: string | null = null): TmcPcgSessionStatus {
    this.expireOldSessions();

    if (this.activeSession) {
      return {
        state: 'active',
        profileId: this.activeSession.key.profileId,
        channel: this.activeSession.key.channel,
        heldCount: this.heldSessions.size,
        message,
      };
    }

    if (this.heldSessions.size > 0) {
      const newestHeldSession = Array.from(this.heldSessions.values()).sort(
        (left, right) => right.updatedAt - left.updatedAt,
      )[0];

      return {
        state: 'held',
        profileId: newestHeldSession?.key.profileId || null,
        channel: newestHeldSession?.key.channel || null,
        heldCount: this.heldSessions.size,
        message,
      };
    }

    if (this.lastExpiredSession) {
      return {
        state: 'expired',
        profileId: this.lastExpiredSession.profileId,
        channel: this.lastExpiredSession.channel,
        heldCount: 0,
        message: message || 'Last held PCG session expired.',
      };
    }

    return {
      state: 'empty',
      profileId: null,
      channel: null,
      heldCount: 0,
      message,
    };
  }

  /**
   * True only when a probe/snapshot belongs to the visible active session.
   */
  isActiveSession(profileId: string, channel: string): boolean {
    return (
      this.activeSession?.sessionKey === this.buildSessionKey(profileId, channel)
    );
  }

  private createSessionRecord(key: TmcPcgSessionKey): TmcPcgSessionRecord {
    const now = Date.now();

    return {
      key,
      sessionKey: this.buildSessionKey(key.profileId, key.channel),
      partition: buildPcgPartition(key.profileId),
      createdAt: now,
      updatedAt: now,
      heldAt: null,
      expiresAt: null,
      destroy: null,
    };
  }

  private normalizeSessionKey(profileId: string, channel: string): TmcPcgSessionKey {
    const normalizedProfileId = profileId.trim();
    const normalizedChannel = normalizeChannel(channel);

    if (!normalizedProfileId) {
      throw new Error('PCG profileId cannot be empty.');
    }

    if (!normalizedChannel) {
      throw new Error('PCG channel cannot be empty.');
    }

    return {
      profileId: normalizedProfileId,
      channel: normalizedChannel,
    };
  }

  private scheduleExpirationCheck(now = Date.now()): void {
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }

    const nextExpiresAt = Array.from(this.heldSessions.values()).reduce<number | null>(
      (nextExpiration, session) => {
        if (session.expiresAt === null) {
          return nextExpiration;
        }

        return nextExpiration === null
          ? session.expiresAt
          : Math.min(nextExpiration, session.expiresAt);
      },
      null,
    );

    if (nextExpiresAt === null) {
      return;
    }

    this.expirationTimer = setTimeout(() => {
      this.expirationTimer = null;
      this.expireOldSessions();
    }, Math.max(0, nextExpiresAt - now));
  }

  private destroySession(session: TmcPcgSessionRecord): void {
    this.lastExpiredSession = session.key;
    session.destroy?.();
  }
}

/**
 * Prepares account-isolated persistent web storage for future PCG web sessions.
 */
export function buildPcgPartition(profileId: string): string {
  const safeProfileId = profileId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');

  return `persist:tmc-pcg-${safeProfileId || 'guest'}`;
}

function normalizeChannel(channel: string): string {
  return channel.trim().replace(/^#/, '').toLowerCase();
}
