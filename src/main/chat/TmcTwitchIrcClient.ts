import type {
  TmcChatConnectionState,
  TmcChatLiveStatus,
  TmcLiveChatMessage,
} from '../../shared/chat/TmcChatModels';

/**
 * Parameters required to connect to Twitch IRC over WebSocket.
 */
export type TmcTwitchIrcConnectParams = {
  /**
   * Twitch channel login name with or without a leading hash.
   */
  readonly channel: string;

  /**
   * Authenticated Twitch login name.
   */
  readonly username: string;

  /**
   * Twitch OAuth access token kept only in the main process.
   */
  readonly accessToken: string;
};

/**
 * Optional callbacks emitted by the Twitch IRC client.
 */
export type TmcTwitchIrcClientCallbacks = {
  /**
   * Receives parsed live Twitch chat messages.
   */
  readonly onMessage?: (message: TmcLiveChatMessage) => void;

  /**
   * Receives connection status changes.
   */
  readonly onStatusChanged?: (status: TmcChatLiveStatus) => void;
};

type ParsedIrcLine = {
  readonly tags: Readonly<Record<string, string>>;
  readonly prefix: string | null;
  readonly command: string;
  readonly params: readonly string[];
  readonly trailing: string | null;
};

const TWITCH_IRC_WEBSOCKET_URL = 'wss://irc-ws.chat.twitch.tv:443';

/**
 * Main-process Twitch IRC WebSocket client for manual live chat features.
 *
 * This client does not reconnect, retry, or queue gameplay commands. It only
 * sends explicit user-authored chat messages and keeps OAuth tokens inside the
 * Electron main process.
 */
export class TmcTwitchIrcClient {
  /**
   * Receives parsed live Twitch chat messages.
   */
  onMessage?: (message: TmcLiveChatMessage) => void;

  /**
   * Receives connection status changes.
   */
  onStatusChanged?: (status: TmcChatLiveStatus) => void;

  private socket: WebSocket | null = null;
  private channel: string | null = null;
  private username: string | null = null;
  private messageSequence = 0;
  private status: TmcChatLiveStatus = {
    state: 'disconnected',
    channel: null,
    message: null,
  };

  /**
   * Creates a Twitch IRC client.
   */
  constructor(callbacks: TmcTwitchIrcClientCallbacks = {}) {
    this.onMessage = callbacks.onMessage;
    this.onStatusChanged = callbacks.onStatusChanged;
  }

  /**
   * Opens a Twitch IRC WebSocket connection and sends the IRC handshake.
   */
  connect(params: TmcTwitchIrcConnectParams): void {
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not available in this runtime.');
    }

    if (this.status.state === 'connecting' || this.status.state === 'connected') {
      throw new Error('Twitch chat is already connected or connecting.');
    }

    const channel = normalizeChannel(params.channel);
    const username = normalizeUsername(params.username);
    const accessToken = normalizeAccessToken(params.accessToken);

    this.closeCurrentSocket();
    this.channel = channel;
    this.username = username;
    this.updateStatus('connecting', channel, `Connecting to #${channel}...`);

    const socket = new WebSocket(TWITCH_IRC_WEBSOCKET_URL);
    this.socket = socket;

    socket.onopen = (): void => {
      if (this.socket !== socket) {
        return;
      }

      try {
        this.sendIrcLine('CAP REQ :twitch.tv/tags twitch.tv/commands');
        this.sendIrcLine(`PASS oauth:${accessToken}`);
        this.sendIrcLine(`NICK ${username}`);
        this.sendIrcLine(`JOIN #${channel}`);
        this.updateStatus('connected', channel, `Connected to #${channel}.`);
      } catch {
        this.updateStatus('error', channel, 'Twitch chat handshake failed.');
        this.closeCurrentSocket();
      } finally {
        socket.onopen = null;
      }
    };

    socket.onmessage = (event: MessageEvent): void => {
      if (this.socket !== socket) {
        return;
      }

      this.handleSocketMessage(event.data as unknown);
    };

    socket.onerror = (): void => {
      if (this.socket !== socket) {
        return;
      }

      this.updateStatus('error', channel, 'Twitch chat connection error.');
    };

