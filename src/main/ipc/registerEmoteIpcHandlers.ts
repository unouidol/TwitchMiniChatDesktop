import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import type { TmcEmoteCatalogService } from '../chat/TmcEmoteCatalogService';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

export function registerEmoteIpcHandlers(service: TmcEmoteCatalogService): void {
  ipcMain.handle(TMC_IPC_CHANNELS.EMOTE_CATALOG, (event: IpcMainInvokeEvent, request: unknown) => {
    const expected = MAIN_WINDOW_VITE_DEV_SERVER_URL || pathToFileURL(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)).href;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== new URL(expected).href) {
      throw new Error('Untrusted emote catalog sender.');
    }
    if (!request || typeof request !== 'object' || !('profileId' in request) || typeof request.profileId !== 'string' ||
        !request.profileId || request.profileId.length > 256 || !('channel' in request) || typeof request.channel !== 'string' ||
        !/^[a-z0-9_-]{1,64}$/.test(request.channel)) throw new Error('Invalid emote catalog request.');
    return service.getCatalog(request.profileId, request.channel);
  });
}
