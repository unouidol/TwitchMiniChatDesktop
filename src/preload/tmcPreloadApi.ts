import { contextBridge, ipcRenderer } from 'electron';
import type { TmcAppInfo } from '../shared/app/TmcAppInfo';
import { TMC_IPC_CHANNELS } from '../shared/ipc/IpcChannels';

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
  };
}

/**
 * Installs the safe TMC preload bridge into the renderer global scope.
 */
export function installTmcPreloadApi(): void {
  contextBridge.exposeInMainWorld('tmc', createTmcPreloadApi());
}
