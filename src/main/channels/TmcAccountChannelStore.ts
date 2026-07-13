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
  private readonly jsonStore: JsonFileStore<PersistedAccountChannelState>;

  /**
   * Creates a per-account channel store under Electron userData.
   */
  constructor(userDataPath: string) {
    this.jsonStore = new JsonFileStore<PersistedAccountChannelState>(
      path.join(userDataPath, 'tmc-account-channels.json'),
      DEFAULT_CHANNEL_STORE,
    );
  }

  /**
   * Returns the channel state for a profile identifier.
   */
  async getState(profileId: string): Promise<TmcAccountChannelState> {
    const store = await this.loadStore();
    const normalizedProfileId = normalizeProfileId(profileId);

    return normalizeState(store.states[normalizedProfileId], normalizedProfileId);
  }

  /**
   * Sets the last selected channel for a profile.
   */
  async setLastChannel(
    profileId: string,
    channel: string,
  ): Promise<TmcAccountChannelState> {
    const normalizedChannel = normalizeRequiredChannel(channel);
    const currentState = await this.getState(profileId);
    const nextState: TmcAccountChannelState = {
      ...currentState,
      lastChannel: normalizedChannel,
      updatedAt: Date.now(),
    };

    await this.saveState(nextState);

    return nextState;
  }

  /**
   * Adds a channel to the recent list for a profile.
   */
  async addRecentChannel(
    profileId: string,
    channel: string,
  ): Promise<TmcAccountChannelState> {
    const normalizedChannel = normalizeRequiredChannel(channel);
    const currentState = await this.getState(profileId);
    const recentChannels = [
      normalizedChannel,
      ...currentState.recentChannels.filter(
        (recentChannel) => recentChannel !== normalizedChannel,
      ),
    ].slice(0, MAX_RECENT_CHANNELS);
    const nextState: TmcAccountChannelState = {
      ...currentState,
      recentChannels,
      updatedAt: Date.now(),
    };

    await this.saveState(nextState);

    return nextState;
  }

  /**
   * Toggles a channel in the favorite list for a profile.
   */
  async toggleFavoriteChannel(
    profileId: string,
    channel: string,
  ): Promise<TmcAccountChannelState> {
    const normalizedChannel = normalizeRequiredChannel(channel);
    const currentState = await this.getState(profileId);
    const favoriteSet = new Set(currentState.favoriteChannels);

    if (favoriteSet.has(normalizedChannel)) {
      favoriteSet.delete(normalizedChannel);
    } else {
      favoriteSet.add(normalizedChannel);
    }

    const nextState: TmcAccountChannelState = {
      ...currentState,
      favoriteChannels: Array.from(favoriteSet).sort(),
      updatedAt: Date.now(),
    };

    await this.saveState(nextState);

    return nextState;
  }

  private async loadStore(): Promise<PersistedAccountChannelState> {
    try {
      const store = await this.jsonStore.read();
      const normalizedStates: Record<string, TmcAccountChannelState> = {};

      for (const [profileId, state] of Object.entries(store.states || {})) {
        const normalizedProfileId = normalizeProfileId(profileId);
        normalizedStates[normalizedProfileId] = normalizeState(
          state,
          normalizedProfileId,
        );
      }

      return { states: normalizedStates };
    } catch {
      return DEFAULT_CHANNEL_STORE;
    }
  }

  private async saveState(state: TmcAccountChannelState): Promise<void> {
    const store = await this.loadStore();

    await this.jsonStore.write({
      states: {
        ...store.states,
        [state.profileId]: normalizeState(state, state.profileId),
      },
    });
  }
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