/** Only server-issued Twitch message UUIDs may become reply targets. */
export function isTwitchMessageId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}

export type TmcChatReply = {
  readonly parentUserId?: string;
  readonly parentUsername?: string;
  readonly parentMessageId: string;
  readonly parentDisplayName: string;
  readonly parentText: string;
};

/** Bound previews, reject malformed metadata and keep all content plain text. */
export function readChatReply(value: unknown): TmcChatReply | undefined {
  if (!value || typeof value !== 'object' || !('parentMessageId' in value) || !isTwitchMessageId(value.parentMessageId) ||
      !('parentDisplayName' in value) || typeof value.parentDisplayName !== 'string' || !value.parentDisplayName || value.parentDisplayName.length > 128 ||
      !('parentText' in value) || typeof value.parentText !== 'string' || value.parentText.length > 2000) return undefined;
  if ('parentUserId' in value && value.parentUserId !== undefined && (typeof value.parentUserId !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(value.parentUserId))) return undefined;
  if ('parentUsername' in value && value.parentUsername !== undefined && (typeof value.parentUsername !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(value.parentUsername))) return undefined;
  return { parentMessageId: value.parentMessageId, parentDisplayName: value.parentDisplayName, parentText: value.parentText,
    ...('parentUserId' in value && typeof value.parentUserId === 'string' ? { parentUserId: value.parentUserId } : {}),
    ...('parentUsername' in value && typeof value.parentUsername === 'string' ? { parentUsername: value.parentUsername } : {}) };
}
