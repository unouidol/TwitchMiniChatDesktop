import { ipcMain } from 'electron';
import { assertLocalRenderer } from './assertLocalRenderer';
import { TMC_IPC_CHANNELS } from '../../shared/ipc/IpcChannels';
import { isTwitchLogin } from '../../shared/chat/TmcUserColors';
import type { TmcUserColorService } from '../chat/TmcUserColorService';

export function registerUserColorIpcHandlers(service: TmcUserColorService): void {
  ipcMain.handle(TMC_IPC_CHANNELS.CHAT_USER_COLORS, (event, request: unknown) => {
    assertLocalRenderer(event);
    if (!request || typeof request !== 'object' || !('profileId' in request) || typeof request.profileId !== 'string' ||
        !request.profileId || request.profileId.length > 256 || !('channel' in request) || typeof request.channel !== 'string' ||
        !/^[a-z0-9_-]{1,64}$/.test(request.channel) || !('usernames' in request) || !Array.isArray(request.usernames) ||
        request.usernames.length > 100 || !request.usernames.every(isTwitchLogin)) throw new Error('Invalid user color request.');
    return service.getColors({ profileId: request.profileId, channel: request.channel, usernames: request.usernames });
  });
}
