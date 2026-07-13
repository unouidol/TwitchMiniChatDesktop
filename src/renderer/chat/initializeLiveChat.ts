import type {
  TmcChatLiveStatus,
  TmcLiveChatMessage,
} from '../../shared/chat/TmcChatModels';
import type { TmcRendererPreloadApi } from '../TmcRendererPreloadApi';
import { appendLocalMessage } from './appendLocalMessage';

export const TMC_AUTH_FINALIZED_EVENT = 'tmc-auth-finalized';

/**
 * Maximum number of live message deduplication keys retained in memory.
 */
const MAX_LIVE_MESSAGE_DEDUP_KEYS = 1000;

/**
 * Time bucket used to match local self echoes with possible IRC self echoes.
 */
const LIVE_MESSAGE_DEDUP_BUCKET_MS = 10000;

export type TmcLiveChatConnectOptions = {
  /**
   * Message shown when live chat cannot connect because login is missing.
   */
  readonly loginRequiredMessage?: string;

  /**
   * Prefix used for non-login live chat connection failures.
   */
  readonly failurePrefix?: string;
};

export type TmcLiveChatController = {
  /**
   * Connects live chat for the current channel input value.
   */
  readonly connectSelectedChannel: (
    options?: TmcLiveChatConnectOptions,
  ) => Promise<void>;

  /**
   * Connects live chat for a specific channel.
   */
  readonly connectChannel: (
    channel: string,
    options?: TmcLiveChatConnectOptions,
  ) => Promise<void>;

  /**
   * Removes live chat event subscriptions.
   */
  readonly dispose: () => void;
};

/**
 * Wires passive live Twitch chat reception into the existing chat list.
 */
export function initializeLiveChat(
  channelInput: HTMLInputElement | null,
  tmc: TmcRendererPreloadApi = window.tmc,
): TmcLiveChatController {
  let lastRenderedStatusKey: string | null = null;
  const renderedMessageKeys: string[] = [];
  const renderedMessageKeySet = new Set<string>();

  const connectSelectedChannel = async (
    options: TmcLiveChatConnectOptions = {},
  ): Promise<void> => {
    const channel = readSelectedChannel(channelInput);

    if (!channel) {
      return;
    }

    await connectChannel(channel, options);
  };

  const connectChannel = async (
    channel: string,
    options: TmcLiveChatConnectOptions = {},
  ): Promise<void> => {
    const normalizedChannel = normalizeChannel(channel);

    if (!normalizedChannel) {
      return;
    }

    try {
      await ensureReadyForChannel(tmc, normalizedChannel);
      await tmc.chat.connectLive({ channel: normalizedChannel });
    } catch (error) {
      appendLiveChatConnectionError(error, options);
    }
  };

  const unsubscribeLiveMessage = tmc.chat.onLiveMessage((message) => {
    if (!rememberLiveMessage(message, renderedMessageKeySet, renderedMessageKeys)) {
      return;
    }

    appendLiveChatMessage(message);
  });

  const unsubscribeStatusChanged = tmc.chat.onStatusChanged((status) => {
    const statusKey = `${status.state}:${status.channel || ''}:${status.message || ''}`;

    if (statusKey === lastRenderedStatusKey) {
      return;
    }

    lastRenderedStatusKey = statusKey;
    appendLiveChatStatus(status);
  });

  const handleAuthFinalized = (): void => {
    void connectSelectedChannel({
      failurePrefix: 'Live chat connection failed',
    });
  };

  window.addEventListener(TMC_AUTH_FINALIZED_EVENT, handleAuthFinalized);

  return {
    connectSelectedChannel,
    connectChannel,
    dispose: (): void => {
      unsubscribeLiveMessage();
      unsubscribeStatusChanged();
      window.removeEventListener(TMC_AUTH_FINALIZED_EVENT, handleAuthFinalized);
    },
  };
}

/**
 * Announces that authentication finalized so live chat can connect if possible.
 */
export function notifyAuthFinalized(): void {
  window.dispatchEvent(new CustomEvent(TMC_AUTH_FINALIZED_EVENT));
}

async function ensureReadyForChannel(
  tmc: TmcRendererPreloadApi,
  channel: string,
): Promise<void> {
  const status = await tmc.chat.getStatus();
  const connectedChannel = status.channel ? normalizeChannel(status.channel) : null;

  if (
    connectedChannel === channel &&
    (status.state === 'connected' || status.state === 'connecting')
  ) {
    return Promise.reject(new LiveChatAlreadyConnectedError());
  }

  if (status.state === 'connected' || status.state === 'connecting') {
    await tmc.chat.disconnectLive({ channel: status.channel || undefined });
  }
}

