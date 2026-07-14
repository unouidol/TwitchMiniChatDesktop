import type { TmcHistoryMessage } from '../../../shared/backend/TmcHistoryModels';

/**
 * Validated public shape of a Robotty recent-messages2 response.
 *
 * Invalid array elements are excluded by the runtime decoder and reported
 * separately so valid IRC rows can still be processed.
 */
export type RobottyRecentMessagesPayload = {
  readonly messages: readonly string[];
  readonly error: string | null;
  readonly errorCode: string | null;
};

/**
 * Safe classifications for malformed outer response fields.
 */
export type RobottyRecentMessagesValidationIssue =
  | 'payload-not-object'
  | 'messages-missing'
  | 'messages-not-array'
  | 'error-not-nullable-string'
  | 'error-code-not-nullable-string';

/**
 * Result of validating the outer Robotty response without parsing IRC rows.
 */
export type RobottyRecentMessagesDecodeResult = {
  readonly payload: RobottyRecentMessagesPayload;
  readonly invalidLineCount: number;
  readonly validationIssues: readonly RobottyRecentMessagesValidationIssue[];
};

/**
 * Renderer-independent result produced by the offline Robotty parser.
 */
export type RobottyRecentMessagesParseResult = {
  readonly historyMessages: readonly TmcHistoryMessage[];
  readonly error: string | null;
  readonly errorCode: string | null;
  readonly ignoredLineCount: number;
  readonly invalidLineCount: number;
  readonly validationIssues: readonly RobottyRecentMessagesValidationIssue[];
};

/**
 * Validates a deserialized Robotty value while retaining valid string rows.
 */
export function decodeRobottyRecentMessagesPayload(
  value: unknown,
): RobottyRecentMessagesDecodeResult {
  if (!isRecord(value)) {
    return {
      payload: createEmptyPayload(),
      invalidLineCount: 0,
      validationIssues: ['payload-not-object'],
    };
  }

  const validationIssues: RobottyRecentMessagesValidationIssue[] = [];
  const rawMessages = value.messages;
  const messages: string[] = [];
  let invalidLineCount = 0;

  if (!Object.prototype.hasOwnProperty.call(value, 'messages')) {
    validationIssues.push('messages-missing');
  } else if (!Array.isArray(rawMessages)) {
    validationIssues.push('messages-not-array');
  } else {
    for (const rawMessage of rawMessages) {
      if (typeof rawMessage === 'string') {
        messages.push(rawMessage);
      } else {
        invalidLineCount += 1;
      }
    }
  }

  const error = readNullableStringField(
    value,
    'error',
    'error-not-nullable-string',
    validationIssues,
  );
  const errorCode = readNullableStringField(
    value,
    'error_code',
    'error-code-not-nullable-string',
    validationIssues,
  );

  return {
    payload: {
      messages,
      error,
      errorCode,
    },
    invalidLineCount,
    validationIssues,
  };
}

function createEmptyPayload(): RobottyRecentMessagesPayload {
  return {
    messages: [],
    error: null,
    errorCode: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNullableStringField(
  value: Record<string, unknown>,
  key: string,
  issue: RobottyRecentMessagesValidationIssue,
  validationIssues: RobottyRecentMessagesValidationIssue[],
): string | null {
  const fieldValue = value[key];

  if (fieldValue === undefined || fieldValue === null) {
    return null;
  }

  if (typeof fieldValue === 'string') {
    return fieldValue;
  }

  validationIssues.push(issue);

  return null;
}
