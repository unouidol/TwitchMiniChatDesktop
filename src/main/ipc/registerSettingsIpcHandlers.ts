import { app, ipcMain } from 'electron';
import type { SetCurrentChannelRequest } from '../../shared/settings/TmcSettingsModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { TmcSettingsStore } from '../settings/TmcSettingsStore';
import { assertLocalRenderer } from './assertLocalRenderer';

/**
 * Registers settings-related Inter-Process Communication handlers.
 */
export function registerSettingsIpcHandlers(): void {
  const settingsStore = new TmcSettingsStore(app.getPath('userData'));

  ipcMain.handle(TMC_IPC_CHANNELS.SETTINGS_GET, async (event) => {
    assertLocalRenderer(event);
    return settingsStore.loadSettings();
  });

  ipcMain.handle(TMC_IPC_CHANNELS.SETTINGS_SET_CHAT_APPEARANCE, async (event, value: unknown) => {
    assertLocalRenderer(event);
    return settingsStore.setChatAppearance(value);
  });

  ipcMain.handle(
    TMC_IPC_CHANNELS.SETTINGS_SET_CURRENT_CHANNEL,
    async (event, request: SetCurrentChannelRequest) => {
      assertLocalRenderer(event);
      if (!request || typeof request.channel !== 'string') {
        throw new Error('Invalid channel request.');
      }

      return settingsStore.setCurrentChannel(request.channel);
    },
  );
}
