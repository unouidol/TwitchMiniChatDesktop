import type { TmcHistoryMessage } from '../../../shared/backend/TmcHistoryModels';
import {
  decodeRobottyRecentMessagesPayload,
  type RobottyRecentMessagesParseResult,
} from './RobottyRecentMessagesModels';

type ParsedRobottyIrcLine = {
  readonly tags: Readonly<Record<string, string>>;
  readonly prefix: string | null;
  readonly command: string;
  readonly params: readonly string[];
  readonly trailing: string | null;
};

/**
 * Commands recognized as valid IRC rows but intentionally not represented by
 * the current TMC history message model.
 */
const IGNORED_IRC_COMMANDS = new Set([
  'CLEARCHAT',
  'CLEARMSG',
  'USERNOTICE',
  'NOTICE',
  'ROOMSTATE',
]);

/**
 * Largest non-negative Unix millisecond value representable by JavaScript Date.
 */
const MAX_TIMESTAMP_MILLIS = 8_640_000_000_000_000;

/**
 * Parses a deserialized Robotty recent-messages2 response into TMC history.
 *
 * The function is pure: it performs no network, Electron, logging, retry, or
 * renderer work. Valid PRIVMSG rows are retained in their original order.
 */
export function parseRobottyRecentMessages(
  value: unknown,
): RobottyRecentMessagesParseResult {
  const decoded = decodeRobottyRecentMessagesPayload(value);
  const historyMessages: TmcHistoryMessage[] = [];
  let ignoredLineCount = 0;
  let invalidLineCount = decoded.invalidLineCount;

  decoded.payload.messages.forEach((rawLine, index) => {
    const parsedLine = parseRobottyIrcLine(rawLine);

    if (!parsedLine) {
      invalidLineCount += 1;
      return;
    }

    if (parsedLine.command !== 'PRIVMSG') {
      if (IGNORED_IRC_COMMANDS.has(parsedLine.command)) {
        ignoredLineCount += 1;
        return;
      }

      // Unknown commands are valid IRC rows but outside the current UI model.
      ignoredLineCount += 1;
      return;
    }

    const historyMessage = parsePrivMsg(parsedLine, index);

    if (!historyMessage) {
      invalidLineCount += 1;
      return;
    }

    historyMessages.push(historyMessage);
  });

  return {
    historyMessages,
    error: decoded.payload.error,
    errorCode: decoded.payload.errorCode,
    ignoredLineCount,
    invalidLineCount,
    validationIssues: decoded.validationIssues,
  };
}

function parsePrivMsg(
  parsedLine: ParsedRobottyIrcLine,
  index: number,
): TmcHistoryMessage | null {
  const channel = normalizeChannel(parsedLine.params[0]);
  const text = parsedLine.trailing;
  const nickname = readNicknameFromPrefix(parsedLine.prefix);
  const displayName = readNonEmptyString(parsedLine.tags['display-name']);
  const user = displayName || nickname;
  const timestampMillis =
    readTimestampMillis(parsedLine.tags['tmi-sent-ts']) ??
    readTimestampMillis(parsedLine.tags['rm-received-ts']);

  if (!channel || text === null || !user || timestampMillis === null) {
    return null;
  }

  const id =
    readNonEmptyString(parsedLine.tags.id) ||
    `${channel}-${timestampMillis}-${index}`;
  const emotesRaw = readNonEmptyString(parsedLine.tags.emotes);

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
 * Parses the IRC structure needed by Robotty without depending on live-client
 * socket or connection state. This intentionally mirrors only TMC-supported
 * tag escaping and remains local until a safe shared extraction is warranted.
 */
function parseRobottyIrcLine(rawLine: string): ParsedRobottyIrcLine | null {
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

function parseTags(rawTags: string): Readonly<Record<string, string>> {
  const tags: Record<string, string> = {};

  for (const rawTag of rawTags.split(';')) {
    const separatorIndex = rawTag.indexOf('=');

    if (separatorIndex < 0) {
      tags[rawTag] = '';
      continue;
    }

    tags[rawTag.slice(0, separatorIndex)] = decodeTagValue(
      rawTag.slice(separatorIndex + 1),
    );
  }

  return tags;
}

/**
 * Decodes the IRC tag escapes already supported by the TMC live parser.
 */
function decodeTagValue(value: string): string {
  return value
    .replace(/\\s/g, ' ')
    .replace(/\\:/g, ';')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

function readNicknameFromPrefix(prefix: string | null): string | null {
  if (!prefix) {
    return null;
  }

  const separatorIndex = prefix.indexOf('!');
  const nickname = separatorIndex >= 0 ? prefix.slice(0, separatorIndex) : prefix;

  return readNonEmptyString(nickname);
}

function normalizeChannel(channel: string | undefined): string | null {
  if (!channel) {
    return null;
  }

  const normalized = channel.trim().replace(/^#/, '').toLowerCase();

  return normalized || null;
}

function readNonEmptyString(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function readTimestampMillis(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestampMillis = Number(value);

  if (
    !Number.isSafeInteger(timestampMillis) ||
    timestampMillis < 0 ||
    timestampMillis > MAX_TIMESTAMP_MILLIS
  ) {
    return null;
  }

  return timestampMillis;
}
