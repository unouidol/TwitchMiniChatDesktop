import path from 'node:path';
import {
  DEFAULT_TMC_DESKTOP_SETTINGS,
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
  private readonly jsonStore: JsonFileStore<TmcDesktopSettings>;

  /**
   * Creates a settings store under Electron userData.
   */
  constructor(userDataPath: string) {
    this.jsonStore = new JsonFileStore<TmcDesktopSettings>(
      path.join(userDataPath, 'settings.json'),
      DEFAULT_TMC_DESKTOP_SETTINGS,
    );
  }

  /**
   * Loads settings from disk and normalizes them.
   */
  async loadSettings(): Promise<TmcDesktopSettings> {
    const settings = await this.jsonStore.read();
    const normalizedSettings = normalizeSettings(settings);

    if (normalizedSettings !== settings) {
      await this.jsonStore.write(normalizedSettings);
    }

    return normalizedSettings;
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

    const currentSettings = await this.loadSettings();

    const recentChannels = [
      normalizedChannel,
      ...currentSettings.recentChannels.filter(
        (recentChannel) => recentChannel !== normalizedChannel,
      ),
    ].slice(0, MAX_RECENT_CHANNELS);

    const nextSettings: TmcDesktopSettings = {
      currentChannel: normalizedChannel,
      recentChannels,
    };

    await this.jsonStore.write(nextSettings);

    return nextSettings;
  }
}

/**
 * Normalizes loaded settings and protects the renderer from malformed JSON.
 */
function normalizeSettings(settings: TmcDesktopSettings): TmcDesktopSettings {
  const currentChannel = normalizeChannel(
    settings.currentChannel || DEFAULT_TMC_DESKTOP_SETTINGS.currentChannel,
  );

  const recentChannels = Array.from(
    new Set(
      [currentChannel, ...(settings.recentChannels || [])]
        .map((channel) => normalizeChannel(channel))
        .filter(Boolean),
    ),
  ).slice(0, MAX_RECENT_CHANNELS);

  return {
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
