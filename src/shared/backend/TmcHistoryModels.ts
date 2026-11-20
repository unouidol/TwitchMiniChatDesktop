import type { TmcMessageFragment } from '../chat/TmcMessageContent';
import type { TmcChatAttention } from '../chat/TmcChatAttention';

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
  readonly badges?: readonly import('../chat/TmcChatBadges').TmcChatBadge[];
  readonly attention?: TmcChatAttention;
  readonly color?: string;
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
   * Validated message pieces, when Twitch emote metadata is available.
   */
  readonly fragments?: readonly TmcMessageFragment[];
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
