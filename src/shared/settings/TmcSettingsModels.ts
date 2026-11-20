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
  readonly chatAppearance: TmcChatAppearance;
};

export type TmcChatAppearance = {
  readonly fontSize: 14 | 16 | 18 | 20;
  readonly density: 'comfortable' | 'compact';
  readonly showTimestamps: boolean;
};

export const DEFAULT_CHAT_APPEARANCE: TmcChatAppearance = { fontSize: 16, density: 'comfortable', showTimestamps: true };

export function isChatAppearance(value: unknown): value is TmcChatAppearance {
  return validAppearanceBase(value) && 'showTimestamps' in value && typeof value.showTimestamps === 'boolean';
}

function validAppearanceBase(value: unknown): value is { fontSize: TmcChatAppearance['fontSize']; density: TmcChatAppearance['density'] } {
  return !!value && typeof value === 'object' && 'fontSize' in value &&
    [14, 16, 18, 20].some((size) => size === value.fontSize) && 'density' in value &&
    (value.density === 'comfortable' || value.density === 'compact');
}

/** Older saved appearance values retain their font and spacing choices. */
export function readChatAppearance(value: unknown): TmcChatAppearance {
  if (!validAppearanceBase(value)) return DEFAULT_CHAT_APPEARANCE;
  return { fontSize: value.fontSize, density: value.density,
    showTimestamps: 'showTimestamps' in value && typeof value.showTimestamps === 'boolean' ? value.showTimestamps : true };
}

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
  chatAppearance: DEFAULT_CHAT_APPEARANCE,
};
