import { createHash } from 'node:crypto';
import type { TmcAuthSession } from '../auth/TmcAuthSessionStore';
import type { TmcCatalogEmote, TmcEmoteCatalog } from '../../shared/chat/TmcEmoteCatalog';
import { TMC_EMOTE_FAVORITES_LIMIT } from '../../shared/chat/TmcEmoteCatalog';
import type { JsonFileStore } from '../storage/JsonFileStore';
import { twitchEmoteImageUrl, type TmcMessageFragment } from '../../shared/chat/TmcMessageContent';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): string => typeof value === 'string' ? value : '';
export class TmcEmoteCatalogError extends Error {
  constructor(readonly reason: 'unavailable' | 'invalid-response' | 'http' | 'stale', readonly status?: number) {
    super('The emote catalog could not be loaded. Please try again.');
    this.name = 'TmcEmoteCatalogError';
  }
}
const unavailable = (): Error => new TmcEmoteCatalogError('invalid-response');
const fingerprint = (session: TmcAuthSession): string =>
  createHash('sha256').update(`${session.userId}:${session.accessToken}`).digest('hex');
type CatalogContent = Omit<TmcEmoteCatalog, 'favorites' | 'favoritesSaveFailed'>;
type FavoriteEmote = { readonly id: string; readonly name: string };
type FavoriteProfile = { readonly profileId: string; readonly emotes: readonly FavoriteEmote[] };
type FavoriteData = { readonly version: 1; readonly profiles: readonly FavoriteProfile[] };

/** Single owner of bounded, temporary catalogs, isolated by account/token/channel. */
export class TmcEmoteCatalogService {
  private readonly cache = new Map<string, { key: string; expires: number; catalog: CatalogContent }>();
  private readonly pending = new Map<string, Promise<CatalogContent>>();
  private favoriteQueue: Promise<void> = Promise.resolve();
  private readonly favoriteFailures = new Set<string>();

  constructor(private readonly getActiveSession: () => TmcAuthSession | null,
    private readonly favoriteStore: Pick<JsonFileStore<unknown>, 'read' | 'write'>) {}

