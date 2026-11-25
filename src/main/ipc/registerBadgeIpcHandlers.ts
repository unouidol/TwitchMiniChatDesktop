import { ipcMain } from 'electron';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { assertLocalRenderer } from './assertLocalRenderer';
import type { TmcBadgeCatalogService } from '../chat/TmcBadgeCatalogService';

export function registerBadgeIpcHandlers(service: TmcBadgeCatalogService): void {
  ipcMain.handle(TMC_IPC_CHANNELS.CHAT_BADGES, (event, value: unknown) => {
    assertLocalRenderer(event);
    if (!value || typeof value !== 'object' || !('profileId' in value) || typeof value.profileId !== 'string' || !value.profileId || value.profileId.length > 256 ||
        !('channel' in value) || typeof value.channel !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(value.channel)) throw new Error('Invalid badge request.');
    return service.getCatalog({ profileId: value.profileId, channel: value.channel });
  });
}