    socket.onclose = (): void => {
      if (this.socket !== socket) {
        return;
      }

      this.socket = null;

      if (this.status.state === 'error') {
        return;
      }

      this.channel = null;
      this.username = null;
      this.updateStatus('disconnected', null, `Disconnected from #${channel}.`);
    };
  }

  /**
   * Closes the current Twitch IRC connection.
   */
  disconnect(): void {
    const channel = this.channel;
    const message = channel
      ? `Disconnected from #${channel}.`
      : 'Disconnected from Twitch chat.';

    this.closeCurrentSocket();
    this.channel = null;
    this.username = null;
    this.updateStatus('disconnected', null, message);
  }

  /**
   * Sends one explicit user-authored chat message to Twitch IRC.
   */
  sendMessage(channel: string, text: string): TmcLiveChatMessage {
    const normalizedChannel = normalizeChannel(channel);
    const normalizedText = normalizeChatText(text);
    const socket = this.socket;
    const username = this.username;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Twitch chat is not connected.');
    }

    if (this.status.state !== 'connected' || !username) {
      throw new Error('Twitch chat is not connected.');
    }

    this.sendIrcLine(`PRIVMSG #${normalizedChannel} :${normalizedText}`);

    return createLocalSelfMessage(normalizedChannel, normalizedText, username);
  }

  /**
   * Returns the normalized IRC username for the current connection.
   */
  getConnectedUsername(): string | null {
    return this.username;
  }

  /**
   * Returns the current renderer-safe connection status.
   */
  getStatus(): TmcChatLiveStatus {
    return { ...this.status };
  }

  private handleSocketMessage(rawData: unknown): void {
    if (typeof rawData !== 'string') {
      return;
    }

    const lines = rawData.split(/\r?\n/).filter((line) => line.trim().length > 0);

    for (const line of lines) {
      this.handleIrcLine(line);
    }
  }

  private handleIrcLine(rawLine: string): void {
    const parsedLine = parseIrcLine(rawLine);

    if (!parsedLine) {
      return;
    }

    if (parsedLine.command === 'PING') {
      this.sendPong(parsedLine.trailing || parsedLine.params[0] || 'tmi.twitch.tv');
      return;
    }

    if (parsedLine.command === 'NOTICE') {
      this.handleNotice(parsedLine);
      return;
    }

    if (parsedLine.command !== 'PRIVMSG') {
      return;
    }

    const message = this.parsePrivMsg(parsedLine);

    if (message) {
      this.onMessage?.(message);
    }
  }

  private handleNotice(parsedLine: ParsedIrcLine): void {
    const noticeText = parsedLine.trailing || 'Twitch chat notice.';
    const noticeCode = parsedLine.tags['msg-id'];

    if (
      noticeCode === 'login_authentication_failed' ||
      noticeText.toLowerCase().includes('login authentication failed')
    ) {
      this.updateStatus('error', this.channel, 'Twitch chat authentication failed.');
      this.closeCurrentSocket();
      return;
    }

    if (this.status.state !== 'error') {
      this.updateStatus(this.status.state, this.channel, noticeText);
    }
  }

  private parsePrivMsg(parsedLine: ParsedIrcLine): TmcLiveChatMessage | null {
    const rawChannel = parsedLine.params[0];
    const text = parsedLine.trailing;

    if (!rawChannel || text === null) {
      return null;
    }

    const channel = normalizeChannel(rawChannel);
    const username = readUsernameFromPrefix(parsedLine.prefix);

    if (!username) {
      return null;
    }

    const displayName = parsedLine.tags['display-name'] || username;
    const timestampMs = readTimestampMs(parsedLine.tags['tmi-sent-ts']);
    const id =
      parsedLine.tags.id || `${channel}-${timestampMs}-${this.messageSequence++}`;
    const selfUsername = this.username?.toLowerCase() || '';

    return {
      id,
      channel,
      timestampMs,
      username,
      displayName,
      text,
      isSelf: username.toLowerCase() === selfUsername,
    };
  }

  private sendPong(target: string): void {
    this.sendIrcLine(`PONG :${target}`);
  }

  private sendIrcLine(line: string): void {
    const socket = this.socket;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Twitch chat socket is not open.');
    }

    socket.send(`${line}\r\n`);
  }

  private updateStatus(
    state: TmcChatConnectionState,
    channel: string | null,
    message: string | null,
  ): void {
    this.status = {
      state,
      channel,
      message,
    };

    this.onStatusChanged?.(this.getStatus());
  }

  private closeCurrentSocket(): void {
    const socket = this.socket;

    this.socket = null;

    if (!socket) {
      return;
    }

    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  }
}

