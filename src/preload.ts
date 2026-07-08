import { contextBridge, ipcRenderer } from 'electron';

/**
 * Public application metadata exposed to the renderer through a safe bridge.
 */
type TmcAppInfo = {
  readonly appName: string;
  readonly platform: NodeJS.Platform;
};

/**
 * Safe API exposed to the local renderer.
 *
 * Remote content such as Twitch or PCG must never receive direct access to
 * Node.js, Electron, file system APIs, or unrestricted Inter-Process Communication.
 */
const tmcApi = {
  /**
   * Returns basic application information for the local UI.
   */
  getAppInfo: (): TmcAppInfo => ({
    appName: 'Twitch Mini Chat Desktop',
    platform: process.platform,
  }),

  /**
   * Sends a diagnostic ping to the main process.
   */
  ping: async (): Promise<string> => {
    return ipcRenderer.invoke('tmc:ping');
  },
};

contextBridge.exposeInMainWorld('tmc', tmcApi);
