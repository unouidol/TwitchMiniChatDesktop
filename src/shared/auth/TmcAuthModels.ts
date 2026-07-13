/**
 * Current authentication status exposed to the local renderer.
 */
export type TmcAuthStatus = {
  /**
   * True when the desktop app has an active Twitch session.
   */
  readonly isLoggedIn: boolean;

  /**
   * Alias for `isLoggedIn` shared with older UI consumers.
   */
  readonly loggedIn?: boolean;

  /**
   * Optional Twitch profile identifier used by the TMC backend.
   */
  readonly profileId?: string;

  /**
   * Optional Twitch login name.
   */
  readonly login?: string;

  /**
   * Optional Twitch login name as a more explicit field.
   */
  readonly username?: string;

  /**
   * Optional Twitch user identifier.
   */
  readonly userId?: string;

  /**
   * Short user-facing status message.
   */
  readonly message: string;
};

/**
 * Request used to start the Twitch login flow.
 */
export type StartTwitchLoginRequest = {
  /**
   * Optional source label for diagnostics.
   */
  readonly source?: string;
};

/**
 * Result returned after opening the external Twitch login flow.
 */
export type StartTwitchLoginResult = {
  /**
   * True when the external browser flow was opened.
   */
  readonly started: boolean;

  /**
   * Public URL opened in the external browser.
   */
  readonly authUrl: string;

  /**
   * Short user-facing status message.
   */
  readonly message: string;
};

/**
 * Request used to finalize the Twitch OAuth login token.
 */
export type FinalizeTwitchLoginRequest = {
  /**
   * One-time desktop login token received from the broker callback.
   */
  readonly loginToken: string;
};

/**
 * Result returned after finalizing a desktop OAuth login token.
 */
export type FinalizeTwitchLoginResult = {
  /**
   * True when the login token was finalized successfully.
   */
  readonly success: boolean;

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
   * Short user-facing status message.
   */
  readonly message: string;
};
