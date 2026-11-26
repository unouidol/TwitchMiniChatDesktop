import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { TmcAccountChannelState, TmcActiveAccountChannelStateResult, TmcSetLastChannelRequest } from '../../shared/channels/TmcAccountChannelModels';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import type { TmcAccountSessionRegistry } from '../accounts/TmcAccountSessionRegistry';
import { TMC_GUEST_CHANNEL_PROFILE_ID, type TmcAccountChannelStore } from '../channels/TmcAccountChannelStore';
import { assertLocalRenderer } from './assertLocalRenderer';

/** Validated local requests retain their initiating identity across queued storage. */
export function registerAccountChannelIpcHandlers(accountRegistry: TmcAccountSessionRegistry, channelStore: TmcAccountChannelStore): void {
  const currentProfile = (): string => accountRegistry.getActiveSession()?.profileId || TMC_GUEST_CHANNEL_PROFILE_ID;
  const assertCurrent = (profileId: string): void => {
    if (currentProfile() !== profileId) throw new Error('Channel account changed.');
  };
  ipcMain.handle(TMC_IPC_CHANNELS.ACCOUNT_CHANNELS_GET_ACTIVE_STATE, async (event): Promise<TmcActiveAccountChannelStateResult> => {
    assertLocalRenderer(event);
    const profileId = currentProfile();
    const state = await channelStore.getState(profileId);
    assertCurrent(profileId);
    return { state };
  });
  const mutation = (operation: (profileId: string, channel: string) => Promise<TmcAccountChannelState>) =>
    async (event: IpcMainInvokeEvent, value: unknown): Promise<TmcActiveAccountChannelStateResult> => {
      assertLocalRenderer(event);
      const request = readRequest(value);
      assertCurrent(request.profileId);
      const state = await operation(request.profileId, request.channel);
      assertCurrent(request.profileId);
      return { state };
    };
  ipcMain.handle(TMC_IPC_CHANNELS.ACCOUNT_CHANNELS_SET_LAST, mutation((profileId, channel) => channelStore.setLastChannel(profileId, channel)));
  ipcMain.handle(TMC_IPC_CHANNELS.ACCOUNT_CHANNELS_ADD_RECENT, mutation((profileId, channel) => channelStore.addRecentChannel(profileId, channel)));
  ipcMain.handle(TMC_IPC_CHANNELS.ACCOUNT_CHANNELS_TOGGLE_FAVORITE, mutation((profileId, channel) => channelStore.toggleFavoriteChannel(profileId, channel)));
}

function readRequest(value: unknown): TmcSetLastChannelRequest {
  if (!value || typeof value !== 'object' || !('profileId' in value) || typeof value.profileId !== 'string' ||
      !value.profileId.length || value.profileId.length > 256 || !('channel' in value) || typeof value.channel !== 'string' || value.channel.length > 128) {
    throw new Error('Invalid channel preference request.');
  }
  const channel = value.channel.trim().replace(/^#/, '').toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(channel)) throw new Error('Invalid channel preference request.');
  return { profileId: value.profileId, channel };
}
