import path from 'node:path';
import {
  DEFAULT_TMC_DESKTOP_SETTINGS,
  DEFAULT_CHAT_APPEARANCE, isChatAppearance, readChatAppearance, type TmcChatAppearance,
  type TmcDesktopSettings,
} from '../../shared/settings/TmcSettingsModels';
import { JsonFileStore } from '../storage/JsonFileStore';

/**
 * Maximum number of recent channels stored locally.
 */
const MAX_RECENT_CHANNELS = 12;

/**
 * Store for non-secret TMC Desktop settings.
 */
export class TmcSettingsStore {
  private readonly jsonStore: JsonFileStore<unknown>;
  private pending: Promise<void> = Promise.resolve();

  /**
   * Creates a settings store under Electron userData.
   */
  constructor(userDataPath: string) {
    this.jsonStore = new JsonFileStore<unknown>(
      path.join(userDataPath, 'settings.json'),
      DEFAULT_TMC_DESKTOP_SETTINGS,
    );
  }

  /**
   * Loads settings from disk and normalizes them.
   */
  async loadSettings(): Promise<TmcDesktopSettings> {
    return this.serialize(async () => normalizeSettings(await this.jsonStore.read()));
  }

  async setChatAppearance(value: unknown): Promise<TmcDesktopSettings> {
    if (!isChatAppearance(value)) throw new Error('Invalid chat appearance.');
    const appearance: TmcChatAppearance = { fontSize: value.fontSize, density: value.density, showTimestamps: value.showTimestamps };
    return this.serialize(async () => {
      const settings = normalizeSettings(await this.jsonStore.read());
      const next = { ...settings, chatAppearance: appearance };
      await this.jsonStore.write(next);
      return next;
    });
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  /**
   * Updates the selected channel and moves it to the top of recent channels.
   *
   * Throws when the requested channel is empty after normalization.
   */
  async setCurrentChannel(channel: string): Promise<TmcDesktopSettings> {
    const normalizedChannel = normalizeChannel(channel);

    if (normalizedChannel.length === 0) {
      throw new Error('Channel name cannot be empty.');
    }

    return this.serialize(async () => {
    const currentSettings = normalizeSettings(await this.jsonStore.read());

    const recentChannels = [
      normalizedChannel,
      ...currentSettings.recentChannels.filter(
        (recentChannel) => recentChannel !== normalizedChannel,
      ),
    ].slice(0, MAX_RECENT_CHANNELS);

    const nextSettings: TmcDesktopSettings = {
      ...currentSettings,
      currentChannel: normalizedChannel,
      recentChannels,
    };

    await this.jsonStore.write(nextSettings);

    return nextSettings;
    });
  }
}

/**
 * Normalizes loaded settings and protects the renderer from malformed JSON.
 */
function normalizeSettings(value: unknown): TmcDesktopSettings {
  const settings = value && typeof value === 'object' ? value : {};
  const currentChannel = normalizeChannel(
    'currentChannel' in settings && typeof settings.currentChannel === 'string' && settings.currentChannel.trim()
      ? settings.currentChannel : DEFAULT_TMC_DESKTOP_SETTINGS.currentChannel,
  );

  const recentChannels = Array.from(
    new Set(
      [currentChannel, ...('recentChannels' in settings && Array.isArray(settings.recentChannels)
        ? settings.recentChannels.filter((channel): channel is string => typeof channel === 'string') : [])]
        .map((channel) => normalizeChannel(channel))
        .filter(Boolean),
    ),
  ).slice(0, MAX_RECENT_CHANNELS);

  return {
    chatAppearance: 'chatAppearance' in settings ? readChatAppearance(settings.chatAppearance) : DEFAULT_CHAT_APPEARANCE,
    currentChannel,
    recentChannels:
      recentChannels.length > 0
        ? recentChannels
        : DEFAULT_TMC_DESKTOP_SETTINGS.recentChannels,
  };
}

/**
 * Normalizes a Twitch channel name for local settings.
 */
function normalizeChannel(channel: string): string {
  return channel.trim().replace(/^#/, '').toLowerCase();
}
