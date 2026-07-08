import { app, ipcMain } from 'electron';
import type { SetCurrentChannelRequest } from '../../shared/settings/TmcSettingsModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { TmcSettingsStore } from '../settings/TmcSettingsStore';

/**
 * Registers settings-related Inter-Process Communication handlers.
 */
export function registerSettingsIpcHandlers(): void {
  const settingsStore = new TmcSettingsStore(app.getPath('userData'));

  ipcMain.handle(TMC_IPC_CHANNELS.settingsGet, async () => {
    return settingsStore.loadSettings();
  });

  ipcMain.handle(
    TMC_IPC_CHANNELS.settingsSetCurrentChannel,
    async (_event, request: SetCurrentChannelRequest) => {
      return settingsStore.setCurrentChannel(request.channel);
    },
  );
}
