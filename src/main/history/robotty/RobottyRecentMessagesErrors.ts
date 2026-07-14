/**
 * Stable error categories exposed by the isolated Robotty HTTP client.
 */
export type RobottyRecentMessagesClientErrorKind =
  | 'invalid_request'
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid_json'
  | 'invalid_payload';

/**
 * Sanitized, discriminable error produced by RobottyRecentMessagesClient.
 */
export class RobottyRecentMessagesClientError extends Error {
  readonly kind: RobottyRecentMessagesClientErrorKind;
  readonly status?: number;
  readonly statusText?: string;

  constructor(
    kind: RobottyRecentMessagesClientErrorKind,
    status?: number,
    statusText?: string,
  ) {
    super(buildErrorMessage(kind, status, statusText));
    this.name = 'RobottyRecentMessagesClientError';
    this.kind = kind;
    this.status = status;
    this.statusText = statusText;
  }
}

function buildErrorMessage(
  kind: RobottyRecentMessagesClientErrorKind,
  status?: number,
  statusText?: string,
): string {
  switch (kind) {
    case 'invalid_request':
      return 'Robotty recent messages request is invalid.';
    case 'timeout':
      return 'Robotty recent messages request timed out.';
    case 'network':
      return 'Robotty recent messages network request failed.';
    case 'http':
      return statusText
        ? `Robotty recent messages request failed with HTTP ${status} ${statusText}.`
        : `Robotty recent messages request failed with HTTP ${status}.`;
    case 'invalid_json':
      return 'Robotty recent messages response is not valid JSON.';
    case 'invalid_payload':
      return 'Robotty recent messages response payload is invalid.';
  }
}
