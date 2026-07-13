/**
 * Account/channel key used to isolate one PCG web session.
 */
export type TmcPcgSessionKey = {
  /**
   * Twitch profile identifier for the active desktop account.
   */
  readonly profileId: string;

  /**
   * Normalized Twitch channel name without a leading hash.
   */
  readonly channel: string;
};

/**
 * Renderer-safe PCG panel status state.
 */
export type TmcPcgStatusState = 'empty' | 'loading' | 'active' | 'error';

/**
 * Visual placement for the current PCG surface.
 */
export type TmcPcgDisplayMode = 'embedded' | 'detached';

/**
 * Renderer-safe PCG panel status.
 */
export type TmcPcgStatus = {
  /**
   * Current PCG panel lifecycle state.
   */
  readonly state: TmcPcgStatusState;

  /**
   * Whether PCG is currently shown in the embedded panel or a separate window.
   */
  readonly displayMode: TmcPcgDisplayMode;

  /**
   * Profile identifier associated with the current PCG session, when known.
   */
  readonly profileId: string | null;

  /**
   * Channel associated with the current PCG session, when known.
   */
  readonly channel: string | null;

  /**
   * Optional non-sensitive status or error message.
   */
  readonly message: string | null;
};

/**
 * Request used to activate PCG for an explicit or inferred account/channel.
 */
export type TmcPcgActivateRequest = {
  /**
   * Optional profile identifier. When omitted, main uses the active account.
   */
  readonly profileId?: string;

  /**
   * Optional channel. When omitted, main uses the active account last channel.
   */
  readonly channel?: string;
};
/**
 * Renderer-measured bounds for the passive PCG WebContentsView.
 */
export type TmcPcgBoundsRequest = {
  /**
   * X coordinate relative to the BrowserWindow content area.
   */
  readonly x: number;

  /**
   * Y coordinate relative to the BrowserWindow content area.
   */
  readonly y: number;

  /**
   * Width in CSS pixels.
   */
  readonly width: number;

  /**
   * Height in CSS pixels.
   */
  readonly height: number;
};

