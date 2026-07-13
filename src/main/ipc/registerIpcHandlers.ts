import { app, BrowserWindow, ipcMain } from 'electron';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';
import { TmcAccountSessionRegistry } from '../accounts/TmcAccountSessionRegistry';
import { TmcAccountStore } from '../accounts/TmcAccountStore';
import { TmcActiveAccountStore } from '../accounts/TmcActiveAccountStore';
import { TmcAuthBrokerClient } from '../auth/TmcAuthBrokerClient';
import { TmcAuthSessionStore } from '../auth/TmcAuthSessionStore';
import { TmcAccountChannelStore } from '../channels/TmcAccountChannelStore';
import {
  TmcSecureAuthSessionStore,
  type TmcSecureDesktopAuthSession,
} from '../auth/TmcSecureAuthSessionStore';
import { TmcPcgSessionHoldManager } from '../pcg/TmcPcgSessionHoldManager';
import { TmcPcgSessionManager } from '../pcg/TmcPcgSessionManager';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import {
  registerAccountIpcHandlers,
  syncAuthSessionStore,
} from './registerAccountIpcHandlers';
import { registerAccountChannelIpcHandlers } from './registerAccountChannelIpcHandlers';
import { registerAuthIpcHandlers } from './registerAuthIpcHandlers';
import { registerBackendIpcHandlers } from './registerBackendIpcHandlers';
import { registerChatIpcHandlers } from './registerChatIpcHandlers';
import { registerPcgIpcHandlers } from './registerPcgIpcHandlers';
import { registerSettingsIpcHandlers } from './registerSettingsIpcHandlers';

/**
 * Registers application-level Inter-Process Communication handlers.
 *
 * TMC Desktop exposes only explicit actions to the renderer instead of generic
 * Node.js access. Keep this file as a registry and move larger feature handlers
 * into dedicated files.
 */
export async function registerIpcHandlers(
  runtimeConfig: TmcRuntimeConfig,
): Promise<void> {
  const authSessionStore = new TmcAuthSessionStore();
  const secureAuthSessionStore = new TmcSecureAuthSessionStore();
  const accountRegistry = new TmcAccountSessionRegistry(
    new TmcAccountStore(),
    new TmcActiveAccountStore(),
  );

  const accountChannelStore = new TmcAccountChannelStore(app.getPath('userData'));
  const pcgSessionHoldManager = new TmcPcgSessionHoldManager();
  const pcgSessionManager = new TmcPcgSessionManager(runtimeConfig, (status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(TMC_IPC_CHANNELS.PCG_STATUS_CHANGED, status);
      }
    }
  });

  await accountRegistry.initialize();
  await secureAuthSessionStore.loadSession();
  await restoreSavedDesktopSessions(
    runtimeConfig,
    authSessionStore,
    secureAuthSessionStore,
    accountRegistry,
  );
  await accountRegistry.ensureActiveAccount();
  syncAuthSessionStore(authSessionStore, accountRegistry);

  ipcMain.handle(TMC_IPC_CHANNELS.appPing, async () => {
    return 'pong';
  });

  registerAccountIpcHandlers(accountRegistry, authSessionStore);
  registerAccountChannelIpcHandlers(accountRegistry, accountChannelStore);
  registerAuthIpcHandlers(
    runtimeConfig,
    authSessionStore,
    accountRegistry,
    secureAuthSessionStore,
  );
  registerChatIpcHandlers(runtimeConfig, accountRegistry);
  registerPcgIpcHandlers({
    pcgSessionManager,
    pcgSessionHoldManager,
    accountRegistry,
    accountChannelStore,
  });
  registerSettingsIpcHandlers(runtimeConfig);
  registerBackendIpcHandlers(runtimeConfig, authSessionStore);
}

async function restoreSavedDesktopSessions(
  runtimeConfig: TmcRuntimeConfig,
  authSessionStore: TmcAuthSessionStore,
  secureAuthSessionStore: TmcSecureAuthSessionStore,
  accountRegistry: TmcAccountSessionRegistry,
): Promise<void> {
  const savedSessions = await secureAuthSessionStore.loadSessions();
  const authBrokerClient = new TmcAuthBrokerClient(
    runtimeConfig,
    authSessionStore,
  );

  for (const savedSession of savedSessions) {
    await restoreOneDesktopSession(
      savedSession,
      authBrokerClient,
      secureAuthSessionStore,
      accountRegistry,
    );
  }
}

async function restoreOneDesktopSession(
  savedSession: TmcSecureDesktopAuthSession,
  authBrokerClient: TmcAuthBrokerClient,
  secureAuthSessionStore: TmcSecureAuthSessionStore,
  accountRegistry: TmcAccountSessionRegistry,
): Promise<void> {
  try {
    const restoredSession = await authBrokerClient.restoreDesktopSession(
      savedSession.desktopSessionToken,
    );

    await accountRegistry.addOrUpdateSession(restoredSession, {
      makeActive: false,
    });

    if (restoredSession.desktopSessionToken) {
      await secureAuthSessionStore.saveSession(restoredSession);
    }
  } catch {
    await secureAuthSessionStore.deleteSession(savedSession.profileId);
    await accountRegistry.removeAccount(savedSession.profileId);
    console.warn('[TMC Auth] Saved desktop session could not be restored.');
  }
}