import type {
  LoadHistoryRequest,
  LoadHistoryResult,
  TmcHistoryMessage,
} from '../../shared/backend/TmcHistoryModels';
import type { TmcAuthSessionStore } from '../auth/TmcAuthSessionStore';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';

/**
 * Raw backend message shape.
 *
 * The Python backend can evolve independently, so this client accepts a few
 * known field aliases and normalizes them before exposing data to the renderer.
 */
type RawHistoryMessage = {
  readonly id?: unknown;
  readonly msg_id?: unknown;
  readonly message_id?: unknown;
  readonly channel?: unknown;
  readonly user?: unknown;
  readonly username?: unknown;
  readonly display_name?: unknown;
  readonly login?: unknown;
  readonly text?: unknown;
  readonly message?: unknown;
  readonly body?: unknown;
  readonly ts?: unknown;
  readonly timestamp?: unknown;
  readonly time?: unknown;
  readonly emotes_raw?: unknown;
  readonly emotesRaw?: unknown;
};

/**
 * Raw object-shaped backend history response.
 */
type RawHistoryEnvelope = {
  /**
   * Message list when the backend wraps history as `messages`.
   */
  readonly messages?: unknown;

  /**
   * Message list when the backend wraps history as `history`.
   */
  readonly history?: unknown;

  /**
   * Message list when the backend wraps history as `items`.
   */
  readonly items?: unknown;
};

/**
 * Raw backend history response shape.
 */
type RawHistoryResponse = readonly RawHistoryMessage[] | RawHistoryEnvelope;

/**
 * Client for the TMC backend HTTP API.
 *
 * Keep backend access in the Electron main process. The renderer should not
 * perform direct backend calls while it remains a local, isolated UI surface.
 */
export class TmcBackendClient {
  /**
   * Creates a backend client.
   */
  constructor(
    private readonly config: TmcRuntimeConfig,
    private readonly authSessionStore: TmcAuthSessionStore,
  ) {}

  /**
   * Loads cached chat history from the TMC backend.
   */
  async loadHistory(request: LoadHistoryRequest): Promise<LoadHistoryResult> {
    const channel = normalizeChannel(request.channel);
    const seconds = normalizeHistorySeconds(request.seconds);
    const desktopSessionToken =
      this.authSessionStore.getSession()?.desktopSessionToken?.trim();

    if (!desktopSessionToken) {
      throw new Error('Desktop session unavailable. Please sign in again.');
    }

    const url = buildHistoryUrl(this.config.backendBaseUrl, channel, seconds);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${desktopSessionToken}`,
        'Cache-Control': 'no-cache',
        'User-Agent': buildUserAgent(this.config),
        'X-TMC-Client': this.config.desktopClientId,
        'X-TMC-Client-Version': this.config.desktopClientVersion,
      },
    });

    if (response.status === 401) {
      throw new Error('Desktop session expired. Please sign in again.');
    }

    if (!response.ok) {
      const responseBody = await safelyReadResponseText(response);

      throw new Error(
        buildHttpErrorMessage(
          response.status,
          response.statusText,
          responseBody,
        ),
      );
    }

    const rawJson = (await response.json()) as RawHistoryResponse;
    const rawMessages = extractRawMessages(rawJson);

    return {
      channel,
      loadedAtMillis: Date.now(),
      messages: rawMessages.map((message, index) =>
        normalizeHistoryMessage(message, channel, index),
      ),
    };
  }
}

/**
 * Builds the public history endpoint URL.
 */
function buildHistoryUrl(
  backendBaseUrl: string,
  channel: string,
  seconds: number,
): string {
  const normalizedBaseUrl = backendBaseUrl.replace(/\/+$/, '');
  const encodedChannel = encodeURIComponent(channel);

  return `${normalizedBaseUrl}/history?channel=${encodedChannel}&seconds=${seconds}`;
}

/**
 * Builds a public User-Agent for backend diagnostics.
 */
function buildUserAgent(config: TmcRuntimeConfig): string {
  return `TMCDesktop/${config.desktopClientVersion} (${config.desktopClientId})`;
}

/**
 * Builds a compact HTTP error message for the renderer.
 */
function buildHttpErrorMessage(
  status: number,
  statusText: string,
  responseBody: string,
): string {
  const bodyPreview = responseBody.trim();

  if (!bodyPreview) {
    return `History request failed with HTTP ${status} ${statusText}`;
  }

  return `History request failed with HTTP ${status} ${statusText}: ${truncateForDisplay(
    bodyPreview,
    500,
  )}`;
}

/**
 * Safely reads a response body for diagnostics.
 */
async function safelyReadResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/**
 * Truncates backend diagnostics so the chat UI does not get flooded.
 */
function truncateForDisplay(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}…`;
}

/**
 * Normalizes a Twitch channel name for backend requests.
 */
function normalizeChannel(channel: string): string {
  const normalized = channel.trim().replace(/^#/, '').toLowerCase();

  if (!normalized) {
    throw new Error('Channel cannot be empty.');
  }

  return normalized;
}

/**
 * Normalizes the requested history window.
 */
function normalizeHistorySeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return 3600;
  }

