/**
 * User-facing desktop settings shared between the main process and renderer.
 */
export type TmcDesktopSettings = {
  /**
   * Currently selected Twitch channel without leading hash.
   */
  readonly currentChannel: string;

  /**
   * Recently used Twitch channels without leading hash.
   */
  readonly recentChannels: readonly string[];
};

/**
 * Request used to update the selected channel.
 */
export type SetCurrentChannelRequest = {
  /**
   * Twitch channel name, with or without leading hash.
   */
  readonly channel: string;
};

/**
 * Default settings used on first launch.
 */
export const DEFAULT_TMC_DESKTOP_SETTINGS: TmcDesktopSettings = {
  currentChannel: 'unouidol',
  recentChannels: ['unouidol', 'lukankuro'],
};
