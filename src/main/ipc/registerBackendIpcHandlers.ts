import { ipcMain } from 'electron';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';
import { TmcBackendClient } from '../backend/TmcBackendClient';
import type { TmcAuthSessionStore } from '../auth/TmcAuthSessionStore';
import type { LoadHistoryRequest } from '../../shared/backend/TmcHistoryModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { TmcBackendHistoryProvider } from '../history/TmcBackendHistoryProvider';
import { TmcHistoryLoadService } from '../history/TmcHistoryLoadService';
import type { TmcAccountSessionRegistry } from '../accounts/TmcAccountSessionRegistry';
import { chatAttention } from '../../shared/chat/TmcChatAttention';
import { assertLocalRenderer } from './assertLocalRenderer';

/**
 * Registers backend-related Inter-Process Communication handlers.
 */
export function registerBackendIpcHandlers(
  runtimeConfig: TmcRuntimeConfig,
  authSessionStore: TmcAuthSessionStore,
  accountRegistry: TmcAccountSessionRegistry,
): void {
  const backendClient = new TmcBackendClient(runtimeConfig, authSessionStore);
  const historyProvider = new TmcBackendHistoryProvider(backendClient);
  const historyLoadService = new TmcHistoryLoadService(historyProvider);

  ipcMain.handle(
    TMC_IPC_CHANNELS.backendLoadHistory,
    async (event, request: LoadHistoryRequest) => {
      assertLocalRenderer(event);
      if (!request || typeof request.channel !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(request.channel) ||
          typeof request.seconds !== 'number' || !Number.isFinite(request.seconds)) throw new Error('Invalid history request.');
      const session = accountRegistry.getActiveSession();
      const result = await historyLoadService.loadHistory(request);
      const current = accountRegistry.getActiveSession();
      if (current?.profileId !== session?.profileId || current?.userId !== session?.userId ||
          current?.accessToken !== session?.accessToken || current?.username !== session?.username) throw new Error('Chat account changed.');
      return { ...result, messages: result.messages.map((message) => ({ ...message,
        attention: chatAttention({ text: message.text, author: message.user }, session),
      })) };
    },
  );
}
