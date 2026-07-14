import { describe, expect, it } from 'vitest';

import { parseRobottyRecentMessages } from './RobottyRecentMessagesParser';

const TIMESTAMP = 1_700_000_000_000;

function parseMessages(...messages: unknown[]) {
  return parseRobottyRecentMessages({ messages });
}

function privmsg(options?: {
  readonly tags?: string;
  readonly prefix?: string;
  readonly channel?: string;
  readonly text?: string;
}): string {
  const tags = options?.tags ?? `tmi-sent-ts=${TIMESTAMP}`;
  const prefix = options?.prefix ?? 'nick!nick@example.test';
  const channel = options?.channel ?? '#channel';
  const text = options?.text ?? 'hello';

  return `@${tags} :${prefix} PRIVMSG ${channel} :${text}`;
}

describe('parseRobottyRecentMessages', () => {
  it('accepts an empty payload', () => {
    const result = parseRobottyRecentMessages({ messages: [] });
    expect(result.historyMessages).toEqual([]);
    expect(result.validationIssues).toEqual([]);
    expect(result.invalidLineCount).toBe(0);
  });

  it('rejects a null payload safely', () => {
    const result = parseRobottyRecentMessages(null);
    expect(result.validationIssues).toEqual(['payload-not-object']);
    expect(result.historyMessages).toEqual([]);
  });

  it('reports a missing messages field', () => {
    expect(parseRobottyRecentMessages({}).validationIssues).toEqual(['messages-missing']);
  });

  it('reports a non-array messages field', () => {
    expect(parseRobottyRecentMessages({ messages: 'not-an-array' }).validationIssues).toEqual([
      'messages-not-array',
    ]);
  });

  it('counts non-string message entries', () => {
    const result = parseMessages(privmsg(), 42, null);
    expect(result.historyMessages).toHaveLength(1);
    expect(result.invalidLineCount).toBe(2);
  });

  it('parses a minimal PRIVMSG', () => {
    expect(parseMessages(privmsg()).historyMessages[0]).toMatchObject({
      channel: 'channel',
      user: 'nick',
      text: 'hello',
      timestampMillis: TIMESTAMP,
    });
  });

  it('uses display-name when present', () => {
    const message = parseMessages(
      privmsg({ tags: `display-name=Display;tmi-sent-ts=${TIMESTAMP}` }),
    ).historyMessages[0];
    expect(message.user).toBe('Display');
  });

  it('falls back to the prefix nickname', () => {
    expect(parseMessages(privmsg()).historyMessages[0].user).toBe('nick');
  });

  it('uses tmi-sent-ts as the primary timestamp', () => {
    const message = parseMessages(
      privmsg({ tags: `rm-received-ts=${TIMESTAMP + 1};tmi-sent-ts=${TIMESTAMP}` }),
    ).historyMessages[0];
    expect(message.timestampMillis).toBe(TIMESTAMP);
  });

  it('falls back to rm-received-ts', () => {
    const message = parseMessages(
      privmsg({ tags: `rm-received-ts=${TIMESTAMP + 1}` }),
    ).historyMessages[0];
    expect(message.timestampMillis).toBe(TIMESTAMP + 1);
  });

  it('rejects a PRIVMSG without a timestamp', () => {
    const result = parseMessages(privmsg({ tags: 'display-name=Display' }));
    expect(result.historyMessages).toEqual([]);
    expect(result.invalidLineCount).toBe(1);
  });

  it('rejects an invalid timestamp', () => {
    const result = parseMessages(privmsg({ tags: 'tmi-sent-ts=invalid' }));
    expect(result.historyMessages).toEqual([]);
    expect(result.invalidLineCount).toBe(1);
  });

  it('uses the Twitch message id', () => {
    const message = parseMessages(
      privmsg({ tags: `id=message-id;tmi-sent-ts=${TIMESTAMP}` }),
    ).historyMessages[0];
    expect(message.id).toBe('message-id');
  });

  it('uses the existing deterministic fallback id', () => {
    expect(parseMessages(privmsg()).historyMessages[0].id).toBe(`channel-${TIMESTAMP}-0`);
  });

  it('preserves the raw emote tag', () => {
    const message = parseMessages(
      privmsg({ tags: `emotes=25:0-4;tmi-sent-ts=${TIMESTAMP}` }),
    ).historyMessages[0];
    expect(message.emotesRaw).toBe('25:0-4');
  });

  it('accepts tags in a different order', () => {
    const message = parseMessages(
      privmsg({ tags: `tmi-sent-ts=${TIMESTAMP};id=ordered;display-name=Display` }),
    ).historyMessages[0];
    expect(message).toMatchObject({ id: 'ordered', user: 'Display' });
  });

  it('handles an empty tag value', () => {
    const message = parseMessages(
      privmsg({ tags: `display-name=;tmi-sent-ts=${TIMESTAMP}` }),
    ).historyMessages[0];
    expect(message.user).toBe('nick');
  });

  it('decodes supported IRC tag escapes', () => {
    const message = parseMessages(
      privmsg({
        tags: `display-name=One\\sTwo\\:Three\\\\Four;tmi-sent-ts=${TIMESTAMP}`,
      }),
    ).historyMessages[0];
    expect(message.user).toBe('One Two;Three\\Four');
  });

  it('preserves spaces in trailing message text', () => {
    expect(parseMessages(privmsg({ text: 'hello with several spaces' })).historyMessages[0].text).toBe(
      'hello with several spaces',
    );
  });

  it('preserves multiple colons in trailing message text', () => {
    expect(parseMessages(privmsg({ text: 'first:second::third' })).historyMessages[0].text).toBe(
      'first:second::third',
    );
  });

  it('preserves Unicode text', () => {
    expect(parseMessages(privmsg({ text: 'Caffè 東京' })).historyMessages[0].text).toBe('Caffè 東京');
  });

  it('preserves emoji', () => {
    expect(parseMessages(privmsg({ text: 'hello 👋' })).historyMessages[0].text).toBe('hello 👋');
  });

  it('preserves backslashes in message text', () => {
    expect(parseMessages(privmsg({ text: String.raw`path\to\file` })).historyMessages[0].text).toBe(
      String.raw`path\to\file`,
    );
  });

  it.each(['CLEARCHAT', 'CLEARMSG', 'USERNOTICE', 'NOTICE', 'ROOMSTATE'])(
    'ignores the recognized %s command',
    (command) => {
      const result = parseMessages(`@tmi-sent-ts=${TIMESTAMP} :server ${command} #channel`);
      expect(result.historyMessages).toEqual([]);
      expect(result.ignoredLineCount).toBe(1);
      expect(result.invalidLineCount).toBe(0);
    },
  );

  it('ignores an unknown IRC command', () => {
    const result = parseMessages(':server UNKNOWN #channel :value');
    expect(result.ignoredLineCount).toBe(1);
    expect(result.invalidLineCount).toBe(0);
  });

  it('counts malformed IRC rows', () => {
    const result = parseMessages('@tag-without-command');
    expect(result.invalidLineCount).toBe(1);
  });

  it('preserves error and error_code alongside messages', () => {
    const result = parseRobottyRecentMessages({
      messages: [privmsg()],
      error: 'partial result',
      error_code: 'PARTIAL',
    });
    expect(result.historyMessages).toHaveLength(1);
    expect(result.error).toBe('partial result');
    expect(result.errorCode).toBe('PARTIAL');
  });

  it('preserves message order', () => {
    const result = parseMessages(
      privmsg({ tags: `id=first;tmi-sent-ts=${TIMESTAMP}`, text: 'first' }),
      privmsg({ tags: `id=second;tmi-sent-ts=${TIMESTAMP + 1}`, text: 'second' }),
    );
    expect(result.historyMessages.map((message) => message.id)).toEqual(['first', 'second']);
  });

  it('does not deduplicate messages', () => {
    const duplicate = privmsg({ tags: `id=duplicate;tmi-sent-ts=${TIMESTAMP}` });
    const result = parseMessages(duplicate, duplicate);
    expect(result.historyMessages).toHaveLength(2);
    expect(result.historyMessages.map((message) => message.id)).toEqual([
      'duplicate',
      'duplicate',
    ]);
  });
});