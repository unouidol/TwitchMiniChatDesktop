import { ipcMain } from 'electron';
import type {
  TmcActiveAccountChannelStateResult,
  TmcSetLastChannelRequest,
  TmcToggleFavoriteChannelRequest,
} from '../../shared/channels/TmcAccountChannelModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import type { TmcAccountSessionRegistry } from '../accounts/TmcAccountSessionRegistry';
import {
  TMC_GUEST_CHANNEL_PROFILE_ID,
  TmcAccountChannelStore,
} from '../channels/TmcAccountChannelStore';

/**
 * Registers per-account channel-state Inter-Process Communication handlers.
 */
export function registerAccountChannelIpcHandlers(
  accountRegistry: TmcAccountSessionRegistry,
  channelStore: TmcAccountChannelStore,
): void {
  ipcMain.handle(
    TMC_IPC_CHANNELS.ACCOUNT_CHANNELS_GET_ACTIVE_STATE,
    async (): Promise<TmcActiveAccountChannelStateResult> => {
      return {
        state: await channelStore.getState(readActiveProfileId(accountRegistry)),
      };
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.ACCOUNT_CHANNELS_SET_LAST,
    async (
      _event,
      request: TmcSetLastChannelRequest,
    ): Promise<TmcActiveAccountChannelStateResult> => {
      return {
        state: await channelStore.setLastChannel(
          readActiveProfileId(accountRegistry),
          request.channel,
        ),
      };
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.ACCOUNT_CHANNELS_ADD_RECENT,
    async (
      _event,
      request: TmcSetLastChannelRequest,
    ): Promise<TmcActiveAccountChannelStateResult> => {
      return {
        state: await channelStore.addRecentChannel(
          readActiveProfileId(accountRegistry),
          request.channel,
        ),
      };
    },
  );

  ipcMain.handle(
    TMC_IPC_CHANNELS.ACCOUNT_CHANNELS_TOGGLE_FAVORITE,
    async (
      _event,
      request: TmcToggleFavoriteChannelRequest,
    ): Promise<TmcActiveAccountChannelStateResult> => {
      return {
        state: await channelStore.toggleFavoriteChannel(
          readActiveProfileId(accountRegistry),
          request.channel,
        ),
      };
    },
  );
}

function readActiveProfileId(accountRegistry: TmcAccountSessionRegistry): string {
  return accountRegistry.getActiveSession()?.profileId || TMC_GUEST_CHANNEL_PROFILE_ID;
}