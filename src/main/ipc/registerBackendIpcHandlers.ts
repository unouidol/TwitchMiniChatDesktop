import { ipcMain } from 'electron';
import { TmcBackendClient } from '../backend/TmcBackendClient';
import { TMC_RUNTIME_CONFIG } from '../config/TmcRuntimeConfig';
import type { LoadHistoryRequest } from '../../shared/backend/TmcHistoryModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';

/**
 * Registers backend-related Inter-Process Communication handlers.
 */
export function registerBackendIpcHandlers(): void {
  const backendClient = new TmcBackendClient(TMC_RUNTIME_CONFIG);

  ipcMain.handle(
    TMC_IPC_CHANNELS.backendLoadHistory,
    async (_event, request: LoadHistoryRequest) => {
      return backendClient.loadHistory(request);
    },
  );
}
