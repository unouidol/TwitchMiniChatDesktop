import { ipcMain } from 'electron';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { registerBackendIpcHandlers } from './registerBackendIpcHandlers';

/**
 * Registers application-level Inter-Process Communication handlers.
 *
 * TMC Desktop exposes only explicit actions to the renderer instead of generic
 * Node.js access. Keep this file as a registry and move larger feature handlers
 * into dedicated files.
 */
export function registerIpcHandlers(): void {
  ipcMain.handle(TMC_IPC_CHANNELS.appPing, async () => {
    return 'pong';
  });

  registerBackendIpcHandlers();
}