function appendLiveChatMessage(message: TmcLiveChatMessage): void {
  const chatList = document.querySelector<HTMLDivElement>('#chatList');

  if (!chatList) {
    return;
  }

  const messageElement = document.createElement('article');
  messageElement.className = 'tmc-message';
  messageElement.dataset.tmcMessageId = message.id;

  if (message.isSelf) {
    messageElement.classList.add('tmc-message-self');
    messageElement.dataset.tmcMessageSelf = 'true';
  }

  const timeElement = document.createElement('time');
  timeElement.className = 'tmc-message-time';
  timeElement.dateTime = new Date(message.timestampMs).toISOString();
  timeElement.textContent = formatTime(message.timestampMs);

  const authorElement = document.createElement('strong');
  authorElement.textContent = message.displayName || message.username;

  const textElement = document.createElement('span');
  textElement.textContent = message.text;

  messageElement.append(timeElement, authorElement, textElement);
  chatList.appendChild(messageElement);
  chatList.scrollTop = chatList.scrollHeight;
}

/**
 * Remembers a live message and rejects duplicates before rendering.
 */
function rememberLiveMessage(
  message: TmcLiveChatMessage,
  renderedMessageKeySet: Set<string>,
  renderedMessageKeys: string[],
): boolean {
  const primaryKey = buildPrimaryLiveMessageKey(message);
  const selfEchoKey = buildSelfEchoDedupKey(message);
  const isLocalSelfMessage = message.isSelf && message.id.startsWith('local-self-');

  if (renderedMessageKeySet.has(primaryKey)) {
    return false;
  }

  if (selfEchoKey && !isLocalSelfMessage && renderedMessageKeySet.has(selfEchoKey)) {
    return false;
  }

  rememberLiveMessageKey(primaryKey, renderedMessageKeySet, renderedMessageKeys);

  if (selfEchoKey && isLocalSelfMessage) {
    rememberLiveMessageKey(selfEchoKey, renderedMessageKeySet, renderedMessageKeys);
  }

  return true;
}

/**
 * Builds the primary deduplication key, preferring Twitch IRC message IDs.
 */
function buildPrimaryLiveMessageKey(message: TmcLiveChatMessage): string {
  if (message.id) {
    return `id:${message.id}`;
  }

  return `message:${buildLiveMessageContentKey(message)}`;
}

/**
 * Builds a content key used to suppress Twitch echoes of local self messages.
 */
function buildSelfEchoDedupKey(message: TmcLiveChatMessage): string | null {
  if (!message.isSelf) {
    return null;
  }

  return `self:${buildLiveMessageContentKey(message)}`;
}

function buildLiveMessageContentKey(message: TmcLiveChatMessage): string {
  const bucket = Math.floor(message.timestampMs / LIVE_MESSAGE_DEDUP_BUCKET_MS);
  const channel = normalizeChannel(message.channel);
  const username = message.username.trim().toLowerCase();

  return `${channel}:${bucket}:${username}:${message.text}`;
}

function rememberLiveMessageKey(
  key: string,
  renderedMessageKeySet: Set<string>,
  renderedMessageKeys: string[],
): void {
  renderedMessageKeySet.add(key);
  renderedMessageKeys.push(key);

  while (renderedMessageKeys.length > MAX_LIVE_MESSAGE_DEDUP_KEYS) {
    const oldestKey = renderedMessageKeys.shift();

    if (oldestKey) {
      renderedMessageKeySet.delete(oldestKey);
    }
  }
}
function appendLiveChatStatus(status: TmcChatLiveStatus): void {
  if (!status.message) {
    return;
  }

  if (status.state !== 'connected' && status.state !== 'disconnected' && status.state !== 'error') {
    return;
  }

  appendLocalMessage('system', status.message);
}

function appendLiveChatConnectionError(
  error: unknown,
  options: TmcLiveChatConnectOptions,
): void {
  if (error instanceof LiveChatAlreadyConnectedError) {
    return;
  }

  const message = getErrorMessage(error);

  if (message === 'Login required.') {
    appendLocalMessage(
      'system',
      options.loginRequiredMessage || 'Login required for live chat.',
    );
    return;
  }

  appendLocalMessage(
    'system',
    `${options.failurePrefix || 'Live chat connection failed'}: ${message}`,
  );
}

function readSelectedChannel(channelInput: HTMLInputElement | null): string | null {
  if (!channelInput) {
    return null;
  }

  return normalizeChannel(channelInput.value);
}

function normalizeChannel(channel: string): string {
  return channel.trim().replace(/^#/, '').toLowerCase();
}

function formatTime(timestampMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown live chat error.';
}

class LiveChatAlreadyConnectedError extends Error {
  constructor() {
    super('Live chat is already connected to this channel.');
  }
}
