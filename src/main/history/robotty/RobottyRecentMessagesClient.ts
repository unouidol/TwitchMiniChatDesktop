import type { RobottyRecentMessagesParseResult } from './RobottyRecentMessagesModels';
import { parseRobottyRecentMessages } from './RobottyRecentMessagesParser';
import {
  buildRobottyRecentMessagesRequest,
  RobottyRecentMessagesRequestValidationError,
  type RobottyRecentMessagesRequestConfig,
  type RobottyRecentMessagesRequestOptions,
} from './RobottyRecentMessagesRequest';
import { RobottyRecentMessagesClientError } from './RobottyRecentMessagesErrors';

/**
 * Default finite timeout applied to each isolated Robotty HTTP request.
 */
export const ROBOTTY_RECENT_MESSAGES_DEFAULT_TIMEOUT_MS = 5000;

/**
 * Maximum timeout accepted by the client constructor.
 */
export const ROBOTTY_RECENT_MESSAGES_MAX_TIMEOUT_MS = 30000;

/**
 * Fetch-compatible dependency injected into the Robotty client.
 */
export type RobottyFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type RobottyTimeoutHandle = ReturnType<typeof setTimeout>;

/**
 * Timer dependency used to keep timeout cleanup directly testable.
 */
export type RobottySetTimeout = (
  callback: () => void,
  timeoutMs: number,
) => RobottyTimeoutHandle;

/**
 * Timer cleanup dependency used to prevent pending client timers.
 */
export type RobottyClearTimeout = (handle: RobottyTimeoutHandle) => void;

/**
 * Explicit, non-secret dependencies required by RobottyRecentMessagesClient.
 */
export type RobottyRecentMessagesClientDependencies =
  RobottyRecentMessagesRequestConfig & {
    readonly fetch: RobottyFetch;
    readonly timeoutMs?: number;
    readonly setTimeout?: RobottySetTimeout;
    readonly clearTimeout?: RobottyClearTimeout;
  };

/**
 * Isolated main-process transport for Robotty recent-messages2.
 *
 * The client performs one GET request, parses one JSON body, delegates payload
 * normalization to the existing parser, and has no runtime composition role.
 * External abort signals are intentionally unsupported; only the per-request
 * timeout controller created here can abort a client request.
 */
export class RobottyRecentMessagesClient {
  private readonly requestConfig: RobottyRecentMessagesRequestConfig;
  private readonly fetchImpl: RobottyFetch;
  private readonly timeoutMs: number;
  private readonly setTimeoutImpl: RobottySetTimeout;
  private readonly clearTimeoutImpl: RobottyClearTimeout;

  /**
   * Creates an isolated client with explicit transport and public HTTP values.
   */
  constructor(dependencies: RobottyRecentMessagesClientDependencies) {
    if (typeof dependencies.fetch !== 'function') {
      throw new RobottyRecentMessagesClientError('invalid_request');
    }

    if (
      dependencies.setTimeout !== undefined &&
      typeof dependencies.setTimeout !== 'function'
    ) {
      throw new RobottyRecentMessagesClientError('invalid_request');
    }

    if (
      dependencies.clearTimeout !== undefined &&
      typeof dependencies.clearTimeout !== 'function'
    ) {
      throw new RobottyRecentMessagesClientError('invalid_request');
    }

    this.requestConfig = {
      baseUrl: dependencies.baseUrl,
      userAgent: dependencies.userAgent,
    };
    this.fetchImpl = dependencies.fetch;
    this.timeoutMs = validateTimeoutMs(dependencies.timeoutMs);
    this.setTimeoutImpl = dependencies.setTimeout || setTimeout;
    this.clearTimeoutImpl = dependencies.clearTimeout || clearTimeout;
  }

  /**
   * Loads and normalizes one Robotty recent-messages2 response.
   */
  async loadRecentMessages(
    options: RobottyRecentMessagesRequestOptions,
  ): Promise<RobottyRecentMessagesParseResult> {
    const request = this.buildRequest(options);
    const abortController = new AbortController();
    let timeoutElapsed = false;
    const timeoutHandle = this.setTimeoutImpl(() => {
      timeoutElapsed = true;
      abortController.abort();
    }, this.timeoutMs);

    try {
      const response = await this.executeFetch(
        request.url,
        request.headers,
        abortController.signal,
        () => timeoutElapsed,
      );

      if (timeoutElapsed) {
        throw new RobottyRecentMessagesClientError('timeout');
      }

      if (response.status < 200 || response.status >= 300) {
        throw new RobottyRecentMessagesClientError(
          'http',
          response.status,
          sanitizeStatusText(response.statusText),
        );
      }

      let rawPayload: unknown;

      try {
        rawPayload = await response.json();
      } catch {
        if (timeoutElapsed) {
          throw new RobottyRecentMessagesClientError('timeout');
        }

        throw new RobottyRecentMessagesClientError('invalid_json');
      }

      if (timeoutElapsed) {
        throw new RobottyRecentMessagesClientError('timeout');
      }

      let parsedResult: RobottyRecentMessagesParseResult;

      try {
        parsedResult = parseRobottyRecentMessages(rawPayload);
      } catch {
        throw new RobottyRecentMessagesClientError('invalid_payload');
      }

      if (parsedResult.validationIssues.length > 0) {
        throw new RobottyRecentMessagesClientError('invalid_payload');
      }

      return parsedResult;
    } finally {
      this.clearTimeoutImpl(timeoutHandle);
    }
  }

  private buildRequest(options: RobottyRecentMessagesRequestOptions) {
    try {
      return buildRobottyRecentMessagesRequest(options, this.requestConfig);
    } catch (error) {
      if (error instanceof RobottyRecentMessagesRequestValidationError) {
        throw new RobottyRecentMessagesClientError('invalid_request');
      }

      throw error;
    }
  }

  private async executeFetch(
    url: string,
    headers: Readonly<Record<'Accept' | 'User-Agent', string>>,
    signal: AbortSignal,
    hasTimedOut: () => boolean,
  ): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        method: 'GET',
        headers,
        signal,
      });
    } catch (error) {
      if (error instanceof RobottyRecentMessagesClientError) {
        throw error;
      }

      if (hasTimedOut()) {
        throw new RobottyRecentMessagesClientError('timeout');
      }

      throw new RobottyRecentMessagesClientError('network');
    }
  }
}

function validateTimeoutMs(timeoutMs: number | undefined): number {
  const normalizedTimeout =
    timeoutMs ?? ROBOTTY_RECENT_MESSAGES_DEFAULT_TIMEOUT_MS;

  if (
    typeof normalizedTimeout !== 'number' ||
    !Number.isFinite(normalizedTimeout) ||
    !Number.isInteger(normalizedTimeout) ||
    normalizedTimeout <= 0 ||
    normalizedTimeout > ROBOTTY_RECENT_MESSAGES_MAX_TIMEOUT_MS
  ) {
    throw new RobottyRecentMessagesClientError('invalid_request');
  }

  return normalizedTimeout;
}

function sanitizeStatusText(statusText: string): string | undefined {
  const sanitized = statusText.replace(/[\r\n]+/g, ' ').trim().slice(0, 120);

  return sanitized || undefined;
}
