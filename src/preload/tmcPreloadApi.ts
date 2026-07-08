import { contextBridge, ipcRenderer } from 'electron';
import type { TmcAppInfo } from '../shared/app/TmcAppInfo';
import type {
  LoadHistoryRequest,
  LoadHistoryResult,
} from '../shared/backend/TmcHistoryModels';
import type {
  SetCurrentChannelRequest,
  TmcDesktopSettings,
} from '../shared/settings/TmcSettingsModels';
import { TMC_IPC_CHANNELS } from '../shared/ipc/IpcChannels';

/**
 * Backend API exposed to the local renderer through the safe preload bridge.
 */
export type TmcBackendPreloadApi = {
  /**
   * Loads cached chat history through the Electron main process.
   */
  readonly loadHistory: (
    request: LoadHistoryRequest,
  ) => Promise<LoadHistoryResult>;
};

/**
 * Settings API exposed to the local renderer through the safe preload bridge.
 */
export type TmcSettingsPreloadApi = {
  /**
   * Loads non-secret local desktop settings.
   */
  readonly get: () => Promise<TmcDesktopSettings>;

  /**
   * Updates the current channel in local desktop settings.
   */
  readonly setCurrentChannel: (
    request: SetCurrentChannelRequest,
  ) => Promise<TmcDesktopSettings>;
};

/**
 * Safe API exposed to the local renderer.
 *
 * Keep this surface intentionally small. Remote content such as Twitch or
 * PokémonCommunityGame must never receive direct access to Node.js, Electron,
 * file system APIs, or unrestricted Inter-Process Communication.
 */
export type TmcPreloadApi = {
  /**
   * Returns basic application information for the local UI.
   */
  readonly getAppInfo: () => TmcAppInfo;

  /**
   * Sends a diagnostic ping to the Electron main process.
   */
  readonly ping: () => Promise<string>;

  /**
   * Backend operations available to the local UI.
   */
  readonly backend: TmcBackendPreloadApi;

  /**
   * Settings operations available to the local UI.
   */
  readonly settings: TmcSettingsPreloadApi;
};

/**
 * Creates the safe preload API exposed to the local renderer.
 */
function createTmcPreloadApi(): TmcPreloadApi {
  return {
    getAppInfo: (): TmcAppInfo => ({
      appName: 'Twitch Mini Chat Desktop',
      platform: process.platform,
    }),

    ping: async (): Promise<string> => {
      return ipcRenderer.invoke(TMC_IPC_CHANNELS.appPing);
    },

    backend: {
      loadHistory: async (
        request: LoadHistoryRequest,
      ): Promise<LoadHistoryResult> => {
        return ipcRenderer.invoke(TMC_IPC_CHANNELS.backendLoadHistory, request);
      },
    },

    settings: {
      get: async (): Promise<TmcDesktopSettings> => {
        return ipcRenderer.invoke(TMC_IPC_CHANNELS.settingsGet);
      },

      setCurrentChannel: async (
        request: SetCurrentChannelRequest,
      ): Promise<TmcDesktopSettings> => {
        return ipcRenderer.invoke(
          TMC_IPC_CHANNELS.settingsSetCurrentChannel,
          request,
        );
      },
    },
  };
}

/**
 * Installs the safe TMC preload bridge into the renderer global scope.
 */
export function installTmcPreloadApi(): void {
  contextBridge.exposeInMainWorld('tmc', createTmcPreloadApi());
}
