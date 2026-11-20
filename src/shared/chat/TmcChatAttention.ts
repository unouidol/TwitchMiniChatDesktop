import type { TmcChatReply } from './TmcChatReply';

export type TmcChatAttention = { readonly profileId: string; readonly kind: 'mention' | 'reply' };
type MentionAccount = { readonly profileId: string; readonly username: string; readonly userId: string };

/** Main calls this pure classifier with its initiating account, never credentials. */
export function chatAttention(message: { readonly text: string; readonly author: string; readonly isSelf?: boolean; readonly reply?: TmcChatReply },
  account: MentionAccount | null): TmcChatAttention | undefined {
  if (!account || !account.profileId || !/^[a-z0-9_-]{1,64}$/i.test(account.username) || message.isSelf ||
      message.author.trim().toLowerCase() === account.username.toLowerCase()) return undefined;
  const reply = message.reply;
  const repliesToAccount = reply?.parentUserId ? reply.parentUserId === account.userId
    : reply?.parentUsername?.toLowerCase() === account.username.toLowerCase();
  if (repliesToAccount) return { profileId: account.profileId, kind: 'reply' };
  const mention = new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}_@-])@?${account.username}(?=$|[^\\p{L}\\p{N}\\p{M}_@-])`, 'iu');
  for (const [word] of message.text.matchAll(/\S+/gu)) {
    if (/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/i.test(word)) continue;
    if (mention.test(word)) return { profileId: account.profileId, kind: 'mention' };
  }
  return undefined;
}
