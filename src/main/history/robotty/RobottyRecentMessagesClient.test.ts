import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ROBOTTY_RECENT_MESSAGES_DEFAULT_TIMEOUT_MS,
  RobottyRecentMessagesClient,
  type RobottyFetch,
} from './RobottyRecentMessagesClient';
import { RobottyRecentMessagesClientError } from './RobottyRecentMessagesErrors';

const TIMESTAMP = 1_700_000_000_000;
const CONFIG = {
  baseUrl: 'https://robotty.invalid/',
  userAgent: 'TMC-Test/1.0',
} as const;
const VALID_PAYLOAD = {
  messages: [
    `@id=message-id;tmi-sent-ts=${TIMESTAMP} :nick!nick@example.test PRIVMSG #channel :hello`,
  ],
};

function jsonResponse(payload: unknown, status = 200, statusText?: string): Response {
  return new Response(JSON.stringify(payload), {
    status,
    ...(statusText === undefined ? {} : { statusText }),
    headers: { 'Content-Type': 'application/json' },
  });
}

function createClient(fetchImpl: RobottyFetch, timeoutMs?: number) {
  return new RobottyRecentMessagesClient({
    ...CONFIG,
    fetch: fetchImpl,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

async function expectClientError(
  promise: Promise<unknown>,
  kind: RobottyRecentMessagesClientError['kind'],
  status?: number,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${kind} client error.`);
  } catch (error) {
    expect(error).toBeInstanceOf(RobottyRecentMessagesClientError);
    if (error instanceof RobottyRecentMessagesClientError) {
      expect(error.kind).toBe(kind);
      expect(error.status).toBe(status);
    }
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RobottyRecentMessagesClient', () => {
  it('invokes fetch exactly once per load', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(VALID_PAYLOAD));
    await createClient(fetchImpl).loadRecentMessages({ channel: 'channel' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses GET with the builder URL and headers', async () => {
    let capturedInput: string | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl: RobottyFetch = async (input, init) => {
      capturedInput = input;
      capturedInit = init;
      return jsonResponse(VALID_PAYLOAD);
    };
    await createClient(fetchImpl).loadRecentMessages({ channel: '#MyChannel', limit: 1 });
    expect(capturedInput).toBe(
      'https://robotty.invalid/api/v2/recent-messages/mychannel?limit=1',
    );
    expect(capturedInit?.method).toBe('GET');
    expect(new Headers(capturedInit?.headers).get('Accept')).toBe('application/json');
    expect(new Headers(capturedInit?.headers).get('User-Agent')).toBe('TMC-Test/1.0');
  });

  it('returns parsed history for HTTP 200', async () => {
    const result = await createClient(async () => jsonResponse(VALID_PAYLOAD)).loadRecentMessages({
      channel: 'channel',
    });
    expect(result.historyMessages).toHaveLength(1);
    expect(result.historyMessages[0].id).toBe('message-id');
  });

  it('accepts HTTP 200 with empty history', async () => {
    const result = await createClient(async () => jsonResponse({ messages: [] })).loadRecentMessages({
      channel: 'channel',
    });
    expect(result.historyMessages).toEqual([]);
  });

  it('returns error_code without throwing', async () => {
    const result = await createClient(async () =>
      jsonResponse({ messages: [], error: 'partial', error_code: 'PARTIAL' }),
    ).loadRecentMessages({ channel: 'channel' });
    expect(result.error).toBe('partial');
    expect(result.errorCode).toBe('PARTIAL');
  });

  it('classifies HTTP 204 without JSON as invalid_json', async () => {
    await expectClientError(
      createClient(async () => new Response(null, { status: 204 })).loadRecentMessages({
        channel: 'channel',
      }),
      'invalid_json',
    );
  });

  it.each([400, 429, 500])('classifies HTTP %s and preserves its status', async (status) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ignored: true }, status, 'Failure'));
    await expectClientError(
      createClient(fetchImpl).loadRecentMessages({ channel: 'channel' }),
      'http',
      status,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('classifies rejected response.json as invalid_json', async () => {
    const response = jsonResponse(VALID_PAYLOAD);
    vi.spyOn(response, 'json').mockRejectedValue(new SyntaxError('invalid JSON'));
    await expectClientError(
      createClient(async () => response).loadRecentMessages({ channel: 'channel' }),
      'invalid_json',
    );
  });

  it('classifies an invalid payload', async () => {
    await expectClientError(
      createClient(async () => jsonResponse({})).loadRecentMessages({ channel: 'channel' }),
      'invalid_payload',
    );
  });

  it('classifies a rejected fetch as network', async () => {
    await expectClientError(
      createClient(async () => Promise.reject(new Error('offline failure'))).loadRecentMessages({
        channel: 'channel',
      }),
      'network',
    );
  });

  it('classifies a synchronously throwing fetch as network', async () => {
    const fetchImpl: RobottyFetch = () => {
      throw new Error('offline failure');
    };
    await expectClientError(
      createClient(fetchImpl).loadRecentMessages({ channel: 'channel' }),
      'network',
    );
  });

  it('uses the 5000 ms default timeout, aborts, clears the timer, and does not retry', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(
      (_input: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          capturedSignal = init?.signal instanceof AbortSignal ? init.signal : undefined;
          capturedSignal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const result = createClient(fetchImpl).loadRecentMessages({ channel: 'channel' });
    const assertion = expectClientError(result, 'timeout');
    expect(ROBOTTY_RECENT_MESSAGES_DEFAULT_TIMEOUT_MS).toBe(5000);
    await vi.advanceTimersByTimeAsync(4999);
    expect(capturedSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(capturedSignal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out while response.json is pending', async () => {
    vi.useFakeTimers();
    const response = jsonResponse(VALID_PAYLOAD);
    vi.spyOn(response, 'json').mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(VALID_PAYLOAD), 6000);
        }),
    );
    const result = createClient(async () => response).loadRecentMessages({ channel: 'channel' });
    const assertion = expectClientError(result, 'timeout');
    await vi.advanceTimersByTimeAsync(6000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a response that arrives just after abort', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_input: string | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          const signal = init?.signal;
          signal?.addEventListener('abort', () => {
            setTimeout(() => resolve(jsonResponse(VALID_PAYLOAD)), 1);
          });
        }),
    );
    const result = createClient(fetchImpl).loadRecentMessages({ channel: 'channel' });
    const assertion = expectClientError(result, 'timeout');
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timeout on success', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    await createClient(async () => jsonResponse(VALID_PAYLOAD)).loadRecentMessages({
      channel: 'channel',
    });
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timeout on error', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    await expectClientError(
      createClient(async () => Promise.reject(new Error('offline failure'))).loadRecentMessages({
        channel: 'channel',
      }),
      'network',
    );
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not invoke fetch for an invalid request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(VALID_PAYLOAD));
    await expectClientError(
      createClient(fetchImpl).loadRecentMessages({ channel: '', limit: 801 }),
      'invalid_request',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never adds Authorization or Cookie headers', async () => {
    let capturedHeaders: HeadersInit | undefined;
    const fetchImpl: RobottyFetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      return jsonResponse(VALID_PAYLOAD);
    };
    await createClient(fetchImpl).loadRecentMessages({ channel: 'channel' });
    const headers = new Headers(capturedHeaders);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('Cookie')).toBe(false);
    expect([...headers.keys()]).toHaveLength(2);
  });
});