import type { TmcMessageFragment } from './TmcMessageContent';
import type { TmcChatReply } from './TmcChatReply';
import type { TmcChatAttention } from './TmcChatAttention';

/**
 * Live Twitch chat connection states exposed across process boundaries.
 */
export type TmcChatConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * Renderer-safe status for the live Twitch chat connection.
 */
export type TmcChatLiveStatus = {
  /**
   * Current live chat connection state.
   */
  readonly state: TmcChatConnectionState;

  /**
   * Twitch channel currently associated with the live chat connection.
   */
  readonly channel: string | null;

  /**
   * Human-readable status or error message.
   */
  readonly message: string | null;
};

/**
 * Request to connect the manual desktop chat client to a Twitch channel.
 */
export type TmcConnectLiveChatRequest = {
  /**
   * Twitch channel login name without a leading hash.
   */
  readonly channel: string;
};

/**
 * Request to disconnect the manual desktop chat client.
 */
export type TmcDisconnectLiveChatRequest = {
  /**
   * Optional Twitch channel login name to disconnect.
   */
  readonly channel?: string;
};

/**
 * Request to send one explicit user-authored Twitch chat message.
 */
export type TmcSendChatMessageRequest = {
  readonly profileId: string;
  readonly reply?: TmcChatReply;
  /**
   * Twitch channel login name without a leading hash.
   */
  readonly channel: string;

  /**
   * Message text entered by the user.
   */
  readonly text: string;
};

/**
 * Live Twitch chat message delivered to the local renderer.
 */
export type TmcLiveChatMessage = {
  readonly badges?: readonly import('./TmcChatBadges').TmcChatBadge[];
  readonly attention?: TmcChatAttention;
  readonly color?: string;
  readonly reply?: TmcChatReply;
  readonly fragments?: readonly TmcMessageFragment[];
  /**
   * Stable message identifier for renderer-side de-duplication.
   */
  readonly id: string;

  /**
   * Twitch channel login name without a leading hash.
   */
  readonly channel: string;

  /**
   * Message timestamp in Unix epoch milliseconds.
   */
  readonly timestampMs: number;

  /**
   * Twitch login name of the sender.
   */
  readonly username: string;

  /**
   * Display name of the sender as shown in chat.
   */
  readonly displayName: string;

  /**
   * Plain chat message text.
   */
  readonly text: string;

  /**
   * Whether this message was sent by the authenticated desktop user.
   */
  readonly isSelf: boolean;
};
