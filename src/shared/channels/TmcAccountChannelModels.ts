/**
 * Per-account channel state stored without secrets.
 */
export type TmcAccountChannelState = {
  /**
   * Twitch profile identifier or a local guest profile key.
   */
  readonly profileId: string;

  /**
   * Last selected Twitch channel for this account.
   */
  readonly lastChannel: string | null;

  /**
   * Favorite Twitch channels for this account.
   */
  readonly favoriteChannels: readonly string[];

  /**
   * Recent Twitch channels for this account, newest first.
   */
  readonly recentChannels: readonly string[];

  /**
   * Unix epoch milliseconds when this state was last updated.
   */
  readonly updatedAt: number;
};

/**
 * Result returned for the active account channel state.
 */
export type TmcActiveAccountChannelStateResult = {
  /**
   * Channel state for the active account or guest profile.
   */
  readonly state: TmcAccountChannelState;
};

/**
 * Request used to set the last selected channel.
 */
export type TmcSetLastChannelRequest = {
  /**
   * Twitch channel name, with or without a leading hash.
   */
  readonly channel: string;
};

/**
 * Request used to toggle a favorite channel.
 */
export type TmcToggleFavoriteChannelRequest = {
  /**
   * Twitch channel name, with or without a leading hash.
   */
  readonly channel: string;
};