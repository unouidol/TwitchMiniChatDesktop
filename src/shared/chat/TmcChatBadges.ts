export type TmcChatBadge = { readonly setId: string; readonly version: string };
export type TmcBadgeImage = TmcChatBadge & { readonly title: string; readonly imageUrl: string };
export type TmcBadgeRequest = { readonly profileId: string; readonly channel: string };
export type TmcBadgeCatalog = TmcBadgeRequest & { readonly badges: readonly TmcBadgeImage[]; readonly status: 'ready' | 'unavailable' };
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9_-]{1,256}$/i.test(value);

/** Accept only supplied IRC or structured badge identities, never inferred roles. */
export function readChatBadges(value: unknown): readonly TmcChatBadge[] {
  if (typeof value === 'string' && value.length > 2048) return [];
  const entries: unknown[] = typeof value === 'string' ? value.split(',').map((entry) => {
    const [setId, version, extra] = entry.split('/');
    return extra === undefined ? { setId, version } : null;
  }) : Array.isArray(value) ? value : [];
  if (entries.length > 20) return [];
  const seen = new Set<string>();
  const badges: TmcChatBadge[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const setId = 'setId' in entry ? entry.setId : 'set_id' in entry ? entry.set_id : null;
    const version = 'version' in entry ? entry.version : 'id' in entry ? entry.id : null;
    if (!identifier(setId) || !identifier(version) || seen.has(setId)) continue;
    seen.add(setId);
    badges.push({ setId, version });
    if (badges.length === 10) break;
  }
  return badges;
}

export function isTwitchBadgeImage(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\/static-cdn\.jtvnw\.net\/badges\/v1\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[123]$/i.test(value);
}
