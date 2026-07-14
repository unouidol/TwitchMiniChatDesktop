import { ipcMain } from 'electron';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';
import { TmcBackendClient } from '../backend/TmcBackendClient';
import type { TmcAuthSessionStore } from '../auth/TmcAuthSessionStore';
import type { LoadHistoryRequest } from '../../shared/backend/TmcHistoryModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { TmcBackendHistoryProvider } from '../history/TmcBackendHistoryProvider';
import { TmcHistoryLoadService } from '../history/TmcHistoryLoadService';

/**
 * Registers backend-related Inter-Process Communication handlers.
 */
export function registerBackendIpcHandlers(
  runtimeConfig: TmcRuntimeConfig,
  authSessionStore: TmcAuthSessionStore,
): void {
  const backendClient = new TmcBackendClient(runtimeConfig, authSessionStore);
  const historyProvider = new TmcBackendHistoryProvider(backendClient);
  const historyLoadService = new TmcHistoryLoadService(historyProvider);

  ipcMain.handle(
    TMC_IPC_CHANNELS.backendLoadHistory,
    async (_event, request: LoadHistoryRequest) => {
      return historyLoadService.loadHistory(request);
    },
  );
}
