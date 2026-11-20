/** IRC supplies a six-digit RGB color, or an empty tag when none is set. */
export function readTwitchNameColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : undefined;
}

const FALLBACK_COLORS = ['#60A5FA', '#F472B6', '#34D399', '#FBBF24', '#A78BFA', '#FB923C', '#22D3EE', '#E879F9'];

/** No user cache or network lookup; missing colors are stable across restarts. */
export function chatNameColor(username: string, color?: string): string {
  const supplied = readTwitchNameColor(color);
  if (supplied) return supplied;
  let hash = 0;
  for (const character of username.trim().toLowerCase()) hash = (Math.imul(hash, 31) + character.codePointAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}
