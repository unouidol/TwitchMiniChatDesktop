import { ipcMain } from 'electron';

import type {
  FinalizeTwitchLoginRequest,
  FinalizeTwitchLoginResult,
  StartTwitchLoginRequest,
} from '../../shared/auth/TmcAuthModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import type { TmcAccountSessionRegistry } from '../accounts/TmcAccountSessionRegistry';
import { syncAuthSessionStore } from '../accounts/TmcAccountRemovalService';
import { TmcAuthBrokerClient } from '../auth/TmcAuthBrokerClient';
import type { TmcAuthSessionStore } from '../auth/TmcAuthSessionStore';
import type { TmcSecureAuthSessionStore } from '../auth/TmcSecureAuthSessionStore';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';

/**
 * Registers authentication-related Inter-Process Communication handlers.
 */
export function registerAuthIpcHandlers(
  runtimeConfig: TmcRuntimeConfig,
  authSessionStore: TmcAuthSessionStore,
  accountRegistry: TmcAccountSessionRegistry,
  secureAuthSessionStore: TmcSecureAuthSessionStore,
): void {
  const authBrokerClient = new TmcAuthBrokerClient(
    runtimeConfig,
    authSessionStore,
  );

  ipcMain.handle(TMC_IPC_CHANNELS.AUTH_GET_STATUS, async () => {
    return authBrokerClient.getStatus();
  });

  ipcMain.handle(TMC_IPC_CHANNELS.AUTH_GET_SESSION, async () => {
    return authBrokerClient.getStatus();
  });

  ipcMain.handle(
    TMC_IPC_CHANNELS.AUTH_OPEN_TWITCH_LOGIN,
    async (_event, request: StartTwitchLoginRequest | undefined) => {
      return authBrokerClient.startTwitchLogin(
        normalizeStartTwitchLoginRequest(request),
      );
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.AUTH_FINALIZE_TWITCH_LOGIN,
    async (
      _event,
      request: FinalizeTwitchLoginRequest | string | undefined,
    ): Promise<FinalizeTwitchLoginResult> => {
      const loginToken = readLoginTokenFromFinalizeRequest(request);

      const session = await authBrokerClient.finalizeLoginToken(loginToken);

      if (!session?.desktopSessionToken) {
        throw new Error('Desktop session unavailable. Please sign in again.');
      }

      try {
        await secureAuthSessionStore.saveSession(session);
      } catch (cause) {
        // Electron can log thrown IPC errors including their causes. Never attach decrypted content.
        const safeCause = cause instanceof SyntaxError
          ? new SyntaxError('Saved authentication format is invalid.')
          : new Error('Encrypted authentication persistence failed.');
        throw new Error('Saved authentication could not be updated. Existing saved data was retained.', { cause: safeCause });
      }
      await accountRegistry.addOrUpdateSession(session);
      syncAuthSessionStore(authSessionStore, accountRegistry);

      return {
        success: true,
        profileId: session.profileId,
        username: session.username,
        userId: session.userId,
        message: `Logged in as ${session.username}.`,
      };
    },
  );
}

/**
 * Normalizes a Twitch login start request from renderer code.
 */
function normalizeStartTwitchLoginRequest(
  request: StartTwitchLoginRequest | undefined,
): StartTwitchLoginRequest {
  return {
    ...(request ?? {}),
    source: request?.source?.trim() || 'main-window',
  };
}

/**
 * Reads a one-time login token from either the new string API or the older object API.
 */
function readLoginTokenFromFinalizeRequest(
  request: FinalizeTwitchLoginRequest | string | undefined,
): string {
  if (typeof request === 'string') {
    return request.trim();
  }

  return request?.loginToken?.trim() ?? '';
}