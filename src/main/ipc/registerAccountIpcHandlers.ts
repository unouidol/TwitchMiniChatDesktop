import { ipcMain } from 'electron';
import type {
  TmcAccountListResult,
  TmcActiveAccountResult,
  TmcRemoveLocalAccountRequest,
  TmcSetActiveAccountRequest,
} from '../../shared/accounts/TmcAccountModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import type { TmcAccountSessionRegistry } from '../accounts/TmcAccountSessionRegistry';
import { TmcAuthBrokerClient } from '../auth/TmcAuthBrokerClient';
import type { TmcAuthSessionStore } from '../auth/TmcAuthSessionStore';
import type { TmcSecureAuthSessionStore } from '../auth/TmcSecureAuthSessionStore';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';
import type { TmcChatIpcController } from './registerChatIpcHandlers';

/**
 * Registers account-related Inter-Process Communication handlers.
 */
export function registerAccountIpcHandlers(
  accountRegistry: TmcAccountSessionRegistry,
  authSessionStore: TmcAuthSessionStore,
  options: {
    readonly runtimeConfig?: TmcRuntimeConfig;
    readonly secureAuthSessionStore?: TmcSecureAuthSessionStore;
    readonly chatController?: TmcChatIpcController;
  } = {},
): void {
  ipcMain.handle(
    TMC_IPC_CHANNELS.ACCOUNT_LIST,
    async (): Promise<TmcAccountListResult> => {
      return accountRegistry.listAccounts();
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.ACCOUNT_GET_ACTIVE,
    async (): Promise<TmcActiveAccountResult> => {
      return accountRegistry.getActiveAccountResult();
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.ACCOUNT_SET_ACTIVE,
    async (
      _event,
      request: TmcSetActiveAccountRequest,
    ): Promise<TmcActiveAccountResult> => {
      const result = await accountRegistry.setActiveAccount(request.profileId);
      syncAuthSessionStore(authSessionStore, accountRegistry);

      return result;
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.ACCOUNT_REMOVE_LOCAL,
    async (
      _event,
      request: TmcRemoveLocalAccountRequest,
    ): Promise<TmcAccountListResult> => {
      const profileId = readProfileId(request);
      const activeProfileId = accountRegistry.getActiveAccountResult().activeProfileId;
      const wasActiveAccount = activeProfileId === profileId;
      const savedSession = options.secureAuthSessionStore
        ? await options.secureAuthSessionStore.findSession(profileId)
        : null;

      if (
        savedSession?.desktopSessionToken &&
        options.runtimeConfig &&
        options.secureAuthSessionStore
      ) {
        const authBrokerClient = new TmcAuthBrokerClient(
          options.runtimeConfig,
          authSessionStore,
        );

        try {
          await authBrokerClient.logoutDesktopSession(
            savedSession.desktopSessionToken,
          );
        } catch {
          console.warn('[TMC Accounts] Remote desktop logout failed; local removal continues.');
        }
      }

      if (options.secureAuthSessionStore) {
        await options.secureAuthSessionStore.removeAccount(profileId);
      }

      await accountRegistry.removeAccount(profileId);

      if (wasActiveAccount) {
        options.chatController?.disconnectLive();
      }

      await accountRegistry.ensureActiveAccount();
      syncAuthSessionStore(authSessionStore, accountRegistry);

      return accountRegistry.listAccounts();
    },
  );
}

/**
 * Mirrors the active account into the compatibility auth session store.
 */
export function syncAuthSessionStore(
  authSessionStore: TmcAuthSessionStore,
  accountRegistry: TmcAccountSessionRegistry,
): void {
  const activeSession = accountRegistry.getActiveSession();

  if (activeSession) {
    authSessionStore.setSession(activeSession);
    return;
  }

  authSessionStore.clearSession();
}

function readProfileId(request: TmcRemoveLocalAccountRequest): string {
  const profileId = request?.profileId?.trim();

  if (!profileId) {
    throw new Error('Account profileId is required.');
  }

  return profileId;
}