import { ipcMain } from 'electron';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';
import { TmcBackendClient } from '../backend/TmcBackendClient';
import type { LoadHistoryRequest } from '../../shared/backend/TmcHistoryModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';

/**
 * Registers backend-related Inter-Process Communication handlers.
 */
export function registerBackendIpcHandlers(
  runtimeConfig: TmcRuntimeConfig,
): void {
  const backendClient = new TmcBackendClient(runtimeConfig);

  ipcMain.handle(
    TMC_IPC_CHANNELS.backendLoadHistory,
    async (_event, request: LoadHistoryRequest) => {
      return backendClient.loadHistory(request);
    },
  );
}
