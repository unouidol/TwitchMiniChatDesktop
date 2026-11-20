import { app, BrowserWindow, ipcMain } from 'electron';
import type { TmcRuntimeConfig } from '../config/TmcRuntimeConfig';
import { TmcAccountSessionRegistry } from '../accounts/TmcAccountSessionRegistry';
import { TmcAccountStore } from '../accounts/TmcAccountStore';
import { TmcActiveAccountStore } from '../accounts/TmcActiveAccountStore';
import { TmcAuthBrokerClient, TmcDesktopSessionRestoreError } from '../auth/TmcAuthBrokerClient';
import { TmcAuthSessionStore } from '../auth/TmcAuthSessionStore';
import { TmcAccountChannelStore } from '../channels/TmcAccountChannelStore';
import {
  TmcSecureAuthSessionStore,
  type TmcSecureDesktopAuthSession,
} from '../auth/TmcSecureAuthSessionStore';
import { TmcPcgSessionHoldManager } from '../pcg/TmcPcgSessionHoldManager';
import { TmcPcgSessionManager } from '../pcg/TmcPcgSessionManager';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { registerAccountIpcHandlers } from './registerAccountIpcHandlers';
import { syncAuthSessionStore } from '../accounts/TmcAccountRemovalService';
import { registerAccountChannelIpcHandlers } from './registerAccountChannelIpcHandlers';
import { registerAuthIpcHandlers } from './registerAuthIpcHandlers';
import { registerBackendIpcHandlers } from './registerBackendIpcHandlers';
import { registerChatIpcHandlers } from './registerChatIpcHandlers';
import { registerPcgIpcHandlers } from './registerPcgIpcHandlers';
import { registerSettingsIpcHandlers } from './registerSettingsIpcHandlers';
import { registerEmoteIpcHandlers } from './registerEmoteIpcHandlers';
import { TmcEmoteCatalogService } from '../chat/TmcEmoteCatalogService';
import { TmcUserColorService } from '../chat/TmcUserColorService';
import { registerUserColorIpcHandlers } from './registerUserColorIpcHandlers';
import { registerChatLinkIpcHandlers } from './registerChatLinkIpcHandlers';
import { chatAttention } from '../../shared/chat/TmcChatAttention';
import { TmcBadgeCatalogService } from '../chat/TmcBadgeCatalogService';
import { registerBadgeIpcHandlers } from './registerBadgeIpcHandlers';
import { TmcPlayerManager } from '../player/TmcPlayerManager';
import { registerPlayerIpcHandlers } from './registerPlayerIpcHandlers';
import { JsonFileStore } from '../storage/JsonFileStore';
import path from 'node:path';

/**
 * Registers application-level Inter-Process Communication handlers.
 *
 * TMC Desktop exposes only explicit actions to the renderer instead of generic
 * Node.js access. Keep this file as a registry and move larger feature handlers
 * into dedicated files.
 */
export async function registerIpcHandlers(
  runtimeConfig: TmcRuntimeConfig,
): Promise<{ player: TmcPlayerManager }> {
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

  const emoteCatalog = new TmcEmoteCatalogService(() => accountRegistry.getActiveSession(),
    new JsonFileStore<unknown>(path.join(app.getPath('userData'), 'tmc-emote-favorites.json'), { version: 1, profiles: [] }));
  registerEmoteIpcHandlers(emoteCatalog);
  registerUserColorIpcHandlers(new TmcUserColorService(() => accountRegistry.getActiveSession()));
  registerChatLinkIpcHandlers();
  registerBadgeIpcHandlers(new TmcBadgeCatalogService(() => accountRegistry.getActiveSession()));
  const chatController = registerChatIpcHandlers(runtimeConfig, accountRegistry, (message) => ({
    ...message,
    ...(message.isSelf && message.id.startsWith('local-self-') ? { fragments: emoteCatalog.outgoingFragments(message) } : {}),
    attention: chatAttention({ ...message, author: message.username }, accountRegistry.getActiveSession()),
  }),
    (profileId, message) => emoteCatalog.recordSent(profileId, message));
  registerAccountIpcHandlers(accountRegistry, authSessionStore, {
    runtimeConfig,
    secureAuthSessionStore,
    chatController,
  });
  registerAccountChannelIpcHandlers(accountRegistry, accountChannelStore);
  registerAuthIpcHandlers(
    runtimeConfig,
    authSessionStore,
    accountRegistry,
    secureAuthSessionStore,
  );
  registerPcgIpcHandlers({
    pcgSessionManager,
    pcgSessionHoldManager,
    accountRegistry,
    accountChannelStore,
  });
  registerSettingsIpcHandlers();
  registerBackendIpcHandlers(runtimeConfig, authSessionStore, accountRegistry);
  const player = new TmcPlayerManager(() => accountRegistry.getActiveSession()?.profileId || null, (status) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(TMC_IPC_CHANNELS.PLAYER_CHANGED, status);
  });
  registerPlayerIpcHandlers(player);
  return { player };
}

async function restoreSavedDesktopSessions(
  runtimeConfig: TmcRuntimeConfig,
  authSessionStore: TmcAuthSessionStore,
  secureAuthSessionStore: TmcSecureAuthSessionStore,
  accountRegistry: TmcAccountSessionRegistry,
): Promise<void> {
  let savedSessions: readonly TmcSecureDesktopAuthSession[];
  try {
    savedSessions = await secureAuthSessionStore.loadSessions();
  } catch {
    console.warn('[TMC Auth] Saved authentication could not be read; stored data retained.');
    return;
  }
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

    if (restoredSession.profileId !== savedSession.profileId ||
      restoredSession.userId !== savedSession.userId) {
      throw new TmcDesktopSessionRestoreError('identity-mismatch');
    }
    try {
      await secureAuthSessionStore.saveSession(restoredSession);
    } catch {
      console.warn('[TMC Auth] Restored authentication could not be saved; account not activated and stored data retained.');
      return;
    }
    await accountRegistry.addOrUpdateSession(restoredSession, {
      makeActive: false,
    });
  } catch (error) {
    const reason = error instanceof TmcDesktopSessionRestoreError ? error.reason : 'unavailable';
    console.warn(`[TMC Auth] Saved desktop session was not restored (${reason}); saved authentication retained.`);
  }
}
