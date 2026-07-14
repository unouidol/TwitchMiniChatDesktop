/**
 * Fixed path of the Robotty recent-messages2 API.
 */
export const ROBOTTY_RECENT_MESSAGES_PATH = '/api/v2/recent-messages';

/**
 * Maximum number of recent messages accepted by the public API request.
 */
export const ROBOTTY_RECENT_MESSAGES_MAX_LIMIT = 800;

/**
 * Optional filters accepted by the Robotty recent-messages2 endpoint.
 */
export type RobottyRecentMessagesRequestOptions = {
  readonly channel: string;
  readonly limit?: number;
  readonly before?: number;
  readonly after?: number;
  readonly hideModerationMessages?: boolean;
  readonly hideModeratedMessages?: boolean;
  readonly clearchatToNotice?: boolean;
};

/**
 * Public values supplied by the future request composition point.
 */
export type RobottyRecentMessagesRequestConfig = {
  readonly baseUrl: string;
  readonly userAgent: string;
};

/**
 * Pure HTTP request data for a future Robotty client.
 */
export type RobottyRecentMessagesRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<'Accept' | 'User-Agent', string>>;
};

/**
 * Stable classifications for invalid request-builder input.
 */
export type RobottyRecentMessagesRequestValidationErrorCode =
  | 'invalid-base-url'
  | 'invalid-channel'
  | 'invalid-limit'
  | 'invalid-before'
  | 'invalid-after'
  | 'invalid-user-agent'
  | 'invalid-hide-moderation-messages'
  | 'invalid-hide-moderated-messages'
  | 'invalid-clearchat-to-notice';

/**
 * Error thrown when a pure Robotty request cannot be constructed safely.
 */
export class RobottyRecentMessagesRequestValidationError extends Error {
  readonly code: RobottyRecentMessagesRequestValidationErrorCode;

  constructor(code: RobottyRecentMessagesRequestValidationErrorCode) {
    super(`Invalid Robotty recent messages request: ${code}.`);
    this.name = 'RobottyRecentMessagesRequestValidationError';
    this.code = code;
  }
}

/**
 * Builds a validated Robotty recent-messages2 request without performing I/O.
 */
export function buildRobottyRecentMessagesRequest(
  options: RobottyRecentMessagesRequestOptions,
  config: RobottyRecentMessagesRequestConfig,
): RobottyRecentMessagesRequest {
  const channel = normalizeChannel(options.channel);
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const userAgent = normalizeUserAgent(config.userAgent);
  const limit = validateLimit(options.limit);
  const before = validateTimestamp(options.before, 'invalid-before');
  const after = validateTimestamp(options.after, 'invalid-after');
  const hideModerationMessages = validateBoolean(
    options.hideModerationMessages,
    'invalid-hide-moderation-messages',
  );
  const hideModeratedMessages = validateBoolean(
    options.hideModeratedMessages,
    'invalid-hide-moderated-messages',
  );
  const clearchatToNotice = validateBoolean(
    options.clearchatToNotice,
    'invalid-clearchat-to-notice',
  );

  const url = new URL(baseUrl);
  url.pathname = `${ROBOTTY_RECENT_MESSAGES_PATH}/${encodeURIComponent(channel)}`;

  const query = new URLSearchParams();

  if (limit !== undefined) {
    query.set('limit', String(limit));
  }

  if (before !== undefined) {
    query.set('before', String(before));
  }

  if (after !== undefined) {
    query.set('after', String(after));
  }

  if (hideModerationMessages !== undefined) {
    query.set('hide_moderation_messages', String(hideModerationMessages));
  }

  if (hideModeratedMessages !== undefined) {
    query.set('hide_moderated_messages', String(hideModeratedMessages));
  }

  if (clearchatToNotice !== undefined) {
    query.set('clearchat_to_notice', String(clearchatToNotice));
  }

  url.search = query.toString();

  return {
    url: url.toString(),
    headers: {
      Accept: 'application/json',
      'User-Agent': userAgent,
    },
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== 'string') {
    throwValidationError('invalid-base-url');
  }

  let url: URL;

  try {
    url = new URL(baseUrl.trim());
  } catch {
    throwValidationError('invalid-base-url');
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throwValidationError('invalid-base-url');
  }

  return url.toString();
}

function normalizeChannel(channel: string): string {
  if (typeof channel !== 'string') {
    throwValidationError('invalid-channel');
  }

  const normalized = channel.trim().replace(/^#/, '').toLowerCase();

  if (!normalized) {
    throwValidationError('invalid-channel');
  }

  return normalized;
}

function validateLimit(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > ROBOTTY_RECENT_MESSAGES_MAX_LIMIT
  ) {
    throwValidationError('invalid-limit');
  }

  return value;
}

function validateTimestamp(
  value: number | undefined,
  errorCode: 'invalid-before' | 'invalid-after',
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throwValidationError(errorCode);
  }

  return value;
}

function validateBoolean(
  value: boolean | undefined,
  errorCode:
    | 'invalid-hide-moderation-messages'
    | 'invalid-hide-moderated-messages'
    | 'invalid-clearchat-to-notice',
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throwValidationError(errorCode);
  }

  return value;
}

function normalizeUserAgent(userAgent: string): string {
  if (typeof userAgent !== 'string') {
    throwValidationError('invalid-user-agent');
  }

  const normalized = userAgent.trim();

  if (!normalized || /[\r\n]/.test(normalized)) {
    throwValidationError('invalid-user-agent');
  }

  return normalized;
}

function throwValidationError(
  code: RobottyRecentMessagesRequestValidationErrorCode,
): never {
  throw new RobottyRecentMessagesRequestValidationError(code);
}
