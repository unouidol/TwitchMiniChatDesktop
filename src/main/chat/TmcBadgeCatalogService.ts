import { createHash } from 'node:crypto';
import type { TmcAuthSession } from '../auth/TmcAuthSessionStore';
import { isTwitchBadgeImage, readChatBadges, type TmcBadgeCatalog, type TmcBadgeImage, type TmcBadgeRequest } from '../../shared/chat/TmcChatBadges';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const safeFailureReasons = new Set(['Badge provider unavailable.', 'Invalid badge response.', 'Invalid badge identity.',
  'Invalid badge channel.', 'Invalid badge sets.', 'Invalid badge versions.', 'Invalid badge version.',
  'Invalid badge metadata identity.', 'Invalid badge title.', 'Empty badge title.', 'Oversized badge title.',
  'Invalid badge image URL.', 'Duplicate or excessive badges.', 'Badge catalog exceeds bounds.']);

/** Owns public badge definitions; credentials and provider decisions stay in main. */
export class TmcBadgeCatalogService {
  private readonly cache = new Map<string, { expires: number; catalog: TmcBadgeCatalog }>();
  private readonly pending = new Map<string, Promise<TmcBadgeCatalog>>();
  constructor(private readonly active: () => TmcAuthSession | null) {}

  async getCatalog(request: TmcBadgeRequest): Promise<TmcBadgeCatalog> {
    const session = this.active();
    if (!session || session.profileId !== request.profileId) throw new Error('Chat account changed.');
    if (!request.profileId || request.profileId.length > 256 || !/^[a-z0-9_-]{1,64}$/.test(request.channel)) throw new Error('Invalid badge request.');
    const key = `${session.profileId}:${createHash('sha256').update(`${session.userId}:${session.accessToken}`).digest('hex')}:${request.channel}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.catalog;
    let loading = this.pending.get(key);
    if (!loading) {
      if (this.pending.size >= 4) return { ...request, badges: [], status: 'unavailable' };
      loading = this.load(session, request).then((catalog) => {
        this.cache.delete(key);
        this.cache.set(key, { catalog, expires: Date.now() + (catalog.status === 'ready' ? 1800000 : 30000) });
        while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
        return catalog;
      }).finally(() => this.pending.delete(key));
      this.pending.set(key, loading);
    }
    const result = await loading;
    this.assertCurrent(session);
    return result;
  }

  private assertCurrent(session: TmcAuthSession): void {
    const current = this.active();
    if (!current || current.profileId !== session.profileId || current.userId !== session.userId || current.accessToken !== session.accessToken) throw new Error('Chat account changed.');
  }

  private async load(session: TmcAuthSession, request: TmcBadgeRequest): Promise<TmcBadgeCatalog> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let stage = 'identity validation';
    let responseStatus: number | null = null;
    const json = async (url: string, clientId?: string): Promise<Record<string, unknown>> => {
      const response = await fetch(url, { signal: controller.signal, redirect: 'error', headers: clientId
        ? { Authorization: `Bearer ${session.accessToken}`, 'Client-Id': clientId } : { Authorization: `OAuth ${session.accessToken}` } });
      responseStatus = response.status;
      if (!response.ok) { await response.body?.cancel(); throw new Error('Badge provider unavailable.'); }
      const value: unknown = await response.json();
      this.assertCurrent(session);
      if (!object(value)) throw new Error('Invalid badge response.');
      return value;
    };
    try {
      const validation = await json('https://id.twitch.tv/oauth2/validate');
      if (validation.user_id !== session.userId || typeof validation.client_id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(validation.client_id)) throw new Error('Invalid badge identity.');
      const clientId = validation.client_id;
      stage = 'channel identity'; responseStatus = null;
      const users = await json(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(request.channel)}`, clientId);
      if (!Array.isArray(users.data) || users.data.length !== 1 || !object(users.data[0]) || users.data[0].login !== request.channel ||
          typeof users.data[0].id !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(users.data[0].id)) throw new Error('Invalid badge channel.');
      stage = 'global definitions'; responseStatus = null;
      const global = parseCatalog(await json('https://api.twitch.tv/helix/chat/badges/global', clientId));
      stage = 'channel definitions'; responseStatus = null;
      const channel = parseCatalog(await json(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${encodeURIComponent(users.data[0].id)}`, clientId));
      const merged = new Map(global.map((badge) => [`${badge.setId}/${badge.version}`, badge]));
      for (const badge of channel) merged.set(`${badge.setId}/${badge.version}`, badge);
      if (merged.size > 10000) throw new Error('Badge catalog exceeds bounds.');
      return { ...request, badges: [...merged.values()], status: 'ready' };
    } catch (error) {
      this.assertCurrent(session);
      const reason = error instanceof Error && safeFailureReasons.has(error.message) ? error.message : 'Request failed.';
      console.warn('[TMC Chat] Badge icons unavailable; no text fallback.', { stage, responseStatus, deadlineExceeded: controller.signal.aborted, reason });
      return { ...request, badges: [], status: 'unavailable' };
    } finally { clearTimeout(timer); }
  }
}

function parseCatalog(value: Record<string, unknown>): TmcBadgeImage[] {
  if (!Array.isArray(value.data) || value.data.length > 2000) throw new Error('Invalid badge sets.');
  const result: TmcBadgeImage[] = [];
  const seen = new Set<string>();
  for (const set of value.data) {
    if (!object(set) || !Array.isArray(set.versions) || set.versions.length > 1000) throw new Error('Invalid badge versions.');
    for (const version of set.versions) {
      if (!object(version)) throw new Error('Invalid badge version.');
      const [identity] = readChatBadges([{ setId: set.set_id, version: version.id }]);
      if (!identity) throw new Error('Invalid badge metadata identity.');
      if (typeof version.title !== 'string') throw new Error('Invalid badge title.');
      if (!version.title.trim()) throw new Error('Empty badge title.');
      if (version.title.length > 200) throw new Error('Oversized badge title.');
      if (!isTwitchBadgeImage(version.image_url_2x)) throw new Error('Invalid badge image URL.');
      const key = `${identity.setId}/${identity.version}`;
      if (seen.has(key) || result.length >= 10000) throw new Error('Duplicate or excessive badges.');
      seen.add(key);
      result.push({ ...identity, title: version.title, imageUrl: version.image_url_2x });
    }
  }
  return result;
}
