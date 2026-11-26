import path from 'node:path';
import type { TmcAccountChannelState } from '../../shared/channels/TmcAccountChannelModels';
import { JsonFileStore } from '../storage/JsonFileStore';

/**
 * Guest profile key used before a Twitch account is active.
 */
export const TMC_GUEST_CHANNEL_PROFILE_ID = '__guest__';

/**
 * Maximum number of recent channels kept per account.
 */
const MAX_RECENT_CHANNELS = 20;

type PersistedAccountChannelState = {
  /**
   * Per-profile channel states.
   */
  readonly states: Readonly<Record<string, TmcAccountChannelState>>;
};

const DEFAULT_CHANNEL_STORE: PersistedAccountChannelState = {
  states: {},
};

/**
 * Stores non-secret per-account channel state.
 */
export class TmcAccountChannelStore {
  private readonly jsonStore: JsonFileStore<unknown>;
  private pending: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.jsonStore = new JsonFileStore<unknown>(
      path.join(userDataPath, 'tmc-account-channels.json'), DEFAULT_CHANNEL_STORE,
    );
  }

  async getState(profileId: string): Promise<TmcAccountChannelState> {
    const id = normalizeProfileId(profileId);
    return this.serialize(async () => normalizeState((await this.loadStore()).states[id], id));
  }

  async setLastChannel(profileId: string, channel: string): Promise<TmcAccountChannelState> {
    const normalizedChannel = normalizeRequiredChannel(channel);
    return this.update(profileId, (current) => ({ ...current, lastChannel: normalizedChannel, updatedAt: Date.now() }));
  }

  async addRecentChannel(profileId: string, channel: string): Promise<TmcAccountChannelState> {
    const normalizedChannel = normalizeRequiredChannel(channel);
    return this.update(profileId, (current) => ({ ...current,
      recentChannels: [normalizedChannel, ...current.recentChannels.filter((entry) => entry !== normalizedChannel)].slice(0, MAX_RECENT_CHANNELS),
      updatedAt: Date.now(),
    }));
  }

  async toggleFavoriteChannel(profileId: string, channel: string): Promise<TmcAccountChannelState> {
    const normalizedChannel = normalizeRequiredChannel(channel);
    return this.update(profileId, (current) => {
      const favorites = new Set(current.favoriteChannels);
      if (favorites.has(normalizedChannel)) favorites.delete(normalizedChannel); else favorites.add(normalizedChannel);
      return { ...current, favoriteChannels: [...favorites].sort(), updatedAt: Date.now() };
    });
  }

  private update(profileId: string, change: (current: TmcAccountChannelState) => TmcAccountChannelState): Promise<TmcAccountChannelState> {
    const id = normalizeProfileId(profileId);
    return this.serialize(async () => {
      const store = await this.loadStore();
      const next = change(normalizeState(store.states[id], id));
      await this.jsonStore.write({ states: { ...store.states, [id]: next } });
      return next;
    });
  }

  private serialize<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const result = this.pending.then(operation);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  private async loadStore(): Promise<PersistedAccountChannelState> {
    const value = await this.jsonStore.read();
    if (!isRecord(value) || !isRecord(value.states)) throw new Error('Channel preferences are invalid.');
    const states = new Map<string, TmcAccountChannelState>();
    for (const [profileId, raw] of Object.entries(value.states)) {
      if (!isRecord(raw) || (raw.lastChannel !== undefined && raw.lastChannel !== null && typeof raw.lastChannel !== 'string')) {
        throw new Error('Channel preferences are invalid.');
      }
      const id = normalizeProfileId(profileId);
      states.set(id, normalizeState({ profileId: id,
        lastChannel: typeof raw.lastChannel === 'string' ? raw.lastChannel : null,
        recentChannels: readChannelList(raw.recentChannels), favoriteChannels: readChannelList(raw.favoriteChannels),
        updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
      }, id));
    }
    return { states: Object.fromEntries(states) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readChannelList(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry: unknown): entry is string => typeof entry === 'string')) {
    throw new Error('Channel preferences are invalid.');
  }
  return value;
}

function normalizeState(
  state: TmcAccountChannelState | undefined,
  profileId: string,
): TmcAccountChannelState {
  const favoriteChannels = normalizeChannelList(state?.favoriteChannels || []).sort();
  const recentChannels = normalizeChannelList(state?.recentChannels || []).slice(
    0,
    MAX_RECENT_CHANNELS,
  );
  const lastChannel = state?.lastChannel
    ? normalizeChannel(state.lastChannel)
    : null;

  return {
    profileId,
    lastChannel: lastChannel || null,
    favoriteChannels,
    recentChannels,
    updatedAt: Number.isFinite(Number(state?.updatedAt))
      ? Number(state?.updatedAt)
      : 0,
  };
}

function normalizeChannelList(channels: readonly string[]): string[] {
  return Array.from(
    new Set(
      channels
        .map((channel) => normalizeChannel(channel))
        .filter((channel) => channel.length > 0),
    ),
  );
}

function normalizeRequiredChannel(channel: string): string {
  const normalizedChannel = normalizeChannel(channel);

  if (!normalizedChannel) {
    throw new Error('Channel name cannot be empty.');
  }

  return normalizedChannel;
}

function normalizeChannel(channel: string): string {
  return channel.trim().replace(/^#/, '').toLowerCase();
}

function normalizeProfileId(profileId: string): string {
  const normalizedProfileId = profileId.trim();

  return normalizedProfileId || TMC_GUEST_CHANNEL_PROFILE_ID;
}