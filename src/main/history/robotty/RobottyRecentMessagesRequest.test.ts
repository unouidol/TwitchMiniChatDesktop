import { describe, expect, it } from 'vitest';

import {
  buildRobottyRecentMessagesRequest,
  RobottyRecentMessagesRequestValidationError,
  type RobottyRecentMessagesRequestConfig,
} from './RobottyRecentMessagesRequest';

const CONFIG: RobottyRecentMessagesRequestConfig = {
  baseUrl: 'https://robotty.invalid/',
  userAgent: 'TMC-Test/1.0',
};

function build(
  options: Parameters<typeof buildRobottyRecentMessagesRequest>[0],
  config = CONFIG,
) {
  return buildRobottyRecentMessagesRequest(options, config);
}

function expectValidationError(callback: () => unknown, code: string): void {
  try {
    callback();
    throw new Error('Expected request validation to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(RobottyRecentMessagesRequestValidationError);
    if (error instanceof RobottyRecentMessagesRequestValidationError) {
      expect(error.code).toBe(code);
    }
  }
}

describe('buildRobottyRecentMessagesRequest', () => {
  it('accepts a base URL with a trailing slash', () => {
    expect(build({ channel: 'channel' }).url).toBe(
      'https://robotty.invalid/api/v2/recent-messages/channel',
    );
  });

  it('accepts a valid HTTPS base URL', () => {
    expect(
      build({ channel: 'channel' }, { ...CONFIG, baseUrl: 'https://example.invalid/' }).url,
    ).toContain('https://example.invalid/');
  });

  it('rejects a non-HTTPS base URL', () => {
    expectValidationError(
      () => build({ channel: 'channel' }, { ...CONFIG, baseUrl: 'http://example.invalid/' }),
      'invalid-base-url',
    );
  });

  it('rejects embedded username and password', () => {
    expectValidationError(
      () =>
        build(
          { channel: 'channel' },
          { ...CONFIG, baseUrl: 'https://user:password@example.invalid/' },
        ),
      'invalid-base-url',
    );
  });

  it('rejects a base URL query', () => {
    expectValidationError(
      () =>
        build(
          { channel: 'channel' },
          { ...CONFIG, baseUrl: 'https://example.invalid/?query=value' },
        ),
      'invalid-base-url',
    );
  });

  it('rejects a base URL fragment', () => {
    expectValidationError(
      () =>
        build(
          { channel: 'channel' },
          { ...CONFIG, baseUrl: 'https://example.invalid/#fragment' },
        ),
      'invalid-base-url',
    );
  });

  it('normalizes a leading channel hash', () => {
    expect(build({ channel: '#channel' }).url).toContain('/channel');
  });

  it('normalizes uppercase channel characters', () => {
    expect(build({ channel: 'MyChannel' }).url).toContain('/mychannel');
  });

  it('rejects an empty channel', () => {
    expectValidationError(() => build({ channel: '  #  ' }), 'invalid-channel');
  });

  it('encodes slash and reserved channel characters as one path segment', () => {
    const url = build({ channel: 'Room/Name?' }).url;
    expect(url).toContain('/room%2Fname%3F');
    expect(new URL(url).pathname.split('/')).toHaveLength(5);
  });

  it('accepts limit 1', () => {
    expect(new URL(build({ channel: 'channel', limit: 1 }).url).searchParams.get('limit')).toBe(
      '1',
    );
  });

  it('accepts limit 800', () => {
    expect(new URL(build({ channel: 'channel', limit: 800 }).url).searchParams.get('limit')).toBe(
      '800',
    );
  });

  it.each([801, 0, 1.5])('rejects invalid limit %s', (limit) => {
    expectValidationError(() => build({ channel: 'channel', limit }), 'invalid-limit');
  });

  it('accepts a non-negative before timestamp', () => {
    expect(new URL(build({ channel: 'channel', before: 0 }).url).searchParams.get('before')).toBe(
      '0',
    );
  });

  it('rejects a negative before timestamp', () => {
    expectValidationError(() => build({ channel: 'channel', before: -1 }), 'invalid-before');
  });

  it('accepts a non-negative after timestamp', () => {
    expect(new URL(build({ channel: 'channel', after: 123 }).url).searchParams.get('after')).toBe(
      '123',
    );
  });

  it('rejects NaN after', () => {
    expectValidationError(() => build({ channel: 'channel', after: Number.NaN }), 'invalid-after');
  });

  it('serializes boolean true', () => {
    const url = new URL(build({ channel: 'channel', hideModerationMessages: true }).url);
    expect(url.searchParams.get('hide_moderation_messages')).toBe('true');
  });

  it('serializes boolean false', () => {
    const url = new URL(build({ channel: 'channel', hideModeratedMessages: false }).url);
    expect(url.searchParams.get('hide_moderated_messages')).toBe('false');
  });

  it('omits undefined parameters', () => {
    expect(new URL(build({ channel: 'channel' }).url).search).toBe('');
  });

  it('uses a deterministic query order', () => {
    const request = build({
      channel: 'channel',
      limit: 10,
      before: 20,
      after: 30,
      hideModerationMessages: true,
      hideModeratedMessages: false,
      clearchatToNotice: true,
    });
    expect(new URL(request.url).search.slice(1)).toBe(
      'limit=10&before=20&after=30&hide_moderation_messages=true&hide_moderated_messages=false&clearchat_to_notice=true',
    );
  });

  it('sets the Accept header', () => {
    expect(build({ channel: 'channel' }).headers.Accept).toBe('application/json');
  });

  it('sets the configured User-Agent header', () => {
    expect(build({ channel: 'channel' }).headers['User-Agent']).toBe('TMC-Test/1.0');
  });

  it('rejects an empty User-Agent', () => {
    expectValidationError(
      () => build({ channel: 'channel' }, { ...CONFIG, userAgent: '  ' }),
      'invalid-user-agent',
    );
  });

  it.each(['bad\rvalue', 'bad\nvalue'])('rejects CR/LF in User-Agent', (userAgent) => {
    expectValidationError(
      () => build({ channel: 'channel' }, { ...CONFIG, userAgent }),
      'invalid-user-agent',
    );
  });

  it('does not add Authorization or Cookie headers', () => {
    const headers = new Headers(build({ channel: 'channel' }).headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('Cookie')).toBe(false);
    expect([...headers.keys()]).toHaveLength(2);
  });
});