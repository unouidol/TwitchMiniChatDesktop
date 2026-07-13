import { app, ipcMain } from 'electron';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';
import type { SetCurrentChannelRequest } from '../../shared/settings/TmcSettingsModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { TmcSettingsStore } from '../settings/TmcSettingsStore';

/**
 * Registers settings-related Inter-Process Communication handlers.
 */
export function registerSettingsIpcHandlers(
  _runtimeConfig: TmcRuntimeConfig,
): void {
  const settingsStore = new TmcSettingsStore(app.getPath('userData'));

  ipcMain.handle(TMC_IPC_CHANNELS.SETTINGS_GET, async () => {
    return settingsStore.loadSettings();
  });

  ipcMain.handle(
    TMC_IPC_CHANNELS.SETTINGS_SET_CURRENT_CHANNEL,
    async (_event, request: SetCurrentChannelRequest) => {
      if (!request || typeof request.channel !== 'string') {
        throw new Error('Invalid channel request.');
      }

      return settingsStore.setCurrentChannel(request.channel);
    },
  );
}