  async getCatalog(profileId: string, channel: string): Promise<TmcEmoteCatalog> {
    const session = this.getActiveSession();
    if (!session || session.profileId !== profileId) throw new Error('Sign in with the selected account to load emotes.');
    const key = `${profileId}:${fingerprint(session)}:${channel}`;
    const cached = this.cache.get(profileId);
    if (cached?.key === key && cached.expires > Date.now()) return this.withFavorites(cached.catalog, session);
    const pending = this.pending.get(key);
    if (pending) return this.withFavorites(await pending, session);
    if (this.pending.size >= 4) throw new Error('An emote catalog is already loading. Please try again shortly.');
    const operation = this.load(session, channel).then((catalog) => {
      this.assertCurrent(session);
      this.cache.delete(profileId);
      this.cache.set(profileId, { key, expires: Date.now() + 300000, catalog });
      while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
      return catalog;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, operation);
    return this.withFavorites(await operation, session);
  }

  /** Called only after a successful explicit IRC write, with initiating identity. */
  async recordSent(profileId: string, message: { readonly channel: string; readonly text: string }): Promise<void> {
    const session = this.getActiveSession();
    if (!session || session.profileId !== profileId) return;
    // Remember known IDs even after the display cache expires. Saving a favorite
    // grants no entitlement: rendering it rechecks availability in a fresh catalog.
    const fragments = this.recognizeOutgoing(message, false);
    const used: FavoriteEmote[] = (fragments || []).flatMap((fragment) => fragment.kind === 'emote' ? [{ id: fragment.id, name: fragment.text }] : []);
    if (!used.length) return;
    const operation = this.favoriteQueue.then(async () => {
      const data = await this.readFavorites();
      const previous = data.profiles.find((profile) => profile.profileId === profileId);
      const emotes = [...previous?.emotes || []];
      let changed = false;
      for (const emote of used) {
        if (emotes.some((item) => item.id === emote.id)) continue;
        emotes.unshift(emote);
        emotes.length = Math.min(emotes.length, TMC_EMOTE_FAVORITES_LIMIT);
        changed = true;
      }
      if (changed) {
        if (!previous && data.profiles.length >= 1000) throw new Error('Emote favorites profile limit reached.');
        const next: FavoriteData = { version: 1, profiles: [
          ...data.profiles.filter((profile) => profile.profileId !== profileId), { profileId, emotes },
        ] };
        await this.favoriteStore.write(next);
      }
      this.favoriteFailures.delete(profileId);
    });
    this.favoriteQueue = operation.catch(() => {
      this.favoriteFailures.add(profileId);
      console.warn('[TMC Emotes] Message sent, but emote favorites could not be saved. Stored data retained.');
    });
    await this.favoriteQueue;
  }

  private async readFavorites(): Promise<FavoriteData> {
    const value = await this.favoriteStore.read();
    if (!record(value) || value.version !== 1 || !Array.isArray(value.profiles) || value.profiles.length > 1000) throw new Error('Invalid emote favorites data.');
    const profiles: FavoriteProfile[] = [];
    const profileIds = new Set<string>();
    for (const item of value.profiles) {
      if (!record(item) || typeof item.profileId !== 'string' || !item.profileId || item.profileId.length > 256 || profileIds.has(item.profileId) ||
          !Array.isArray(item.emotes) || item.emotes.length > TMC_EMOTE_FAVORITES_LIMIT) throw new Error('Invalid emote favorites profile.');
      const emotes: FavoriteEmote[] = [];
      const ids = new Set<string>();
      for (const emote of item.emotes) {
        if (!record(emote) || typeof emote.id !== 'string' || !twitchEmoteImageUrl(emote.id) || ids.has(emote.id) ||
            typeof emote.name !== 'string' || !emote.name || emote.name.length > 128 || /\s/.test(emote.name)) throw new Error('Invalid favorite emote.');
        emotes.push({ id: emote.id, name: emote.name });
        ids.add(emote.id);
      }
      profiles.push({ profileId: item.profileId, emotes });
      profileIds.add(item.profileId);
    }
    return { version: 1, profiles };
  }

  private async withFavorites(catalog: CatalogContent, session: TmcAuthSession): Promise<TmcEmoteCatalog> {
    await this.favoriteQueue;
    let favorites: TmcCatalogEmote[] = [];
    try {
      const data = await this.readFavorites();
      const available = new Map(catalog.emotes.filter((emote) => emote.availability === 'available').map((emote) => [emote.id, emote]));
      favorites = (data.profiles.find((profile) => profile.profileId === session.profileId)?.emotes || []).map((emote) =>
        available.get(emote.id) || { ...emote, category: 'personal', availability: catalog.personalPermission ? 'locked' : 'unknown' });
    } catch {
      this.favoriteFailures.add(session.profileId);
    }
    this.assertCurrent(session);
    return { ...catalog, favorites, favoritesSaveFailed: this.favoriteFailures.has(session.profileId) };
  }

  outgoingFragments(message: { readonly channel: string; readonly text: string }): readonly TmcMessageFragment[] | undefined {
    return this.recognizeOutgoing(message, true);
  }

  private recognizeOutgoing(message: { readonly channel: string; readonly text: string }, requireFresh: boolean): readonly TmcMessageFragment[] | undefined {
    const session = this.getActiveSession();
    if (!session) return undefined;
    const entry = this.cache.get(session.profileId);
    if (!entry || (requireFresh && entry.expires <= Date.now()) || entry.key !== `${session.profileId}:${fingerprint(session)}:${message.channel}`) return undefined;
    const usable = new Map(entry.catalog.emotes.filter((emote) => emote.availability === 'available')
      .map((emote) => [emote.name, emote]));
    return Array.from(message.text.matchAll(/\s+|\S+/gu), ([text]): TmcMessageFragment => {
      const emote = usable.get(text);
      return emote ? { kind: 'emote', provider: 'twitch', id: emote.id, text } : { kind: 'text', text };
    });
  }

  private assertCurrent(session: TmcAuthSession): void {
    const current = this.getActiveSession();
    if (!current || current.profileId !== session.profileId || current.userId !== session.userId || current.accessToken !== session.accessToken) {
      throw new TmcEmoteCatalogError('stale');
    }
  }

  private async load(session: TmcAuthSession, channel: string): Promise<CatalogContent> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const json = async (url: string, clientId?: string): Promise<RecordValue> => {
      let response: Response;
      try {
        response = await fetch(url, { redirect: 'error', signal: controller.signal, headers: clientId
          ? { Authorization: `Bearer ${session.accessToken}`, 'Client-Id': clientId }
          : { Authorization: `OAuth ${session.accessToken}` } });
        if (!response.ok) {
          await response.body?.cancel();
          throw new TmcEmoteCatalogError('http', response.status);
        }
        const value: unknown = await response.json();
        this.assertCurrent(session);
        if (!record(value)) throw unavailable();
        return value;
      } catch (error) {
        if (error instanceof TmcEmoteCatalogError) throw error;
        throw new TmcEmoteCatalogError('unavailable');
      }
    };
    try {
      const validation = await json('https://id.twitch.tv/oauth2/validate');
      const clientId = string(validation.client_id);
      if (!clientId || clientId.length > 128 || string(validation.user_id) !== session.userId ||
          !Array.isArray(validation.scopes) || !validation.scopes.every((scope) => typeof scope === 'string')) throw unavailable();
      const personalPermission = validation.scopes.includes('user:read:emotes');
      const get = (path: string) => json(`https://api.twitch.tv/helix/${path}`, clientId);
      const global = this.readEmotes(await get('chat/emotes/global'), 'global', 'available');
      const users = await get(`users?login=${encodeURIComponent(channel)}`);
      if (!Array.isArray(users.data) || users.data.length !== 1 || !record(users.data[0]) || !string(users.data[0].id)) {
        throw new Error('The selected Twitch channel could not be found.');
      }
      const broadcasterId = string(users.data[0].id);
      const channelEmotes = this.readEmotes(await get(`chat/emotes?broadcaster_id=${encodeURIComponent(broadcasterId)}`), 'channel', 'unknown');
      const personal: TmcCatalogEmote[] = [];
      let cursor = '';
      const cursors = new Set<string>();
      if (personalPermission) {
        do {
          if (cursors.size >= 50 || cursors.has(cursor)) throw unavailable();
          cursors.add(cursor);
          const page = await get(`chat/emotes/user?user_id=${encodeURIComponent(session.userId)}&broadcaster_id=${encodeURIComponent(broadcasterId)}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`);
          personal.push(...this.readEmotes(page, 'personal', 'available'));
          if (personal.length > 10000) throw unavailable();
          if (page.pagination !== undefined && !record(page.pagination)) throw unavailable();
          if (record(page.pagination) && page.pagination.cursor !== undefined && typeof page.pagination.cursor !== 'string') throw unavailable();
          cursor = record(page.pagination) ? string(page.pagination.cursor) : '';
          if (cursor.length > 2048) throw unavailable();
        } while (cursor);
      }
      const availableIds = new Set([...personal, ...global].map((emote) => emote.id));
      const globalIds = new Set(global.map((emote) => emote.id));
      const catalog: CatalogContent = { profileId: session.profileId, channel, personalPermission, emotes: [
        ...new Map(personal.filter((emote) => !globalIds.has(emote.id)).map((emote) => [emote.id, emote])).values(),
        ...channelEmotes.map((emote): TmcCatalogEmote => ({ ...emote, availability: availableIds.has(emote.id)
          ? 'available' : personalPermission ? 'locked' : 'unknown' })),
        ...global,
      ] };
      this.assertCurrent(session);
      return catalog;
    } finally { clearTimeout(timer); }
  }

  private readEmotes(value: RecordValue, category: TmcCatalogEmote['category'], availability: TmcCatalogEmote['availability']): TmcCatalogEmote[] {
    if (!Array.isArray(value.data) || value.data.length > 10000) throw unavailable();
    const result = new Map<string, TmcCatalogEmote>();
    for (const item of value.data) {
      if (!record(item)) throw unavailable();
      const id = string(item.id);
      const name = string(item.name);
      if (!twitchEmoteImageUrl(id) || !name || name.length > 128 || /\s/.test(name)) throw unavailable();
      result.set(id, { id, name, category, availability });
    }
    return [...result.values()];
  }
}