/**
 * Normalizes a Twitch channel login name.
 */
function normalizeChannel(channel: string): string {
  const normalized = channel.trim().replace(/^#/, '').toLowerCase();

  if (!normalized) {
    throw new Error('Channel cannot be empty.');
  }

  return normalized;
}

/**
 * Normalizes an authenticated Twitch login name for IRC NICK.
 */
function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();

  if (!normalized) {
    throw new Error('Username cannot be empty.');
  }

  return normalized;
}

/**
 * Validates the OAuth access token without logging or storing it.
 */
function normalizeAccessToken(accessToken: string): string {
  const normalized = accessToken.trim();

  if (!normalized) {
    throw new Error('Access token cannot be empty.');
  }

  return normalized.replace(/^oauth:/i, '');
}

/**
 * Normalizes a user-authored chat message into one IRC line payload.
 */
function normalizeChatText(text: string): string {
  const normalized = text.trim();

  if (!normalized) {
    throw new Error('Chat message cannot be empty.');
  }

  if (/[\r\n]/.test(normalized)) {
    throw new Error('Chat message must be one line.');
  }

  return normalized;
}

/**
 * Creates a renderer-safe local echo after a manual PRIVMSG is sent.
 */
function createLocalSelfMessage(
  channel: string,
  text: string,
  username: string,
): TmcLiveChatMessage {
  const timestampMs = Date.now();

  return {
    id: `local-self-${timestampMs}-${Math.random().toString(36).slice(2, 10)}`,
    channel,
    timestampMs,
    username,
    displayName: username,
    text,
    isSelf: true,
  };
}
/**
 * Parses one raw IRC line into command, params, tags, and trailing text.
 */
function parseIrcLine(rawLine: string): ParsedIrcLine | null {
  let rest = rawLine.trim();
  let tags: Readonly<Record<string, string>> = {};
  let prefix: string | null = null;
  let trailing: string | null = null;

  if (!rest) {
    return null;
  }

  if (rest.startsWith('@')) {
    const tagEndIndex = rest.indexOf(' ');

    if (tagEndIndex < 0) {
      return null;
    }

    tags = parseTags(rest.slice(1, tagEndIndex));
    rest = rest.slice(tagEndIndex + 1);
  }

  if (rest.startsWith(':')) {
    const prefixEndIndex = rest.indexOf(' ');

    if (prefixEndIndex < 0) {
      return null;
    }

    prefix = rest.slice(1, prefixEndIndex);
    rest = rest.slice(prefixEndIndex + 1);
  }

  const trailingIndex = rest.indexOf(' :');

  if (trailingIndex >= 0) {
    trailing = rest.slice(trailingIndex + 2);
    rest = rest.slice(0, trailingIndex);
  }

  const parts = rest.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return {
    tags,
    prefix,
    command: parts[0].toUpperCase(),
    params: parts.slice(1),
    trailing,
  };
}

/**
 * Parses Twitch IRC message tags.
 */
function parseTags(rawTags: string): Readonly<Record<string, string>> {
  const tags: Record<string, string> = {};

  for (const rawTag of rawTags.split(';')) {
    const separatorIndex = rawTag.indexOf('=');

    if (separatorIndex < 0) {
      tags[rawTag] = '';
      continue;
    }

    tags[rawTag.slice(0, separatorIndex)] = unescapeTagValue(
      rawTag.slice(separatorIndex + 1),
    );
  }

  return tags;
}

/**
 * Decodes Twitch IRC tag escape sequences.
 */
function unescapeTagValue(value: string): string {
  return value
    .replace(/\\s/g, ' ')
    .replace(/\\:/g, ';')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

/**
 * Reads the Twitch login name from an IRC prefix.
 */
function readUsernameFromPrefix(prefix: string | null): string | null {
  if (!prefix) {
    return null;
  }

  const separatorIndex = prefix.indexOf('!');
  const username = separatorIndex >= 0 ? prefix.slice(0, separatorIndex) : prefix;
  const normalized = username.trim();

  return normalized || null;
}

/**
 * Reads Twitch's millisecond timestamp tag, falling back to local time.
 */
function readTimestampMs(value: string | undefined): number {
  if (!value) {
    return Date.now();
  }

  const timestampMs = Number(value);

  if (!Number.isFinite(timestampMs)) {
    return Date.now();
  }

  return Math.round(timestampMs);
}
