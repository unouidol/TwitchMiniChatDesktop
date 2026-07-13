/**
 * Renderer-safe Twitch account summary.
 */
export type TmcAccountSummary = {
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
   * True when this account is the active desktop account.
   */
  readonly isActive: boolean;

  /**
   * Unix epoch milliseconds when this account was last saved.
   */
  readonly savedAt: number;
};

/**
 * Renderer-safe account list result.
 */
export type TmcAccountListResult = {
  /**
   * Saved accounts without OAuth access tokens.
   */
  readonly accounts: readonly TmcAccountSummary[];

  /**
   * Profile identifier of the active account, when one is selected.
   */
  readonly activeProfileId: string | null;

  /**
   * Active account summary, when one is selected.
   */
  readonly activeAccount: TmcAccountSummary | null;
};

/**
 * Request used to set the active desktop account.
 */
export type TmcSetActiveAccountRequest = {
  /**
   * Twitch profile identifier of the account to activate.
   */
  readonly profileId: string;
};

/**
 * Request used to forget a desktop account on this device only.
 */
export type TmcRemoveLocalAccountRequest = {
  /**
   * Twitch profile identifier of the account to remove locally.
   */
  readonly profileId: string;
};
/**
 * Renderer-safe active account result.
 */
export type TmcActiveAccountResult = {
  /**
   * True when an active account is available in the main process.
   */
  readonly isLoggedIn: boolean;

  /**
   * Alias for isLoggedIn used by existing renderer code.
   */
  readonly loggedIn: boolean;

  /**
   * Profile identifier of the active account, when one is selected.
   */
  readonly activeProfileId: string | null;

  /**
   * Active account summary, when one is selected.
   */
  readonly activeAccount: TmcAccountSummary | null;

  /**
   * Short user-facing status message.
   */
  readonly message: string;
};