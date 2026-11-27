import type { TmcAccountListResult } from '../../shared/accounts/TmcAccountModels';
import type { TmcAuthBrokerClient } from '../auth/TmcAuthBrokerClient';
import type { TmcAuthSessionStore } from '../auth/TmcAuthSessionStore';
import type { TmcSecureAuthSessionStore } from '../auth/TmcSecureAuthSessionStore';
import type { TmcChatIpcController } from '../ipc/registerChatIpcHandlers';
import type { TmcTwitchWebSignOut } from '../web/TmcTwitchWebSignOut';
import type { TmcAccountSessionRegistry } from './TmcAccountSessionRegistry';

export class TmcAccountRemovalService {
  constructor(
    private readonly accountRegistry: TmcAccountSessionRegistry,
    private readonly authSessionStore: TmcAuthSessionStore,
    private readonly secureAuthSessionStore: TmcSecureAuthSessionStore,
    private readonly authBrokerClient: TmcAuthBrokerClient,
    private readonly chatController: TmcChatIpcController,
    private readonly twitchWebSignOut: TmcTwitchWebSignOut,
  ) {}

  async removeAccount(profileId: string): Promise<TmcAccountListResult> {
    const savedSession = await this.secureAuthSessionStore.deleteSession(profileId);

    // After the committed deletion, so a storage failure still rejects removal
    // with nothing changed; before registry removal, because web storage is
    // selected by registered account. A removed account must not leave PCG and
    // video signed in on this device.
    if (this.accountRegistry.listAccounts().accounts.some((account) => account.profileId === profileId)) {
      try {
        await this.twitchWebSignOut.signOut(profileId);
      } catch {
        console.warn('[TMC Accounts] Twitch web sign-out failed; account removed locally.');
      }
    }

    if (this.accountRegistry.getActiveAccountResult().activeProfileId === profileId) {
      this.chatController.disconnectLive();
    }

    await this.accountRegistry.removeAccount(profileId);
    syncAuthSessionStore(this.authSessionStore, this.accountRegistry);

    if (savedSession) {
      try {
        await this.authBrokerClient.logoutDesktopSession(savedSession.desktopSessionToken);
      } catch {
        console.warn('[TMC Accounts] Remote desktop logout failed; account removed locally.');
      }
    }

    return this.accountRegistry.listAccounts();
  }
}

export function syncAuthSessionStore(
  authSessionStore: TmcAuthSessionStore,
  accountRegistry: TmcAccountSessionRegistry,
): void {
  const selectedSession = accountRegistry.getActiveSession();

  if (selectedSession) {
    authSessionStore.setSession(selectedSession);
  } else {
    authSessionStore.clearSession();
  }
}
