import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  TmcAccountListResult,
  TmcActiveAccountResult,
  TmcSetActiveAccountRequest,
} from '../../shared/accounts/TmcAccountModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import type { TmcAccountSessionRegistry } from '../accounts/TmcAccountSessionRegistry';
import { TmcAuthBrokerClient } from '../auth/TmcAuthBrokerClient';
import type { TmcAuthSessionStore } from '../auth/TmcAuthSessionStore';
import type { TmcSecureAuthSessionStore } from '../auth/TmcSecureAuthSessionStore';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';
import type { TmcChatIpcController } from './registerChatIpcHandlers';
import {
  TmcAccountRemovalService,
  syncAuthSessionStore,
} from '../accounts/TmcAccountRemovalService';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

/**
 * Registers account-related Inter-Process Communication handlers.
 */
export function registerAccountIpcHandlers(
  accountRegistry: TmcAccountSessionRegistry,
  authSessionStore: TmcAuthSessionStore,
  options: {
    readonly runtimeConfig: TmcRuntimeConfig;
    readonly secureAuthSessionStore: TmcSecureAuthSessionStore;
    readonly chatController: TmcChatIpcController;
  },
): void {
  const removalService = new TmcAccountRemovalService(
    accountRegistry,
    authSessionStore,
    options.secureAuthSessionStore,
    new TmcAuthBrokerClient(options.runtimeConfig, authSessionStore),
    options.chatController,
  );
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
      event: IpcMainInvokeEvent,
      request: unknown,
    ): Promise<TmcAccountListResult> => {
      assertTrustedSender(event);
      const profileId = readProfileId(request);
      return removalService.removeAccount(profileId);
    },
  );
}

function readProfileId(request: unknown): string {
  const profileId = request && typeof request === 'object' &&
    'profileId' in request && typeof request.profileId === 'string'
    ? request.profileId.trim()
    : '';

  if (!profileId) {
    throw new Error('Account profileId is required.');
  }

  return profileId;
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const expectedUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL || pathToFileURL(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  ).href;
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.webContents !== event.sender ||
    event.senderFrame !== event.sender.mainFrame ||
    event.senderFrame.url !== new URL(expectedUrl).href) {
    throw new Error('Untrusted account removal sender.');
  }
}
