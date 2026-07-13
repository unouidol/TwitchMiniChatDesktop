import type { TmcAuthStatus } from '../../shared/auth/TmcAuthModels';

/**
 * In-memory Twitch OAuth session used by main-process features.
 *
 * Encrypted persistence, when available, is handled by TmcSecureAuthSessionStore.
 */
export type TmcAuthSession = {
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
   * Short-lived Twitch access token returned by the backend.
   */
  readonly accessToken: string;

  /**
   * Durable desktop session token kept only in the main process.
   */
  readonly desktopSessionToken?: string;
};

/**
 * Stores the current authentication session in memory.
 */
export class TmcAuthSessionStore {
  private currentSession: TmcAuthSession | null = null;

  /**
   * Saves the current session in memory.
   */
  setSession(session: TmcAuthSession): void {
    this.currentSession = session;
  }

  /**
   * Returns the current in-memory session.
   */
  getSession(): TmcAuthSession | null {
    return this.currentSession;
  }

  /**
   * Clears the current in-memory session.
   */
  clearSession(): void {
    this.currentSession = null;
  }

  /**
   * Returns a renderer-safe authentication status.
   */
  getStatus(): TmcAuthStatus {
    if (!this.currentSession) {
      return {
        isLoggedIn: false,
        message: 'Not logged in.',
      };
    }

    return {
      isLoggedIn: true,
      loggedIn: true,
      profileId: this.currentSession.profileId,
      login: this.currentSession.username,
      username: this.currentSession.username,
      userId: this.currentSession.userId,
      message: `Logged in as ${this.currentSession.username}.`,
    };
  }
}