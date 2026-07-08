/**
 * Request used by the renderer to ask the main process for cached chat history.
 */
export type LoadHistoryRequest = {
  /**
   * Twitch channel name without leading hash when possible.
   */
  readonly channel: string;

  /**
   * Number of seconds of history to request from the backend.
   */
  readonly seconds: number;
};

/**
 * Normalized chat history message returned to the local renderer.
 */
export type TmcHistoryMessage = {
  /**
   * Stable message identifier when available from the backend.
   */
  readonly id: string;

  /**
   * Twitch channel name without leading hash.
   */
  readonly channel: string;

  /**
   * Login or display name of the message author.
   */
  readonly user: string;

  /**
   * Plain chat message text.
   */
  readonly text: string;

  /**
   * Message timestamp in Unix epoch milliseconds.
   */
  readonly timestampMillis: number;

  /**
   * Optional raw Twitch emote metadata, when provided by the backend.
   */
  readonly emotesRaw?: string;
};

/**
 * Result returned after loading chat history from the backend.
 */
export type LoadHistoryResult = {
  /**
   * Channel that was requested.
   */
  readonly channel: string;

  /**
   * Normalized chat messages.
   */
  readonly messages: readonly TmcHistoryMessage[];

  /**
   * Unix epoch milliseconds when the history was loaded.
   */
  readonly loadedAtMillis: number;
};
