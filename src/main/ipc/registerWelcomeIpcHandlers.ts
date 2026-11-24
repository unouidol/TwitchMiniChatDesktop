import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { assertLocalRenderer } from './assertLocalRenderer';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { JsonFileStore } from '../storage/JsonFileStore';
import { TmcWelcomeService } from '../welcome/TmcWelcomeService';

export function registerWelcomeIpcHandlers(): void {
  const version = app.getVersion();
  const welcome = new TmcWelcomeService(new JsonFileStore<unknown>(path.join(app.getPath('userData'), 'welcome.json'), null),
    version, app.isPackaged && /^\d+\.\d+\.\d+$/.test(version), (value) => {
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(TMC_IPC_CHANNELS.WELCOME_CHANGED, value);
    });
  ipcMain.handle(TMC_IPC_CHANNELS.WELCOME_START, (event) => { assertLocalRenderer(event); return welcome.start(); });
  ipcMain.handle(TMC_IPC_CHANNELS.WELCOME_GET, (event) => { assertLocalRenderer(event); return welcome.getState(); });
  ipcMain.handle(TMC_IPC_CHANNELS.WELCOME_CHECK, (event) => { assertLocalRenderer(event); return welcome.check(); });
  app.once('before-quit', () => welcome.dispose());
}