  return Math.min(Math.max(Math.round(seconds), 60), 24 * 60 * 60);
}

/**
 * Extracts a message array from supported backend response shapes.
 */
function extractRawMessages(
  rawJson: RawHistoryResponse,
): readonly RawHistoryMessage[] {
  if (isRawHistoryMessageArray(rawJson)) {
    return rawJson;
  }

  return extractRawMessagesFromEnvelope(rawJson);
}

/**
 * Checks whether the raw backend response is a direct message array.
 *
 * This explicit type guard is needed because TypeScript does not always narrow
 * readonly array unions reliably through Array.isArray alone.
 */
function isRawHistoryMessageArray(
  rawJson: RawHistoryResponse,
): rawJson is readonly RawHistoryMessage[] {
  return Array.isArray(rawJson);
}

/**
 * Extracts a message array from object-shaped backend history responses.
 */
function extractRawMessagesFromEnvelope(
  envelope: RawHistoryEnvelope,
): readonly RawHistoryMessage[] {
  if (Array.isArray(envelope.messages)) {
    return envelope.messages as readonly RawHistoryMessage[];
  }

  if (Array.isArray(envelope.history)) {
    return envelope.history as readonly RawHistoryMessage[];
  }

  if (Array.isArray(envelope.items)) {
    return envelope.items as readonly RawHistoryMessage[];
  }

  return [];
}

/**
 * Converts one raw backend message into the renderer-safe message model.
 */
function normalizeHistoryMessage(
  rawMessage: RawHistoryMessage,
  fallbackChannel: string,
  index: number,
): TmcHistoryMessage {
  const channel = readString(rawMessage.channel) || fallbackChannel;
  const user =
    readString(rawMessage.user) ||
    readString(rawMessage.username) ||
    readString(rawMessage.display_name) ||
    readString(rawMessage.login) ||
    'unknown';

  const text =
    readString(rawMessage.text) ||
    readString(rawMessage.message) ||
    readString(rawMessage.body) ||
    '';

  const timestampMillis = readTimestampMillis(
    rawMessage.ts ?? rawMessage.timestamp ?? rawMessage.time,
  );

  const id =
    readString(rawMessage.id) ||
    readString(rawMessage.msg_id) ||
    readString(rawMessage.message_id) ||
    `${channel}-${timestampMillis}-${index}`;

  const emotesRaw =
    readString(rawMessage.emotes_raw) || readString(rawMessage.emotesRaw);

  return {
    id,
    channel,
    user,
    text,
    timestampMillis,
    ...(emotesRaw ? { emotesRaw } : {}),
  };
}

/**
 * Reads a string value from an unknown backend field.
 */
function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Reads a timestamp from supported backend timestamp formats.
 */
function readTimestampMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000
      ? Math.round(value * 1000)
      : Math.round(value);
  }

  if (typeof value === 'string') {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue)) {
      return numericValue < 1_000_000_000_000
        ? Math.round(numericValue * 1000)
        : Math.round(numericValue);
    }

    const parsedDate = Date.parse(value);

    if (Number.isFinite(parsedDate)) {
      return parsedDate;
    }
  }

  return Date.now();
}

